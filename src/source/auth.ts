import { posix } from 'node:path';
import type { Context } from './context.ts';
import { isFunction, memberName, property, str, unwrap, walk, type Module, type N } from './js.ts';
import { covers, fromMatcher } from './pattern.ts';
import type { AuthGuard, SourceRoute } from './types.ts';

const AUTH_PACKAGES = /^(next-auth|@auth\/|@clerk\/|@supabase\/(ssr|auth-helpers)|@kinde-oss\/|iron-session|better-auth|lucia|@lucia-auth\/|@workos-inc\/|@auth0\/|firebase\/auth|firebase-admin\/auth|@stackframe\/|@descope\/)/;
const READ = /(^|\.)(auth|getServerSession|getSession|currentUser|getUser|getCurrentUser|getToken|verifySession|validateRequest|validateSession|getAuth|getKindeServerSession|getServerAuthSession|getLoggedInUser|getUserFromSession|getIronSession|isAuthenticated|getClaims|useSession|useUser|useAuth|useSupabaseUser|useUserSession|useAuthState|useAuth0|getAuthSession)$/;
const READ_AND_DENY = /(^|\.)(requireUser|requireUserId|requireAuth|requireAdmin|requireRole|requireSession|requireLogin|ensureUser|ensureAuth|getUserOrRedirect|protect|redirectToSignIn|authenticate|withAuth|withPageAuthRequired|withApiAuthRequired)$/;
const DENY = /(^|\.)(redirect|permanentRedirect|notFound|unauthorized|forbidden|navigateTo|abortNavigation|redirectToSignIn|rewrite)$/;
const SESSION_COOKIE = /session|token|auth|jwt|sid|user/i;
const MEMBER_READ = /(^|\.)(locals|context|ctx)\.(user|session|auth|currentUser)$|^Astro\.locals\.(user|session|auth)$|\.auth\.(getUser|getSession|getClaims)\(\)$/;

interface Found {
	line: number;
	role: string | null;
	how: string;
	redirectTo?: string;
	prefixes: string[];
	/** Role checks that only run under a path test (`pathname.startsWith('/admin/') && user.role !== 'admin'`). */
	scoped?: { role: string; prefixes: string[] }[];
}

const SCOPE = new Set(['LogicalExpression', 'IfStatement', 'ConditionalExpression']);

/** Each role check's own path prefixes, from the nearest enclosing condition that tests the path. */
function scopedRoles(fn: N, mod: Module): { role: string; prefixes: string[] }[] {
	const out: { role: string; prefixes: string[] }[] = [];
	walk(fn, (n, ancestors) => {
		if (n.type !== 'BinaryExpression') return;
		const role = roleIn(n, mod);
		if (!role) return;
		for (const a of [...ancestors].reverse()) {
			if (!SCOPE.has(a.type)) continue;
			const prefixes = prefixesIn(a.type === 'LogicalExpression' ? a : a.test, mod);
			if (prefixes.length) {
				out.push({ role, prefixes });
				return;
			}
		}
	});
	return out;
}

function roleIn(fn: N, mod: Module): string | null {
	let role: string | null = null;
	walk(fn, (n) => {
		if (role) return false;
		if (n.type === 'BinaryExpression' && /^[!=]==?$/.test(n.operator)) {
			const [a, b] = [memberName(n.left), memberName(n.right)];
			const side = /\.(role|roles|type|plan|tier|permission)$|isAdmin$/i.test(a ?? '') ? n.right : /\.(role|roles|type|plan|tier|permission)$/i.test(b ?? '') ? n.left : undefined;
			const v = side && str(side, mod);
			if (v) role = v;
		}
		if (n.type === 'CallExpression') {
			const name = memberName(n.callee) ?? '';
			if (/\.(roles|permissions)\.includes$/.test(name) || /(^|\.)(requireRole|hasRole|checkRole|requirePermission)$/.test(name)) role = str(n.arguments[0], mod) ?? role;
			if (/(^|\.)has$/.test(name)) role = str(property(n.arguments[0], 'role'), mod) ?? str(property(n.arguments[0], 'permission'), mod) ?? role;
		}
		if (n.type === 'MemberExpression' && /\.isAdmin$/.test(memberName(n) ?? '')) role = 'admin';
	});
	return role;
}

function redirectIn(fn: N, mod: Module): string | undefined {
	let to: string | undefined;
	walk(fn, (n) => {
		if (to) return false;
		if (n.type !== 'CallExpression' && n.type !== 'NewExpression') return;
		const name = memberName(n.callee) ?? '';
		if (!/(^|\.)(redirect|permanentRedirect|navigateTo|redirectToSignIn)$/.test(name) && name !== 'URL') return;
		for (const a of n.arguments as N[]) {
			const v = str(a, mod) ?? str(property(a, 'to'), mod) ?? str(property(a, 'href'), mod) ?? str(property(a, 'path'), mod) ?? str(property(a, 'url'), mod);
			if (v?.startsWith('/')) {
				to = v.split('?')[0];
				return false;
			}
		}
	});
	return to;
}

function prefixesIn(fn: N, mod: Module): string[] {
	const out: string[] = [];
	walk(fn, (n) => {
		if (n.type === 'CallExpression') {
			const name = memberName(n.callee) ?? '';
			if (/pathname\.startsWith$|(^|\.)(url|path|pathname)\.startsWith$/.test(name)) {
				const v = str(n.arguments[0], mod);
				if (v) out.push(v);
			}
			if (/(^|\.)createRouteMatcher$/.test(name)) {
				const arr = unwrap(n.arguments[0]);
				if (arr?.type === 'ArrayExpression') for (const el of arr.elements as N[]) {
					const v = str(el, mod);
					if (v) out.push(fromMatcher(v));
				}
			}
		}
		if (n.type === 'BinaryExpression' && /^===?$/.test(n.operator) && /pathname$/.test(memberName(n.left) ?? '')) {
			const v = str(n.right, mod);
			if (v?.startsWith('/')) out.push(v);
		}
	});
	return out;
}

/** A guard in one function: an auth read and something that turns the visitor away. */
function guardInFunction(fn: N, mod: Module, authFile: boolean): Found | undefined {
	let read: N | undefined;
	let deny: N | undefined;
	let how = '';
	walk(fn, (n) => {
		if (n.type === 'CallExpression') {
			const name = memberName(n.callee) ?? '';
			const root = name.split(/[.(]/)[0]!;
			const fromAuth = mod.imports.has(root) && AUTH_PACKAGES.test(mod.imports.get(root)!.source);
			if (READ_AND_DENY.test(name)) {
				read ??= n;
				deny ??= n;
				how ||= `${name}()`;
			} else if (READ.test(name) || fromAuth || (/(^|\.)(cookies\.get|get)$/.test(name) && SESSION_COOKIE.test(str(n.arguments[0], mod) ?? ''))) {
				read ??= n;
				how ||= `${name}()`;
			}
			if (DENY.test(name) && (authFile || !/notFound$/.test(name))) deny ??= n;
			if (/(^|\.)(error|status|sendStatus)$/.test(name) && [401, 403].includes(Number(str(n.arguments[0], mod) ?? (n.arguments[0]?.type === 'Literal' ? n.arguments[0].value : NaN)))) deny ??= n;
		}
		if (n.type === 'MemberExpression' && MEMBER_READ.test(memberName(n) ?? '')) {
			read ??= n;
			how ||= memberName(n)!;
		}
		if (n.type === 'Property' && n.key?.name === 'status' && n.value?.type === 'Literal' && [401, 403].includes(n.value.value)) deny ??= n;
	});
	if (!read || !deny) {
		if (!(authFile && deny)) return undefined;
		how ||= 'auth middleware';
	}
	const scoped = scopedRoles(fn, mod);
	const role = roleIn(fn, mod);
	return { line: mod.line((read ?? deny)!.start), role: scoped.some((x) => x.role === role) ? null : role, how, redirectTo: redirectIn(fn, mod), prefixes: prefixesIn(fn, mod), ...(scoped.length ? { scoped } : {}) };
}

function guardInModule(mod: Module): Found | undefined {
	const authFile = [...mod.imports.values()].some((i) => AUTH_PACKAGES.test(i.source));
	const candidates: N[] = [];
	walk(mod.program, (n) => {
		if (isFunction(n)) candidates.push(n);
	});
	if (/\.astro$/.test(mod.file)) candidates.unshift(mod.program);
	for (const fn of candidates) {
		const g = guardInFunction(fn, mod, authFile);
		if (g) return g;
	}
	if (authFile) {
		const def = unwrap(mod.exports.get('default') ?? mod.exports.get('middleware') ?? mod.exports.get('proxy'));
		const callee = def?.type === 'CallExpression' ? memberName(def.callee) : def?.type === 'Identifier' ? def.name : undefined;
		if (callee && /auth|clerkMiddleware|withAuth|authMiddleware|authkitMiddleware/i.test(callee)) return { line: mod.line(def!.start), role: null, how: `${callee}()`, prefixes: [] };
	}
	return undefined;
}

function matchers(mod: Module): { include: string[]; exclude: string[] } {
	const config = mod.exports.get('config');
	const matcher = property(config, 'matcher');
	const include: string[] = [];
	const exclude: string[] = [];
	const values: N[] = matcher ? (unwrap(matcher)?.type === 'ArrayExpression' ? unwrap(matcher)!.elements : [matcher]) : [];
	for (const v of values) {
		const s = str(v, mod) ?? str(property(v, 'source'), mod);
		if (!s) continue;
		const negative = /\(\?!([^)]*)\)/.exec(s);
		if (negative) {
			include.push('/*rest?');
			exclude.push(...negative[1]!.split('|').map((p) => `/${p.replace(/\\\./g, '.').replace(/^\//, '')}`));
		} else include.push(fromMatcher(s));
	}
	return { include, exclude };
}

const LAYOUT = /^(layout|\+layout|\+layout\.server|_layout|__root|root|app|_app|default)$/;

/** The routes a guard in `file` covers, by file-system nesting. */
function scopeOf(file: string, routes: SourceRoute[]): SourceRoute[] {
	const dir = posix.dirname(file);
	const base = posix.basename(file).replace(/\.[^.]+$/, '');
	const inDir = (r: SourceRoute) => r.file.startsWith(`${dir}/`);
	if (/^(root|__root|app|_app)$/.test(base) && /(^|\/)(app|src|pages|src\/routes|app\/routes|src\/pages)$|^\.$/.test(dir)) return routes;
	if (LAYOUT.test(base)) return routes.filter(inDir);
	return routes.filter((r) => r.file === file || r.file.startsWith(`${dir}/${base}/`) || (r.file.startsWith(`${dir}/`) && posix.basename(r.file).startsWith(`${base}.`)));
}

export async function scanAuth(ctx: Context, routes: SourceRoute[]): Promise<AuthGuard[]> {
	const out: AuthGuard[] = [];
	const pages = routes.filter((r) => r.kind === 'page' || r.kind === 'endpoint');
	for (const file of ['middleware.ts', 'middleware.js', 'src/middleware.ts', 'src/middleware.js', 'proxy.ts', 'proxy.js', 'src/proxy.ts', 'src/proxy.js', 'src/hooks.server.ts', 'src/hooks.server.js']) {
		if (!ctx.project.has(file)) continue;
		const mod = await ctx.module(file);
		const g = mod && guardInModule(mod);
		if (!mod || !g) continue;
		const { include, exclude } = matchers(mod);
		const under = (prefixes: string[]) => {
			const scoped = prefixes.length ? prefixes.map((p) => (p.includes('*') || p.includes(':') ? p : `${p.replace(/\/$/, '')}/*rest?`)) : include.length ? include : ['/*rest?'];
			const covered = pages.filter((r) => scoped.some((p) => covers(p, r.path) || covers(p.replace(/\/\*rest\?$/, ''), r.path)) && !exclude.some((e) => r.path.startsWith(e)) && (!include.length || include.some((p) => covers(p, r.path))));
			return covered.length ? covered.map((r) => r.path) : scoped;
		};
		const byRole = (g.scoped ?? []).map((x) => ({ role: x.role, routes: under(x.prefixes) }));
		const elsewhere = under(g.prefixes).filter((r) => !byRole.some((x) => x.routes.includes(r)));
		const redirect = g.redirectTo ? { redirectTo: g.redirectTo } : {};
		if (elsewhere.length || !byRole.length) out.push({ role: g.role, file, line: g.line, routes: elsewhere.length ? elsewhere : under(g.prefixes), how: g.how, ...redirect });
		for (const x of byRole) out.push({ role: x.role, file, line: g.line, routes: x.routes, how: g.how, ...redirect });
	}
	const files = new Set<string>();
	for (const r of routes) {
		files.add(r.file);
		let dir = posix.dirname(r.file);
		for (let i = 0; i < 12 && dir !== '.' && dir !== ''; i++) {
			for (const name of ['layout', '+layout', '+layout.server', '_layout', 'route']) for (const ext of ['tsx', 'ts', 'jsx', 'js', 'svelte', 'vue']) if (ctx.project.has(`${dir}/${name}.${ext}`)) files.add(`${dir}/${name}.${ext}`);
			const parent = posix.dirname(dir);
			const base = posix.basename(dir);
			for (const ext of ['tsx', 'ts', 'jsx', 'js']) if (ctx.project.has(`${parent}/${base}.${ext}`)) files.add(`${parent}/${base}.${ext}`);
			dir = parent;
		}
		const name = posix.basename(r.file).replace(/\.[^.]+$/, '');
		const parts = name.split('.');
		for (let i = 1; i < parts.length; i++) for (const ext of ['tsx', 'ts', 'jsx', 'js']) {
			const parent = `${posix.dirname(r.file)}/${parts.slice(0, i).join('.')}.${ext}`;
			if (ctx.project.has(parent)) files.add(parent);
		}
	}
	for (const root of ['app/root.tsx', 'app/root.jsx', 'src/routes/__root.tsx', 'app/routes/__root.tsx']) if (ctx.project.has(root)) files.add(root);
	for (const file of ctx.project.files) if (/^(app\/)?middleware\/[\w.-]+\.[jt]s$/.test(file)) files.add(file);
	for (const file of [...files].sort()) {
		if (!/\.(tsx?|jsx?|mjs|svelte|vue|astro)$/.test(file) || /^(src\/)?(middleware|proxy)\.[jt]s$/.test(file) || /hooks\.server/.test(file)) continue;
		const mod = await ctx.module(file);
		if (!mod) continue;
		const nuxtMiddleware = /^(app\/)?middleware\//.test(file);
		const g = guardInModule(mod);
		if (!g) continue;
		if (nuxtMiddleware) {
			const name = posix.basename(file).replace(/\.(global\.)?[jt]s$/, '');
			const global = /\.global\.[jt]s$/.test(file);
			const users: string[] = [];
			if (!global) {
				for (const r of routes) {
					const m = r.file.endsWith('.vue') ? await ctx.module(r.file) : undefined;
					if (m && new RegExp(`middleware\\s*:\\s*(\\[[^\\]]*)?['"]${name}['"]`).test(m.text)) users.push(r.path);
				}
			}
			out.push({ role: g.role, file, line: g.line, routes: global ? pages.map((r) => r.path) : users, how: `${global ? 'global ' : ''}route middleware ${name}`, ...(g.redirectTo ? { redirectTo: g.redirectTo } : {}) });
			continue;
		}
		const scoped = scopeOf(file, pages);
		if (!scoped.length) continue;
		out.push({ role: g.role, file, line: g.line, routes: [...new Set(scoped.map((r) => r.path))], how: g.how, ...(g.redirectTo ? { redirectTo: g.redirectTo } : {}) });
	}
	return out;
}
