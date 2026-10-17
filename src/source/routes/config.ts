import { posix } from 'node:path';
import type { Context } from '../context.ts';
import { isScript, resolveImport } from '../files.ts';
import { memberName, property, str, unwrap, walk, type Module, type N } from '../js.ts';
import { isDynamic, joinPath } from '../pattern.ts';
import type { AuthGuard, SourceRoute } from '../types.ts';
import { remixFlatRoutes } from './files.ts';

export interface Found {
	routes: SourceRoute[];
	guards: AuthGuard[];
}

const empty = (): Found => ({ routes: [], guards: [] });

/** `/user/:id(\\d+)`, `:rest*`, `:rest+`, `**` and `*` to the normalised pattern. */
export function colonPath(path: string): string {
	return joinPath(
		...path.split('/').map((seg) => {
			if (seg === '**' || seg === '*') return '*splat?';
			const m = /^:(\w+)(?:\([^/]*\))?([?*+]?)$/.exec(seg);
			if (!m) return seg;
			return m[2] === '*' ? `*${m[1]}?` : m[2] === '+' ? `*${m[1]}` : `:${m[1]}${m[2]}`;
		}),
	);
}

/** React Router 7 / Remix `app/routes.ts`. */
export async function routesConfig(ctx: Context): Promise<SourceRoute[] | undefined> {
	const file = ['app/routes.ts', 'app/routes.js', 'app/routes.tsx'].find((f) => ctx.project.has(f));
	if (!file) return undefined;
	const mod = await ctx.module(file);
	const root = mod?.exports.get('default');
	if (!mod || !root) return undefined;
	const appDir = posix.dirname(file);
	const out: SourceRoute[] = [];
	const helper = (n: N) => {
		const name = n.type === 'CallExpression' && n.callee.type === 'Identifier' ? n.callee.name : undefined;
		const imported = name ? mod.imports.get(name) : undefined;
		return imported && /@react-router\/dev\/routes|@remix-run\/route-config/.test(imported.source) ? imported.imported : undefined;
	};
	const visit = async (node: N | undefined, prefix: string): Promise<void> => {
		const n = unwrap(node);
		if (!n) return;
		if (n.type === 'ArrayExpression') {
			for (const el of n.elements as N[]) if (el) await visit(el.type === 'SpreadElement' ? el.argument : el, prefix);
			return;
		}
		if (n.type === 'Identifier') return visit(mod.bindings.get(n.name), prefix);
		if (n.type !== 'CallExpression') return;
		const kind = helper(n);
		const args = n.arguments as N[];
		const routeFile = (arg: N | undefined) => {
			const f = str(arg, mod);
			return f === undefined ? file : posix.normalize(posix.join(appDir, f));
		};
		const add = async (path: string, target: string) => {
			const m = target !== file ? await ctx.module(target) : undefined;
			out.push({ path, file: target, line: m?.exports.get('default') ? m.line(m.exports.get('default')!.start) : 1, dynamic: isDynamic(path), kind: m && !m.exports.has('default') ? 'endpoint' : 'page' });
		};
		if (kind === 'index') await add(joinPath(prefix), routeFile(args[0]));
		else if (kind === 'route') {
			const path = colonPath(joinPath(prefix, str(args[0], mod)));
			await add(path, routeFile(args[1]));
			const children = args.slice(2).find((a) => unwrap(a)?.type === 'ArrayExpression' || unwrap(a)?.type === 'Identifier');
			if (children) await visit(children, path);
		} else if (kind === 'layout') await visit(args.at(-1), prefix);
		else if (kind === 'prefix') await visit(args[1], joinPath(prefix, str(args[0], mod)));
		else if (memberName(n.callee) === 'flatRoutes') {
			const options = unwrap(args[0]);
			const dir = str(property(options, 'rootDirectory'), mod) ?? 'routes';
			for (const r of await remixFlatRoutes(ctx, posix.join(appDir, dir))) out.push({ ...r, path: joinPath(prefix, r.path) });
		}
	};
	await visit(root, '');
	return out;
}

const ROUTER_CALLS = /^(createRouter|VueRouter|createBrowserRouter|createHashRouter|createMemoryRouter|createStaticRouter|useRoutes|RouterModule\.forRoot|RouterModule\.forChild|provideRouter|provideRoutes)$/;
const ROUTE_TYPES = /^(Routes|Route\[\]|RouteRecordRaw\[\]|RouteObject\[\]|Array<RouteRecordRaw>|Array<RouteObject>|Array<Route>)$/;

interface Target {
	mod: Module;
	node: N;
}

async function resolveValue(ctx: Context, mod: Module, node: N | undefined, depth = 0): Promise<Target | undefined> {
	const n = unwrap(node);
	if (!n || depth > 5) return undefined;
	if (n.type === 'Identifier') {
		const bound = mod.bindings.get(n.name);
		if (bound) return resolveValue(ctx, mod, bound, depth + 1);
		const imported = mod.imports.get(n.name);
		const file = imported && resolveImport(ctx.project, mod.file, imported.source);
		const other = file ? await ctx.module(file) : undefined;
		return other ? resolveValue(ctx, other, other.exports.get(imported!.imported), depth + 1) : undefined;
	}
	return { mod, node: n };
}

/** The route array a lazy `loadChildren: () => import('./x').then(m => m.ROUTES)` names. */
async function lazyChildren(ctx: Context, mod: Module, node: N | undefined): Promise<Target | undefined> {
	let found: { spec: string; name?: string } | undefined;
	if (!node) return undefined;
	walk(node, (n) => {
		if (n.type === 'ImportExpression' && n.source.type === 'Literal') found = { ...found, spec: String(n.source.value) };
		if (n.type === 'MemberExpression' && !n.computed && found && !found.name) found.name = n.property.name;
	});
	if (!found) return undefined;
	const file = resolveImport(ctx.project, mod.file, found.spec);
	const other = file ? await ctx.module(file) : undefined;
	if (!other) return undefined;
	const exported = other.exports.get(found.name ?? 'default') ?? other.exports.get('default');
	return exported ? { mod: other, node: exported } : undefined;
}


/** A guard that lets in only visitors who are not signed in (`map((isAuth) => !isAuth)`, `guestGuard`): the route is for guests. */
export function guestOnly(text: string): boolean {
	return /(=>|return)\s*!\s*\(?\s*[\w.$]*(auth|logged|signed)/i.test(text) || /\b(guest|noAuth|unauth|anonymous|loggedOut|signedOut|notAuth|notLoggedIn)\w*/i.test(text);
}

function guardOf(mod: Module, obj: N): { role: string | null; how: string } | undefined {
	const meta = property(obj, 'meta');
	const roles = property(meta, 'roles') ?? property(meta, 'role') ?? property(property(obj, 'data'), 'roles') ?? property(property(obj, 'data'), 'role');
	const roleValue = roles ? (unwrap(roles)?.type === 'ArrayExpression' ? str(unwrap(roles)!.elements[0], mod) : str(roles, mod)) : undefined;
	for (const key of ['canActivate', 'canMatch', 'canActivateChild', 'canLoad']) {
		const value = property(obj, key);
		const text = value ? mod.text.slice(value.start, value.end).replace(/\s+/g, ' ') : '';
		if (value && !guestOnly(text)) return { role: roleValue ?? null, how: `${key}: ${text}` };
	}
	if (meta) {
		for (const key of ['requiresAuth', 'requireAuth', 'auth', 'authenticated', 'requiresLogin']) {
			const value = property(meta, key);
			if (value && str(value, mod) !== 'guest' && !(value.type === 'Literal' && value.value === false)) return { role: roleValue ?? null, how: `meta.${key}` };
		}
		if (roleValue) return { role: roleValue, how: 'meta.roles' };
	}
	const beforeEnter = property(obj, 'beforeEnter');
	if (beforeEnter) return { role: roleValue ?? null, how: `beforeEnter: ${mod.text.slice(beforeEnter.start, beforeEnter.end).replace(/\s+/g, ' ').slice(0, 80)}` };
	return undefined;
}

async function routeObjects(ctx: Context, target: Target, prefix: string, found: Found, seen: Set<N>, inherited: { role: string | null; how: string; file: string; line: number } | undefined): Promise<void> {
	const { mod, node } = target;
	const array = unwrap(node);
	if (!array || array.type !== 'ArrayExpression' || seen.has(array)) return;
	seen.add(array);
	for (const el of array.elements as N[]) {
		const obj = unwrap(el?.type === 'SpreadElement' ? el.argument : el);
		if (!obj) continue;
		if (obj.type !== 'ObjectExpression') {
			const resolved = await resolveValue(ctx, mod, obj);
			if (resolved) await routeObjects(ctx, resolved, prefix, found, seen, inherited);
			continue;
		}
		const raw = str(property(obj, 'path'), mod);
		const index = property(obj, 'index');
		const path = raw === undefined ? prefix : raw.startsWith('/') ? colonPath(raw) : colonPath(joinPath(prefix, raw));
		const line = mod.line(obj.start);
		const g = guardOf(mod, obj);
		const guard = g ? { ...g, file: mod.file, line } : inherited;
		const children = property(obj, 'children');
		const lazy = property(obj, 'loadChildren');
		const renders = ['component', 'element', 'Component', 'loadComponent', 'components', 'lazy', 'redirectTo', 'redirect'].some((k) => property(obj, k));
		if ((raw !== undefined || index) && renders) {
			found.routes.push({ path, file: mod.file, line, dynamic: isDynamic(path), kind: 'page' });
			if (guard) found.guards.push({ role: guard.role, file: guard.file, line: guard.line, routes: [path], how: guard.how });
		}
		if (children) {
			const resolved = await resolveValue(ctx, mod, children);
			if (resolved) await routeObjects(ctx, resolved, path, found, seen, guard);
		}
		if (lazy) {
			const resolved = await lazyChildren(ctx, mod, lazy);
			if (resolved) await routeObjects(ctx, resolved, path, found, seen, guard);
			else ctx.limits.push(`${mod.file}:${line}: loadChildren target not resolved, routes under ${path} not listed`);
		}
	}
}

const jsxName = (n: N): string | undefined => (n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${jsxName(n.object)}.${n.property.name}` : undefined);

export function jsxAttr(el: N, name: string): N | undefined | null {
	for (const a of el.openingElement.attributes as N[]) {
		if (a.type === 'JSXAttribute' && a.name.name === name) return a.value ?? null;
	}
	return undefined;
}

export const jsxValue = (v: N | undefined | null, mod: Module) => (v ? str(v.type === 'JSXExpressionContainer' ? v.expression : v, mod) : undefined);

function jsxRoutes(mod: Module, found: Found): void {
	const visitEl = (el: N, prefix: string) => {
		const name = jsxName(el.openingElement.name);
		let next = prefix;
		if (name === 'Route') {
			const raw = jsxValue(jsxAttr(el, 'path'), mod);
			const index = jsxAttr(el, 'index') !== undefined;
			next = raw === undefined ? prefix : raw.startsWith('/') ? colonPath(raw) : colonPath(joinPath(prefix, raw));
			if (raw !== undefined || index) found.routes.push({ path: next, file: mod.file, line: mod.line(el.start), dynamic: isDynamic(next), kind: 'page' });
		}
		for (const child of el.children as N[]) {
			if (child.type === 'JSXElement') visitEl(child, next);
			else if (child.type === 'JSXFragment') for (const c of child.children as N[]) if (c.type === 'JSXElement') visitEl(c, next);
		}
	};
	walk(mod.program, (n) => {
		if (n.type === 'JSXElement' && /^(Routes|Switch|Router|BrowserRouter|HashRouter|MemoryRouter|Route)$/.test(jsxName(n.openingElement.name) ?? '')) {
			visitEl(n, '');
			return false;
		}
	});
}

function tanstackCodeRoutes(mod: Module, found: Found): void {
	const defs = new Map<string, { parent?: string; path?: string; line: number; node: N }>();
	walk(mod.program, (n) => {
		if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier') return;
		const init = unwrap(n.init);
		if (init?.type !== 'CallExpression') return;
		const callee = memberName(init.callee);
		if (callee === 'createRootRoute' || callee === 'createRootRouteWithContext()') defs.set(n.id.name, { line: mod.line(n.start), node: init, path: '' });
		else if (callee === 'createRoute') {
			const opts = init.arguments[0] as N;
			const getParent = unwrap(property(opts, 'getParentRoute'));
			const parentBody = getParent && (getParent.body.type === 'BlockStatement' ? undefined : unwrap(getParent.body));
			defs.set(n.id.name, { parent: parentBody?.type === 'Identifier' ? parentBody.name : undefined, path: str(property(opts, 'path'), mod), line: mod.line(n.start), node: init });
		}
	});
	const full = (name: string, depth = 0): string => {
		const d = defs.get(name);
		if (!d || depth > 20) return '';
		return joinPath(d.parent ? full(d.parent, depth + 1) : '', d.path ? d.path.split('/').map((s) => (s === '$' ? '*splat' : s.replace(/^\$/, ':'))).join('/') : '');
	};
	for (const [name, d] of defs) {
		if (d.path === undefined || !d.parent) continue;
		const path = full(name);
		found.routes.push({ path, file: mod.file, line: d.line, dynamic: isDynamic(path), kind: 'page' });
	}
}

/** Route tables declared in code: Vue Router, React Router objects and JSX, Angular, TanStack code routes. */
export async function codeRoutes(ctx: Context): Promise<Found> {
	const found = empty();
	const seen = new Set<N>();
	const typed: Target[] = [];
	const files = ctx.project.files.filter((f) => isScript(f) && !/\.d\.ts$/.test(f));
	for (const file of files) {
		const text = await ctx.project.read(file);
		if (!/vue-router|react-router|@angular\/router|@tanstack\/(react|solid)-router|Routes|createRoute/.test(text)) continue;
		const mod = await ctx.module(file);
		if (!mod) continue;
		const roots: N[] = [];
		walk(mod.program, (n) => {
			if (n.type === 'CallExpression' || n.type === 'NewExpression') {
				const name = memberName(n.callee);
				if (name && ROUTER_CALLS.test(name)) {
					const arg = unwrap(n.arguments[0]);
					if (arg) roots.push(arg.type === 'ObjectExpression' ? (property(arg, 'routes') ?? arg) : arg);
				}
			}
			if (n.type === 'VariableDeclarator' && n.id.typeAnnotation) {
				const type = mod.text.slice(n.id.typeAnnotation.typeAnnotation.start, n.id.typeAnnotation.typeAnnotation.end).replace(/\s/g, '');
				if (ROUTE_TYPES.test(type) && n.init) typed.push({ mod, node: n.init });
			}
		});
		for (const root of roots) {
			const resolved = await resolveValue(ctx, mod, root);
			if (resolved) await routeObjects(ctx, resolved, '', found, seen, undefined);
		}
		if (/react-router/.test(text)) jsxRoutes(mod, found);
		if (/@tanstack\/(react|solid)-router/.test(text) && /createRoute\(/.test(text)) tanstackCodeRoutes(mod, found);
	}
	const lazyNames = new Set<string>();
	for (const t of typed) for (const m of t.mod.text.matchAll(/loadChildren[\s\S]*?\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.(\w+)/g)) lazyNames.add(m[2]!);
	const named = (t: Target) => [...t.mod.bindings].find(([, v]) => v === t.node)?.[0] ?? '';
	for (const t of typed) if (!lazyNames.has(named(t))) await routeObjects(ctx, t, '', found, seen, undefined);
	for (const t of typed) await routeObjects(ctx, t, '', found, seen, undefined);
	return found;
}

