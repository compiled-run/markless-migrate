import { posix } from 'node:path';
import type { Context } from '../context.ts';
import { isDynamic, joinPath } from '../pattern.ts';
import { descendants, lineOf, named, parseTree, stringValue, type TsNode } from '../trees.ts';
import type { AuthGuard, SourceRoute, Write } from '../types.ts';

interface Call {
	name: string;
	args: TsNode[];
	node: TsNode;
}

interface Scope {
	prefix: string;
	middleware: { name: string; line: number; file: string }[];
	controller?: string;
}

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'any', 'match', 'view', 'redirect', 'permanentRedirect']);

export const laravelPath = (uri: string) => joinPath(uri.replace(/\{(\w+)\?\}/g, ':$1?').replace(/\{(\w+)\}/g, ':$1'));

const argValues = (call: TsNode) => named(call.childForFieldName('arguments')).map((a) => (a.type === 'argument' ? (named(a).at(-1) ?? a) : a));

/** `Route::middleware('auth')->prefix('x')->get(...)` as a list of calls, innermost first; undefined unless rooted at `Route::`. */
function chain(node: TsNode): Call[] | undefined {
	const calls: Call[] = [];
	let n: TsNode | null = node;
	while (n && n.type === 'member_call_expression') {
		calls.unshift({ name: n.childForFieldName('name')?.text ?? '', args: argValues(n), node: n });
		n = n.childForFieldName('object');
	}
	if (!n || n.type !== 'scoped_call_expression' || n.childForFieldName('scope')?.text !== 'Route') return undefined;
	calls.unshift({ name: n.childForFieldName('name')?.text ?? '', args: argValues(n), node: n });
	return calls;
}

const strings = (node: TsNode | undefined): string[] => {
	if (!node) return [];
	if (node.type === 'array_creation_expression') return named(node).flatMap((el) => strings(named(el).at(-1)));
	const s = stringValue(node);
	return s === undefined ? [] : [s];
};

function arrayOption(node: TsNode | undefined, key: string): TsNode | undefined {
	if (node?.type !== 'array_creation_expression') return undefined;
	for (const el of named(node)) {
		const parts = named(el);
		if (parts.length === 2 && stringValue(parts[0]) === key) return parts[1];
	}
	return undefined;
}

/** The role a middleware asks for: `auth` any signed-in user (null), `role:admin` admin; undefined when it is not a guard. */
export function middlewareRole(name: string): string | null | undefined {
	let m = /^auth(?::(\w+))?$/.exec(name);
	if (m) return m[1] && !/^(web|sanctum|api|session)$/.test(m[1]) ? m[1] : null;
	m = /^(?:role|roles|permission|can|ability|abilities):([^,|]+)/.exec(name);
	if (m) return m[1]!;
	if (/^(admin|is_admin|isAdmin|staff|auth\.basic|auth\.session)$/.test(name)) return name.startsWith('auth') ? null : name.replace(/^is_?/i, '').toLowerCase();
	return undefined;
}

const singular = (word: string) => (word.endsWith('ies') ? `${word.slice(0, -3)}y` : word.endsWith('s') ? word.slice(0, -1) : word);

export interface LaravelFound {
	routes: SourceRoute[];
	writes: Write[];
	guards: AuthGuard[];
}

async function controllerMethods(ctx: Context): Promise<Map<string, { file: string; line: number }>> {
	const out = new Map<string, { file: string; line: number }>();
	for (const file of ctx.project.files) {
		if (!/^app\/Http\/Controllers\/.+\.php$/.test(file)) continue;
		const root = await parseTree('php', await ctx.project.read(file));
		for (const cls of descendants(root, 'class_declaration')) {
			const name = cls.childForFieldName('name')?.text ?? '';
			out.set(name, { file, line: lineOf(cls) });
			for (const m of descendants(cls, 'method_declaration')) out.set(`${name}@${m.childForFieldName('name')?.text}`, { file, line: lineOf(m) });
		}
	}
	return out;
}

export async function laravelRoutes(ctx: Context): Promise<LaravelFound> {
	const found: LaravelFound = { routes: [], writes: [], guards: [] };
	const methods = await controllerMethods(ctx);
	const guards = new Map<string, AuthGuard>();
	let login: string | undefined;
	const add = (scope: Scope, verbs: string[], uri: string, action: TsNode | undefined, file: string, node: TsNode, extra: { name: string; line: number; file: string }[], routeName?: string) => {
		const path = laravelPath(joinPath(scope.prefix, uri));
		let handler = { file, line: lineOf(node) };
		const target = action?.type === 'array_creation_expression' ? named(action).map((el) => named(el)[0]!) : undefined;
		const cls = target?.[0]?.type === 'class_constant_access_expression' ? named(target[0])[0]?.text : scope.controller;
		const method = target ? stringValue(target[1]) : action && stringValue(action);
		const key = method?.includes('@') ? method : cls && method ? `${cls}@${method}` : undefined;
		if (key && methods.has(key.split('\\').pop()!)) handler = methods.get(key.split('\\').pop()!)!;
		if (verbs.some((v) => v === 'GET' || v === '*')) found.routes.push({ path, file, line: lineOf(node), dynamic: isDynamic(path), kind: path.startsWith('/api') ? 'endpoint' : 'page', methods: verbs });
		for (const v of verbs) if (v !== 'GET' && v !== 'HEAD' && v !== 'OPTIONS') found.writes.push({ method: v, path, handler, via: 'route' });
		if (verbs.includes('GET') && (path === '/login' || routeName === 'login')) login ??= path;
		for (const mw of [...scope.middleware, ...extra]) {
			const role = middlewareRole(mw.name);
			if (role === undefined) continue;
			const k = `${mw.file}:${mw.line}:${mw.name}`;
			const g = guards.get(k) ?? { role, file: mw.file, line: mw.line, routes: [], how: `middleware ${mw.name}` };
			if (verbs.some((v) => v === 'GET' || v === '*')) {
				if (!g.routes.includes(path)) g.routes.push(path);
			} else for (const v of verbs) (g.writes ??= []).push(`${v} ${path}`);
			guards.set(k, g);
		}
	};
	const visit = (nodes: TsNode[], scope: Scope, file: string) => {
		for (const stmt of nodes) {
			const expr = stmt.type === 'expression_statement' ? named(stmt)[0] : undefined;
			const calls = expr && chain(expr);
			if (!calls) {
				if (stmt.type !== 'expression_statement') visit(named(stmt), scope, file);
				continue;
			}
			const local: Scope = { ...scope, middleware: [...scope.middleware] };
			const extra: { name: string; line: number; file: string }[] = [];
			const only = new Set<string>();
			const except = new Set<string>();
			let terminal: Call | undefined;
			let group: TsNode | undefined;
			for (const c of calls) {
				if (c.name === 'middleware') for (const m of c.args.flatMap(strings)) (terminal ? extra : local.middleware).push({ name: m, line: lineOf(c.node), file });
				else if (c.name === 'prefix') local.prefix = joinPath(local.prefix, strings(c.args[0])[0]);
				else if (c.name === 'controller' && c.args[0]?.type === 'class_constant_access_expression') local.controller = named(c.args[0])[0]?.text;
				else if (c.name === 'only') for (const s of strings(c.args[0])) only.add(s);
				else if (c.name === 'except') for (const s of strings(c.args[0])) except.add(s);
				else if (c.name === 'group') {
					const attrs = c.args.find((a) => a.type === 'array_creation_expression');
					if (attrs) {
						const prefix = arrayOption(attrs, 'prefix');
						if (prefix) local.prefix = joinPath(local.prefix, strings(prefix)[0]);
						for (const m of strings(arrayOption(attrs, 'middleware'))) local.middleware.push({ name: m, line: lineOf(c.node), file });
					}
					group = c.args.find((a) => a.type === 'anonymous_function' || a.type === 'arrow_function');
				} else if (VERBS.has(c.name) || c.name === 'resource' || c.name === 'apiResource' || c.name === 'resources') terminal = c;
			}
			if (group) visit(named(group.childForFieldName('body')), local, file);
			if (!terminal) continue;
			const args = terminal.args;
			if (terminal.name === 'resource' || terminal.name === 'apiResource') {
				const names = strings(args[0])[0]?.split('.') ?? [];
				let base = '';
				names.forEach((n, i) => (base = i < names.length - 1 ? `${base}/${n}/{${singular(n)}}` : `${base}/${n}`));
				const param = `{${singular(names.at(-1) ?? 'id').replace(/-/g, '_')}}`;
				const cls = args[1]?.type === 'class_constant_access_expression' ? named(args[1])[0]?.text : undefined;
				const actions: [string, string[], string][] = [['index', ['GET'], ''], ['create', ['GET'], '/create'], ['store', ['POST'], ''], ['show', ['GET'], `/${param}`], ['edit', ['GET'], `/${param}/edit`], ['update', ['PUT', 'PATCH'], `/${param}`], ['destroy', ['DELETE'], `/${param}`]];
				for (const [action, verbs, suffix] of actions) {
					if (terminal.name === 'apiResource' && (action === 'create' || action === 'edit')) continue;
					if ((only.size && !only.has(action)) || except.has(action)) continue;
					add({ ...local, controller: cls }, verbs, base + suffix, undefined, file, terminal.node, extra);
					const h = cls && methods.get(`${cls}@${action}`);
					if (h && verbs[0] !== 'GET') for (const w of found.writes.slice(-verbs.length)) w.handler = h;
				}
				continue;
			}
			const uri = strings(terminal.name === 'match' ? args[1] : args[0])[0];
			if (uri === undefined) continue;
			const verbs = terminal.name === 'match' ? strings(args[0]).map((v) => v.toUpperCase()) : terminal.name === 'any' ? ['*'] : /view|redirect/i.test(terminal.name) ? ['GET'] : [terminal.name.toUpperCase()];
			const action = terminal.name === 'match' ? args[2] : args[1];
			const routeName = strings(calls.find((c) => c.name === 'name')?.args[0])[0];
			add(local, verbs, uri, action, file, terminal.node, extra, routeName);
		}
	};
	for (const file of ctx.project.files) {
		if (!/^routes\/[\w-]+\.php$/.test(file) || /^routes\/(console|channels)\.php$/.test(file)) continue;
		const root = await parseTree('php', await ctx.project.read(file));
		visit(named(root), { prefix: posix.basename(file) === 'api.php' ? '/api' : '', middleware: [] }, file);
	}
	found.guards = [...guards.values()].map((g) => (login ? { ...g, redirectTo: login } : g));
	return found;
}
