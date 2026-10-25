import type { Context } from '../context.ts';
import { isScript, isTestFile, resolveImport } from '../files.ts';
import { callsIn, functionOf, memberName, str, unwrap, walk, type Module, type N } from '../js.ts';
import { covers, isDynamic, joinPath } from '../pattern.ts';
import type { AuthGuard, SourceRoute, Write } from '../types.ts';
import { colonPath } from './config.ts';

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'del', 'all', 'options', 'head']);
const SERVER_PACKAGES = /^(express|hono|hono\/.*|@koa\/router|koa-router|fastify|router)$/;
export const AUTH_NAME = /auth|login|signed|session|protect|guard|require(user|role|admin|login)|isadmin|ensure(logged|auth)|jwt|passport|clerk|verify(token|user|session)/i;

interface App {
	key: string;
	mod: Module;
	name: string;
}

interface Registration {
	app: string;
	kind: 'route' | 'use' | 'mount';
	method?: string;
	path?: string;
	line: number;
	order: number;
	handlers: N[];
	mounted?: string[];
	mod: Module;
}

export interface ServerFound {
	routes: SourceRoute[];
	writes: Write[];
	guards: AuthGuard[];
}

function makesApp(mod: Module, init: N | undefined): boolean {
	const n = unwrap(init);
	if (n?.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'basePath') return makesApp(mod, n.callee.object);
	if (!n || (n.type !== 'CallExpression' && n.type !== 'NewExpression')) return false;
	const root = memberName(n.callee)?.split('.')[0];
	const imported = root ? mod.imports.get(root) : undefined;
	return !!imported && SERVER_PACKAGES.test(imported.source);
}

// A guard's string arguments: a path is where it sends a visitor it turns away (ensureLoggedIn('/login')), anything else the role.
function stringArgs(handlers: N[], mod: Module): string[] {
	const out: string[] = [];
	for (const h of handlers) {
		const n = unwrap(h);
		if (n?.type === 'CallExpression') for (const a of n.arguments as N[]) {
			const v = str(a, mod) ?? (unwrap(a)?.type === 'ArrayExpression' ? str(unwrap(a)!.elements[0], mod) : undefined);
			if (v) out.push(v);
		}
	}
	return out;
}

const roleOf = (handlers: N[], mod: Module): string | null => stringArgs(handlers, mod).find((v) => !v.startsWith('/')) ?? null;
const redirectOf = (handlers: N[], mod: Module) => {
	const to = stringArgs(handlers, mod).find((v) => v.startsWith('/'));
	return to ? { redirectTo: to } : {};
};

const SESSION_PACKAGES = /^(express-session|cookie-session|koa-session|@fastify\/(session|secure-session))$/;
const SIGN_IN_OPTIONS = /^(successRedirect|successReturnToOrRedirect)$/;

// Middleware that loads the session (express-session, passport.initialize and passport.session) and Passport's sign-in
// handler (authenticate with a success redirect) let every visitor through, so they are not guards.
function turnsAway(handler: N, mod: Module): boolean {
	const n = unwrap(handler);
	const call = n?.type === 'CallExpression' ? n : undefined;
	const name = memberName(call ? call.callee : n);
	if (!name || !AUTH_NAME.test(name)) return false;
	const root = name.split('.')[0]!;
	if (SESSION_PACKAGES.test(mod.imports.get(root)?.source ?? '')) return false;
	if (/(^|\.)passport\.(initialize|session)$/.test(name)) return false;
	if (call && /(^|\.)authenticate$/.test(name)) {
		const options = (call.arguments as N[]).map(unwrap).find((a) => a?.type === 'ObjectExpression');
		if (options?.properties.some((p: N) => SIGN_IN_OPTIONS.test(p.key?.name ?? p.key?.value ?? ''))) return false;
	}
	return true;
}

const guardNames = (handlers: N[], mod: Module) => handlers.filter((h) => turnsAway(h, mod)).map((h) => memberName(unwrap(h)?.type === 'CallExpression' ? unwrap(h)!.callee : h)!);

/** Express, Hono, Koa Router and Fastify routes, mounts and middleware guards. */
export async function serverRoutes(ctx: Context): Promise<ServerFound> {
	const out: ServerFound = { routes: [], writes: [], guards: [] };
	const apps = new Map<string, App>();
	const regs: Registration[] = [];
	const exportsApp = new Map<string, string>();
	let order = 0;
	for (const file of ctx.project.files) {
		if (!isScript(file) || isTestFile(file)) continue;
		const text = await ctx.project.read(file);
		if (!/express|hono|koa|fastify/.test(text)) continue;
		const mod = await ctx.module(file);
		if (!mod) continue;
		const local = new Map<string, string>();
		walk(mod.program, (n) => {
			if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && makesApp(mod, n.init)) {
				const key = `${file}#${n.id.name}`;
				local.set(n.id.name, key);
				apps.set(key, { key, mod, name: n.id.name });
			}
		});
		if (!local.size) continue;
		for (const [name, node] of mod.exports) {
			const target = node.type === 'Identifier' ? node.name : [...mod.bindings].find(([, v]) => v === node)?.[0];
			if (target && local.has(target)) exportsApp.set(`${file}#${name}`, local.get(target)!);
			if (name === 'default' && node.type === 'Identifier' && local.has(node.name)) exportsApp.set(`${file}#default`, local.get(node.name)!);
		}
		const mountedKey = (arg: N | undefined): string | undefined => {
			const n = unwrap(arg);
			if (n?.type !== 'Identifier') return undefined;
			if (local.has(n.name)) return local.get(n.name);
			const imported = mod.imports.get(n.name);
			const target = imported && resolveImport(ctx.project, file, imported.source);
			return target ? `@${target}#${imported!.imported}` : undefined;
		};
		walk(mod.program, (n) => {
			if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) return;
			const method = n.callee.property.name as string;
			let object = unwrap(n.callee.object)!;
			let chainedPath: string | undefined;
			const chained = VERBS.has(method);
			while (chained && object.type === 'CallExpression' && object.callee.type === 'MemberExpression' && VERBS.has(object.callee.property.name)) object = unwrap(object.callee.object)!;
			if (chained && object.type === 'CallExpression' && object.callee.type === 'MemberExpression' && object.callee.property.name === 'route' && object.arguments.length === 1) {
				chainedPath = str(object.arguments[0], mod);
				object = unwrap(object.callee.object)!;
			}
			if (object.type !== 'Identifier' || !local.has(object.name)) return;
			const app = local.get(object.name)!;
			const args = n.arguments as N[];
			const pathArg = str(args[0], mod);
			const rest = pathArg === undefined ? args : args.slice(1);
			const line = mod.line(n.start);
			if (VERBS.has(method)) {
				const path = chainedPath ?? pathArg;
				if (path === undefined) return;
				regs.push({ app, kind: 'route', method: method === 'del' ? 'DELETE' : method.toUpperCase(), path, line, order: order++, handlers: chainedPath ? args : rest, mod });
			} else if (method === 'use' || method === 'route' || method === 'register') {
				const mounted = rest.map(mountedKey).filter((k): k is string => !!k);
				if (mounted.length) regs.push({ app, kind: 'mount', path: pathArg ?? '', line, order: order++, handlers: rest, mounted, mod });
				else regs.push({ app, kind: 'use', path: pathArg, line, order: order++, handlers: rest, mod });
			}
		});
	}
	const resolveMount = (keys: string[]) => keys.map((key) => (key.startsWith('@') ? exportsApp.get(key.slice(1)) : key)).find(Boolean);
	const mountedApps = new Set(regs.filter((r) => r.kind === 'mount').map((r) => resolveMount(r.mounted!)));
	type Active = { names: string[]; role: string | null; file: string; line: number; scope?: string; redirectTo?: string };
	const visit = (app: string, prefix: string, inherited: Active[], depth: number) => {
		if (depth > 10) return;
		const mine = regs.filter((r) => r.app === app).sort((a, b) => a.order - b.order);
		const active: Active[] = [...inherited];
		for (const r of mine) {
			const path = colonPath(joinPath(prefix, r.path));
			if (r.kind === 'use') {
				const names = guardNames(r.handlers, r.mod);
				if (r.mounted && !resolveMount(r.mounted) && !names.length) continue;
				if (names.length) active.push({ names, role: roleOf(r.handlers, r.mod), file: r.mod.file, line: r.line, ...redirectOf(r.handlers, r.mod), ...(r.path ? { scope: path } : {}) });
				continue;
			}
			const applicable = active.filter((g) => !g.scope || covers(g.scope, path, true));
			if (r.kind === 'mount') {
				const child = resolveMount(r.mounted!);
				const own = guardNames(r.handlers, r.mod);
				if (child) visit(child, path, [...applicable, ...(own.length ? [{ names: own, role: roleOf(r.handlers, r.mod), file: r.mod.file, line: r.line, ...redirectOf(r.handlers, r.mod) }] : [])], depth + 1);
				continue;
			}
			const handler = functionOf(r.handlers.at(-1), r.mod);
			const renders = handler ? callsIn(handler).some((c) => /\.(render|html|sendFile)$/.test(c.name)) : false;
			out.routes.push({ path, file: r.mod.file, line: r.line, dynamic: isDynamic(path), kind: renders ? 'page' : 'endpoint', methods: [r.method!] });
			if (r.method !== 'GET' && r.method !== 'HEAD' && r.method !== 'OPTIONS') out.writes.push({ method: r.method === 'ALL' ? '*' : r.method!, path, handler: { file: r.mod.file, line: handler ? r.mod.line(handler.start) : r.line }, via: 'route' });
			const own = guardNames(r.handlers, r.mod);
			for (const g of own.length ? [...applicable, { names: own, role: roleOf(r.handlers, r.mod), file: r.mod.file, line: r.line, ...redirectOf(r.handlers, r.mod) }] : applicable) {
				out.guards.push({ role: g.role, file: g.file, line: g.line, routes: [path], how: g.names.join(', '), ...(g.redirectTo ? { redirectTo: g.redirectTo } : {}) });
			}
		}
	};
	for (const key of apps.keys()) if (!mountedApps.has(key)) visit(key, '', [], 0);
	return out;
}
