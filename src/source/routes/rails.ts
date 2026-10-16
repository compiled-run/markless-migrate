import type { Context } from '../context.ts';
import { isDynamic, joinPath } from '../pattern.ts';
import { descendants, lineOf, named, parseTree, stringValue, type TsNode } from '../trees.ts';
import type { AuthGuard, SourceRoute, Write } from '../types.ts';

interface Guard {
	role: string | null;
	file: string;
	line: number;
	how: string;
}

interface Scope {
	path: string;
	module: string;
	controller?: string;
	guard?: Guard;
	/** Inside `resources`: where member and collection routes go. */
	resource?: { member: string; collection: string; controller: string };
	on?: 'member' | 'collection';
}

interface Declared {
	verb: string;
	path: string;
	controller?: string;
	action?: string;
	line: number;
	guard?: Guard;
}

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'match']);

/** `(:locale)` to an optional param, `(.:format)` dropped, `:id` kept, `*path` to a catch-all. */
export function railsPath(path: string): string {
	return joinPath(
		path
			.replace(/\(\.:format\)/g, '')
			.replace(/\(\/?:(\w+)\)/g, '/:$1?')
			.replace(/\(([^)]*)\)/g, '$1')
			.replace(/\*(\w+)/g, '*$1'),
	);
}

const singular = (word: string) => (word.endsWith('ies') ? `${word.slice(0, -3)}y` : word.endsWith('ses') ? word.slice(0, -2) : word.endsWith('s') ? word.slice(0, -1) : word);

function args(call: TsNode): { positional: TsNode[]; options: Map<string, TsNode>; arrow?: [TsNode, TsNode] } {
	const list = call.childForFieldName('arguments');
	const positional: TsNode[] = [];
	const options = new Map<string, TsNode>();
	let arrow: [TsNode, TsNode] | undefined;
	for (const a of named(list)) {
		if (a.type === 'pair') {
			const key = a.childForFieldName('key')!;
			const value = a.childForFieldName('value')!;
			if (key.type === 'hash_key_symbol' || key.type === 'simple_symbol') options.set(stringValue(key)!, value);
			else arrow = [key, value];
		} else if (a.type === 'hash') {
			for (const p of named(a)) if (p.type === 'pair') options.set(stringValue(p.childForFieldName('key'))!, p.childForFieldName('value')!);
		} else positional.push(a);
	}
	return { positional, options, ...(arrow ? { arrow } : {}) };
}

const symbols = (node: TsNode | undefined): string[] => (!node ? [] : node.type === 'array' ? named(node).map(stringValue).filter((s): s is string => !!s) : [stringValue(node)].filter((s): s is string => !!s));

const block = (call: TsNode) => {
	const b = call.childForFieldName('block');
	return b ? (named(b).find((c) => c.type === 'body_statement' || c.type === 'block_body') ?? null) : null;
};

const RESOURCES = [
	['index', 'GET', ''],
	['new', 'GET', '/new'],
	['create', 'POST', ''],
	['show', 'GET', '/:id'],
	['edit', 'GET', '/:id/edit'],
	['update', 'PATCH', '/:id'],
	['destroy', 'DELETE', '/:id'],
] as const;
const RESOURCE = [
	['show', 'GET', ''],
	['new', 'GET', '/new'],
	['create', 'POST', ''],
	['edit', 'GET', '/edit'],
	['update', 'PATCH', ''],
	['destroy', 'DELETE', ''],
] as const;

function readRoutes(body: TsNode | null, scope: Scope, file: string, out: Declared[]): void {
	for (const call of named(body)) {
		if (call.type !== 'call' || call.childForFieldName('receiver')) {
			continue;
		}
		const method = call.childForFieldName('method')?.text ?? '';
		const { positional, options, arrow } = args(call);
		const inner = block(call);
		const line = lineOf(call);
		const target = (value: TsNode | undefined) => {
			const t = value ? stringValue(value) : undefined;
			if (!t?.includes('#')) return {};
			const [c, a] = t.split('#');
			return { controller: scope.module + c!, action: a! };
		};
		if (VERBS.has(method)) {
			const first = positional[0] ? stringValue(positional[0]) : arrow ? stringValue(arrow[0]) : undefined;
			if (first === undefined) continue;
			const on = (options.get('on') && stringValue(options.get('on'))) || scope.on;
			const base = scope.resource ? (on === 'collection' ? scope.resource.collection : on === 'member' ? scope.resource.member : `${scope.resource.member.replace(/\/:id$/, '')}/:${singular(scope.resource.collection.split('/').pop()!)}_id`) : scope.path;
			const explicit = { ...target(arrow?.[1]), ...target(options.get('to')) };
			const controller = explicit.controller ?? (options.get('controller') ? scope.module + stringValue(options.get('controller')) : (scope.resource?.controller ?? scope.controller));
			const action = explicit.action ?? (options.get('action') ? stringValue(options.get('action')) : first.replace(/^\//, '').split('/')[0]);
			const verbs = method === 'match' ? symbols(options.get('via')).map((v) => v.toUpperCase()) : [method.toUpperCase()];
			for (const verb of verbs.length ? verbs : ['GET']) out.push({ verb: verb === 'ALL' ? '*' : verb, path: railsPath(joinPath(base, first)), controller, action, line, guard: scope.guard });
		} else if (method === 'root') {
			const t = { ...target(positional[0]), ...target(options.get('to')) };
			out.push({ verb: 'GET', path: joinPath(scope.path), ...t, line, guard: scope.guard });
		} else if (method === 'resources' || method === 'resource') {
			const plural = method === 'resources';
			const only = options.has('only') ? new Set(symbols(options.get('only'))) : undefined;
			const except = new Set(symbols(options.get('except')));
			for (const nameNode of positional) {
				const name = stringValue(nameNode);
				if (!name) continue;
				const segment = options.get('path') ? stringValue(options.get('path'))! : name;
				const base = scope.resource ? `${scope.resource.member.replace(/\/:id$/, '')}/:${singular(scope.resource.collection.split('/').pop()!)}_id` : scope.path;
				const collection = joinPath(base, segment);
				const param = options.get('param') ? stringValue(options.get('param'))! : 'id';
				const controller = scope.module + (options.get('controller') ? stringValue(options.get('controller'))! : plural ? name : `${name}s`);
				for (const [action, verb, suffix] of plural ? RESOURCES : RESOURCE) {
					if ((only && !only.has(action)) || except.has(action)) continue;
					out.push({ verb, path: railsPath(collection + suffix.replace(':id', `:${param}`)), controller, action, line, guard: scope.guard });
				}
				if (inner) {
					const member = plural ? `${collection}/:${param}` : collection;
					readRoutes(inner, { ...scope, resource: { member, collection, controller }, on: undefined }, file, out);
				}
			}
		} else if (method === 'member' || method === 'collection') {
			readRoutes(inner, { ...scope, on: method }, file, out);
		} else if (method === 'namespace') {
			const name = stringValue(positional[0]) ?? '';
			readRoutes(inner, { ...scope, resource: undefined, path: joinPath(scope.path, options.get('path') ? stringValue(options.get('path')) : name), module: `${scope.module}${options.has('module') ? stringValue(options.get('module')) : name}/` }, file, out);
		} else if (method === 'scope') {
			const path = positional[0] ? stringValue(positional[0]) : options.get('path') ? stringValue(options.get('path')) : undefined;
			const mod = options.get('module') ? `${scope.module}${stringValue(options.get('module'))}/` : scope.module;
			readRoutes(inner, { ...scope, path: path ? railsPath(joinPath(scope.path, path)) : scope.path, module: mod }, file, out);
		} else if (method === 'controller') {
			readRoutes(inner, { ...scope, controller: scope.module + (stringValue(positional[0]) ?? '') }, file, out);
		} else if (method === 'authenticate' || method === 'authenticated') {
			const who = positional[0] ? stringValue(positional[0]) : undefined;
			const lambda = positional.find((p) => p.type === 'lambda');
			const predicate = lambda ? [...descendants(lambda, 'identifier')].map((n) => n.text).find((t) => t.endsWith('?')) : undefined;
			const role = predicate ? predicate.replace(/\?$/, '') : who && who !== 'user' ? who : null;
			readRoutes(inner, { ...scope, guard: { role, file, line, how: `${method} ${call.childForFieldName('arguments')?.text ?? ''}`.trim() } }, file, out);
		} else if (method === 'devise_for') {
			const name = stringValue(positional[0]) ?? 'users';
			const base = joinPath(scope.path, name);
			for (const [verb, suffix, action] of [['GET', '/sign_in', 'sessions#new'], ['POST', '/sign_in', 'sessions#create'], ['DELETE', '/sign_out', 'sessions#destroy'], ['GET', '/password/new', 'passwords#new'], ['POST', '/password', 'passwords#create'], ['GET', '/sign_up', 'registrations#new'], ['POST', '', 'registrations#create']] as const) {
				out.push({ verb, path: joinPath(base, suffix), controller: `devise/${action.split('#')[0]}`, action: action.split('#')[1], line, guard: scope.guard });
			}
		} else if (method === 'mount') {
			const at = options.get('at') ? stringValue(options.get('at')) : arrow ? stringValue(arrow[1]) : undefined;
			if (at) out.push({ verb: '*', path: joinPath(scope.path, at, '*rest?'), line, guard: scope.guard });
		} else if (inner) readRoutes(inner, scope, file, out);
	}
}

interface ControllerInfo {
	name: string;
	file: string;
	superclass?: string;
	before: { name: string; only?: Set<string>; except?: Set<string>; line: number }[];
	skip: { name: string; only?: Set<string>; except?: Set<string> }[];
	actions: Map<string, number>;
}

const AUTH_CALLBACK = /authenticat|require_(login|user|admin|role|signed|staff)|authoriz|ensure_(admin|logged|signed|user|staff)|logged_in|signed_in|admin_only|check_admin|verify_admin|require_admin/i;

/** `authenticate_user!` signs in any user (null); `require_admin` asks for the admin role. */
export function roleFromCallback(name: string): string | null {
	const rest = name.replace(/[!?]$/, '').replace(/^(authenticate|require|authorize|ensure|check|verify|must_be)_?/, '').replace(/_?(only|required|user|is_)$/, '').replace(/^(is_|an?_)/, '');
	return !rest || /^(user|login|logged_in|signed_in|authenticated|session|current_user|auth)$/.test(rest) ? null : rest;
}

async function readControllers(ctx: Context): Promise<Map<string, ControllerInfo>> {
	const byName = new Map<string, ControllerInfo>();
	for (const file of ctx.project.files) {
		const m = /^app\/controllers\/(.+)_controller\.rb$/.exec(file);
		if (!m) continue;
		const root = await parseTree('ruby', await ctx.project.read(file));
		for (const cls of descendants(root, 'class')) {
			const sup = cls.childForFieldName('superclass');
			const info: ControllerInfo = { name: m[1]!, file, superclass: sup ? named(sup)[0]?.text : undefined, before: [], skip: [], actions: new Map() };
			for (const node of named(cls.childForFieldName('body'))) {
				if (node.type === 'method') info.actions.set(node.childForFieldName('name')?.text ?? '', lineOf(node));
				if (node.type !== 'call') continue;
				const method = node.childForFieldName('method')?.text;
				if (method !== 'before_action' && method !== 'skip_before_action' && method !== 'before_filter') continue;
				const { positional, options } = args(node);
				const only = options.has('only') ? new Set(symbols(options.get('only'))) : undefined;
				const except = options.has('except') ? new Set(symbols(options.get('except'))) : undefined;
				for (const p of positional) {
					const name = stringValue(p);
					if (!name) continue;
					if (method === 'skip_before_action') info.skip.push({ name, only, except });
					else info.before.push({ name, only, except, line: lineOf(node) });
				}
			}
			byName.set(cls.childForFieldName('name')?.text ?? m[1]!, info);
			byName.set(`@${m[1]}`, info);
		}
	}
	return byName;
}

const applies = (rule: { only?: Set<string>; except?: Set<string> }, action: string) => (!rule.only || rule.only.has(action)) && !rule.except?.has(action);

export interface RailsFound {
	routes: SourceRoute[];
	writes: Write[];
	guards: AuthGuard[];
}

export async function railsRoutes(ctx: Context): Promise<RailsFound> {
	const file = 'config/routes.rb';
	const found: RailsFound = { routes: [], writes: [], guards: [] };
	if (!ctx.project.has(file)) return found;
	const root = await parseTree('ruby', await ctx.project.read(file));
	const draw = [...descendants(root, 'call')].find((c) => c.childForFieldName('method')?.text === 'draw');
	const declared: Declared[] = [];
	readRoutes(draw ? block(draw) : root, { path: '', module: '' }, file, declared);
	const controllers = await readControllers(ctx);
	const guards = new Map<string, AuthGuard>();
	for (const d of declared) {
		const info = d.controller ? controllers.get(`@${d.controller}`) : undefined;
		const handler = info && d.action && info.actions.has(d.action) ? { file: info.file, line: info.actions.get(d.action)! } : { file, line: d.line };
		if (d.verb === 'GET' || d.verb === '*') {
			const endpoint = d.verb === '*' || d.path.startsWith('/api');
			found.routes.push({ path: d.path, file, line: d.line, dynamic: isDynamic(d.path), kind: endpoint ? 'endpoint' : 'page', methods: [d.verb] });
		}
		if (d.verb !== 'GET') found.writes.push({ method: d.verb, path: d.path, handler, via: 'route' });
		const routeGuards: Guard[] = d.guard ? [d.guard] : [];
		const chain: ControllerInfo[] = [];
		for (let c = info, i = 0; c && i < 10; c = c.superclass ? (controllers.get(c.superclass) ?? controllers.get(c.superclass.split('::').pop()!)) : undefined, i++) chain.push(c);
		const skipped = (name: string) => chain.some((c) => c.skip.some((s) => s.name === name && applies(s, d.action ?? '')));
		for (const c of chain) {
			for (const b of c.before) {
				if (AUTH_CALLBACK.test(b.name) && applies(b, d.action ?? '') && !skipped(b.name)) routeGuards.push({ role: roleFromCallback(b.name), file: c.file, line: b.line, how: `before_action :${b.name}` });
			}
		}
		for (const g of routeGuards) {
			const key = `${g.file}:${g.line}:${g.how}`;
			const entry = guards.get(key) ?? { role: g.role, file: g.file, line: g.line, routes: [], how: g.how };
			if (d.verb === 'GET' || d.verb === '*') {
				if (!entry.routes.includes(d.path)) entry.routes.push(d.path);
			} else (entry.writes ??= []).push(`${d.verb} ${d.path}`);
			guards.set(key, entry);
			if (d.controller?.startsWith('devise/sessions') && d.verb === 'GET') entry.redirectTo ??= d.path;
		}
	}
	const login = declared.find((d) => d.controller === 'devise/sessions' && d.verb === 'GET');
	if (login) for (const g of guards.values()) g.redirectTo ??= login.path;
	found.guards = [...guards.values()];
	return found;
}
