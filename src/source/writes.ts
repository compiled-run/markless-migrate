import { posix } from 'node:path';
import { WRITE_METHODS, type Context } from './context.ts';
import { isConfigFile, isScript, isTestFile, resolveImport } from './files.ts';
import { enclosingFunction, functionOf, isFunction, keyName, memberName, property, str, unwrap, urlText, walk, type Module, type N } from './js.ts';
import { jsxAttr, jsxValue } from './routes/config.ts';
import { methodExports } from './routes/files.ts';
import { Reacher, Sdks } from './sdk.ts';
import { matchRoute } from './pattern.ts';
import type { SourceRoute, Write } from './types.ts';

const HTTP_CLIENTS = /^(axios|ky|ofetch|redaxios|got|superagent|wretch|ky-universal)$/;

/** HTTP method and URL of a non-GET request call, or undefined when the call is not one or reads. */
async function requestOf(ctx: Context, mod: Module, call: N, scope?: N): Promise<{ method: string; url: string | null } | undefined> {
	const name = memberName(call.callee);
	if (!name) return undefined;
	const args = call.arguments as N[];
	const url = (n: N | undefined) => urlText(n, mod, scope) ?? null;
	const methodIn = (opts: N | undefined) => str(property(opts, 'method'), mod)?.toUpperCase();
	if (/^(fetch|window\.fetch|globalThis\.fetch|\$fetch|useFetch|useLazyFetch|ofetch|\$api)$/.test(name)) {
		const m = methodIn(args[1]);
		if (isGraphqlRequest(args[0], args[1], mod)) return undefined;
		return m && WRITE_METHODS.has(m) ? { method: m, url: url(args[0]) } : undefined;
	}
	if (name === 'navigator.sendBeacon') return { method: 'POST', url: url(args[0]) };
	if (/\.open$/.test(name) && args.length >= 2) {
		const m = str(args[0], mod)?.toUpperCase();
		if (m && WRITE_METHODS.has(m) && /^(xhr|req|request|http)\.open$/i.test(name)) return { method: m, url: url(args[1]) };
	}
	const root = name.split(/[.(]/)[0]!;
	if (!(await isHttpClient(ctx, mod, root))) return undefined;
	const verb = /\.(post|put|patch|delete)$/.exec(name)?.[1];
	if (verb === 'post' && /graphql/i.test(url(args[0]) ?? '')) return undefined;
	if (verb) return { method: verb.toUpperCase(), url: url(args[0]) };
	if (name === root || /\.request$/.test(name)) {
		const opts = unwrap(args[0])?.type === 'ObjectExpression' ? args[0] : args[1];
		const m = methodIn(opts);
		if (m && WRITE_METHODS.has(m)) return { method: m, url: unwrap(args[0])?.type === 'ObjectExpression' ? url(property(args[0], 'url')) : url(args[0]) };
	}
	return undefined;
}

export async function isHttpClient(ctx: Context, mod: Module, name: string, depth = 0): Promise<boolean> {
	if (depth > 3) return false;
	const imported = mod.imports.get(name);
	if (imported) {
		if (HTTP_CLIENTS.test(imported.source)) return true;
		const file = resolveImport(ctx.project, mod.file, imported.source);
		const other = file ? await ctx.module(file) : undefined;
		const exported = other?.exports.get(imported.imported);
		return !!other && !!exported && createsClient(ctx, other, exported, depth + 1);
	}
	const bound = mod.bindings.get(name);
	return !!bound && createsClient(ctx, mod, bound, depth + 1);
}

async function createsClient(ctx: Context, mod: Module, node: N, depth: number): Promise<boolean> {
	const n = unwrap(node);
	if (n?.type === 'Identifier') return isHttpClient(ctx, mod, n.name, depth);
	if (n?.type !== 'CallExpression') return false;
	const name = memberName(n.callee) ?? '';
	const root = name.split('.')[0]!;
	return /\.(create|extend)$/.test(name) && (await isHttpClient(ctx, mod, root, depth));
}

function isGraphqlRequest(target: N | undefined, opts: N | undefined, mod: Module): boolean {
	if (/graphql/i.test(urlText(target, mod) ?? '')) return true;
	const body = unwrap(property(opts, 'body'));
	return body?.type === 'CallExpression' && memberName(body.callee) === 'JSON.stringify' && !!property(body.arguments[0], 'query');
}

const directive = (body: N | undefined, value: string) => !!body && Array.isArray(body.body) && (body.body as N[]).some((s) => s.directive === value);

export interface WriteSites {
	writes: Write[];
	/** Writes read from markup forms alone, without a handler behind them. */
	plain?: ReadonlySet<Write>;
	/** Function nodes behind each write, so touched SDKs can be followed. */
	handlers: Map<Write, { mod: Module; fn: N }>;
}

const FORM_TAG = /<(form|Form)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const SERVER_URL = /\b(admin_url|home_url|site_url|url|asset)\(\s*['"]([^'"]*)['"]\s*\)/;
const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\}|([^\\s>]+))`, 'i').exec(attrs)?.slice(1).find((v) => v !== undefined);

/** Non-GET `<form>` tags in markup (HTML, ERB, Blade, Django and component templates), with method overrides. */
export function markupForms(file: string, text: string): Write[] {
	const out: Write[] = [];
	const lineAt = (i: number) => text.slice(0, i).split('\n').length;
	for (const m of text.matchAll(FORM_TAG)) {
		const attrs = m[2]!;
		const close = text.indexOf('</form', m.index!);
		const body = text.slice(m.index!, close === -1 ? undefined : close);
		const override = /name=["']_method["'][^>]*value=["'](\w+)["']|value=["'](\w+)["'][^>]*name=["']_method["']|@method\(\s*['"](\w+)['"]\s*\)|method_field\(\s*['"](\w+)['"]/i.exec(body);
		const method = (override?.slice(1).find(Boolean) ?? attr(attrs, 'method') ?? attr(attrs, ':method') ?? 'GET').toUpperCase();
		if (!WRITE_METHODS.has(method)) continue;
		const action = attr(attrs, 'action') ?? null;
		const serverUrl = (code: string) => {
			const call = SERVER_URL.exec(code);
			if (!call) return ':param';
			return call[1] === 'admin_url' ? `/wp-admin/${call[2]!.replace(/^\//, '')}` : call[2]!.startsWith('/') ? call[2]! : `/${call[2]}`;
		};
		const path = action && /[{<]/.test(action) ? action.replace(/\{\{([^}]*)\}\}|\{%([^%]*)%\}|<%=?([^%]*)%>|<\?(?:php|=)([\s\S]*?)\?>/g, (_, a, b, c, d) => serverUrl(a ?? b ?? c ?? d ?? '')) : action;
		out.push({ method, path, handler: { file, line: lineAt(m.index!) }, via: 'form' });
	}
	for (const m of text.matchAll(/<%=?\s*(form_with|form_for|form_tag|button_to)\b([^%]*)%>/g)) {
		const args = m[2]!;
		const method = /method:\s*:?["']?(\w+)/.exec(args)?.[1]?.toUpperCase() ?? 'POST';
		if (!WRITE_METHODS.has(method)) continue;
		const url = /url:\s*["']([^"']+)["']/.exec(args)?.[1] ?? /^\s*["']([^"']+)["']/.exec(args)?.[1] ?? null;
		out.push({ method, path: url, handler: { file, line: text.slice(0, m.index!).split('\n').length }, via: 'form' });
	}
	return out;
}

async function jsxForms(ctx: Context, mod: Module, sites: WriteSites): Promise<void> {
	const pending: Promise<void>[] = [];
	walk(mod.program, (n) => {
		if (n.type !== 'JSXElement') return;
		const name = n.openingElement.name;
		const tag = name.type === 'JSXIdentifier' ? name.name : name.type === 'JSXMemberExpression' ? name.property.name : '';
		if (tag !== 'form' && tag !== 'Form') return;
		const methodAttr = jsxAttr(n, 'method');
		const actionAttr = jsxAttr(n, 'action');
		const actionExpr = actionAttr?.type === 'JSXExpressionContainer' ? unwrap(actionAttr.expression) : undefined;
		let method = (jsxValue(methodAttr, mod) ?? 'GET').toUpperCase();
		pending.push(
			(async () => {
				let fn: { mod: Module; fn: N } | undefined;
				if (actionExpr && (actionExpr.type === 'Identifier' || isFunction(actionExpr) || actionExpr.type === 'MemberExpression' || actionExpr.type === 'CallExpression')) {
					method = 'POST';
					fn = await resolveFunction(ctx, mod, actionExpr);
				}
				if (!WRITE_METHODS.has(method)) return;
				const path = actionExpr ? null : (jsxValue(actionAttr, mod) ?? (actionAttr?.type === 'JSXExpressionContainer' ? (urlText(actionAttr.expression, mod) ?? null) : null));
				const write: Write = { method, path, handler: fn ? { file: fn.mod.file, line: fn.mod.line(fn.fn.start) } : { file: mod.file, line: mod.line(n.start) }, via: 'form' };
				sites.writes.push(write);
				if (fn) sites.handlers.set(write, fn);
			})(),
		);
	});
	await Promise.all(pending);
}

async function resolveFunction(ctx: Context, mod: Module, node: N, depth = 0): Promise<{ mod: Module; fn: N } | undefined> {
	const n = unwrap(node);
	if (!n || depth > 4) return undefined;
	if (isFunction(n)) return { mod, fn: n };
	if (n.type === 'CallExpression') {
		const callee = memberName(n.callee);
		if (callee && /\.bind$/.test(callee)) return resolveFunction(ctx, mod, n.callee.object, depth + 1);
		return n.arguments[0] ? resolveFunction(ctx, mod, n.arguments[0], depth + 1) : undefined;
	}
	if (n.type !== 'Identifier') return undefined;
	const local = functionOf(mod.bindings.get(n.name), mod);
	if (local) return { mod, fn: local };
	const imported = mod.imports.get(n.name);
	const file = imported && resolveImport(ctx.project, mod.file, imported.source);
	const other = file ? await ctx.module(file) : undefined;
	const fn = other ? functionOf(other.exports.get(imported!.imported), other) : undefined;
	return other && fn ? { mod: other, fn } : undefined;
}

/** Whether a handler reads a request body, the sign that a method-agnostic handler accepts writes. */
function readsBody(fn: N): boolean {
	let found = false;
	walk(fn, (n) => {
		if (found) return false;
		const name = n.type === 'CallExpression' ? (memberName(n.callee) ?? '') : n.type === 'MemberExpression' ? (memberName(n) ?? '') : '';
		if (/(^|\.)(readBody|readFormData|readMultipartFormData|readValidatedBody|formData|json|text|arrayBuffer)$/.test(name) && !/^(Response|JSON|res|c)\./.test(name)) found = true;
		if (/(^|\.)(req|request)\.body$/.test(name)) found = true;
	});
	return found;
}

function methodsCompared(fn: N, mod: Module): string[] {
	const out = new Set<string>();
	walk(fn, (n) => {
		if (n.type === 'BinaryExpression' && /^[!=]==?$/.test(n.operator)) {
			const [a, b] = [n.left, n.right];
			const side = /\.method$/.test(memberName(a) ?? '') ? b : /\.method$/.test(memberName(b) ?? '') ? a : undefined;
			const v = side && str(side, mod)?.toUpperCase();
			if (v && WRITE_METHODS.has(v) && n.operator.startsWith('=')) out.add(v);
		}
		if (n.type === 'SwitchStatement' && /\.method$/.test(memberName(n.discriminant) ?? '')) {
			for (const c of n.cases as N[]) {
				const v = c.test && str(c.test, mod)?.toUpperCase();
				if (v && WRITE_METHODS.has(v)) out.add(v);
			}
		}
	});
	return [...out];
}

/** Writes declared by the route modules themselves: endpoint method exports, Remix/RR actions, SvelteKit form actions. */
async function routeWrites(ctx: Context, routes: SourceRoute[], sites: WriteSites, conditional: Set<Write>): Promise<void> {
	const seen = new Set<string>();
	for (const r of routes) {
		if (!isScript(r.file) || seen.has(`${r.file}@${r.path}`)) continue;
		seen.add(`${r.file}@${r.path}`);
		const mod = await ctx.module(r.file);
		if (!mod) continue;
		const push = (method: string, path: string | null, fn: N | undefined, via: Write['via']) => {
			const write: Write = { method, path, handler: { file: mod.file, line: fn ? mod.line(fn.start) : r.line }, via };
			sites.writes.push(write);
			const f = fn && functionOf(fn, mod);
			if (f) sites.handlers.set(write, { mod, fn: f });
			return write;
		};
		const anyMethod = (write: Write, fn: N | undefined) => {
			const f = fn && functionOf(fn, mod);
			if (!f || !readsBody(f)) conditional.add(write);
		};
		if (r.kind === 'endpoint') {
			const methods = methodExports(mod);
			for (const m of methods) {
				const node = mod.exports.get(m.method === 'DELETE' && !mod.exports.has('DELETE') ? 'DEL' : m.method);
				if (WRITE_METHODS.has(m.method)) push(m.method, r.path, node, 'route-handler');
				else if (m.method === 'ALL') anyMethod(push('*', r.path, node, 'route-handler'), node);
			}
			if (!methods.length) {
				const def = mod.exports.get('default');
				const fn = def && functionOf(def, mod);
				if (fn) {
					const declared = r.methods?.filter((m) => m !== 'ALL' && m !== 'GET') ?? [];
					const compared = methodsCompared(fn, mod);
					if (declared.length || compared.length) for (const m of declared.length ? declared : compared) push(m, r.path, def, 'route-handler');
					else if (!r.methods?.includes('GET')) anyMethod(push('*', r.path, def, 'route-handler'), def);
				}
			}
		}
		const action = mod.exports.get('action') ?? mod.exports.get('clientAction');
		if (action && !posix.basename(mod.file).startsWith('+')) {
			const fn = functionOf(action, mod);
			const compared = fn ? methodsCompared(fn, mod) : [];
			for (const m of new Set(['POST', ...compared])) push(m, r.path, action, 'form');
		}
		const actions = unwrap(mod.exports.get('actions'));
		if (actions?.type === 'ObjectExpression') {
			for (const p of actions.properties as N[]) {
				const key = p.type === 'Property' ? keyName(p.key) : undefined;
				if (!key) continue;
				push('POST', key === 'default' ? r.path : `${r.path}?/${key}`, p.value.type === 'Identifier' ? mod.bindings.get(p.value.name) : p.value, 'form');
			}
		}
	}
}

export async function scanWrites(ctx: Context, routes: SourceRoute[]): Promise<WriteSites> {
	const sites: WriteSites = { writes: [], handlers: new Map() };
	const plain = new Set<Write>();
	const conditional = new Set<Write>();
	const sdks = new Sdks(ctx);
	const pageRoutes = routes.filter((r) => isScript(r.file));
	const serverRouteFiles = new Set(pageRoutes.map((r) => r.file));
	const svelteKitActions = routes.filter((r) => /\+page\.server\.[jt]s$/.test(r.file));
	for (const r of routes) {
		if (!/\+page\.svelte$/.test(r.file)) continue;
		for (const ext of ['ts', 'js']) {
			const server = `${posix.dirname(r.file)}/+page.server.${ext}`;
			if (ctx.project.has(server)) svelteKitActions.push({ ...r, file: server });
		}
	}
	await routeWrites(ctx, [...routes.filter((r) => r.kind === 'endpoint' || serverRouteFiles.has(r.file)), ...svelteKitActions], sites, conditional);
	for (const file of ctx.project.files) {
		if (isTestFile(file) || isConfigFile(file)) continue;
		if (!isScript(file)) {
			if (/\.(html?|erb|php|hbs|njk|twig|liquid)$/.test(file)) for (const w of markupForms(file, await ctx.project.read(file))) plain.add(w), sites.writes.push(w);
			continue;
		}
		const mod = await ctx.module(file);
		if (!mod) continue;
		if (mod.template) for (const w of markupForms(file, mod.template)) plain.add(w), sites.writes.push(w);
		const fileServer = directive(mod.program, 'use server');
		if (fileServer) {
			for (const [, node] of mod.exports) {
				const fn = functionOf(node, mod);
				if (!fn) continue;
				const write: Write = { method: 'POST', path: null, handler: { file, line: mod.line(fn.start) }, via: 'server-action' };
				sites.writes.push(write);
				sites.handlers.set(write, { mod, fn });
			}
		}
		const calls: { node: N; fn: N | undefined }[] = [];
		walk(mod.program, (n, ancestors) => {
			if (isFunction(n) && !fileServer && directive(n.body, 'use server')) {
				const write: Write = { method: 'POST', path: null, handler: { file, line: mod.line(n.start) }, via: 'server-action' };
				sites.writes.push(write);
				sites.handlers.set(write, { mod, fn: n });
			}
			if (n.type === 'CallExpression') {
				calls.push({ node: n, fn: enclosingFunction(ancestors) });
				const callee = memberName(n.callee);
				if (callee && /^(createServerFn|createServerFn\(\)\.\w+)/.test(callee)) {
					const opts = unwrap(n.arguments[0]);
					const method = str(property(opts, 'method'), mod)?.toUpperCase();
					if (callee === 'createServerFn' && method && WRITE_METHODS.has(method)) {
						const write: Write = { method, path: null, handler: { file, line: mod.line(n.start) }, via: 'server-action' };
						sites.writes.push(write);
					}
				}
				if (callee === 'action' && mod.imports.get('action')?.source === '@solidjs/router') {
					const fn = functionOf(n.arguments[0], mod);
					const write: Write = { method: 'POST', path: null, handler: { file, line: mod.line((fn ?? n).start) }, via: 'server-action' };
					sites.writes.push(write);
					if (fn) sites.handlers.set(write, { mod, fn });
				}
			}
		});
		if (/<form|<Form|\.Form/.test(mod.text)) {
			const before = sites.writes.length;
			await jsxForms(ctx, mod, sites);
			for (const w of sites.writes.slice(before)) if (!sites.handlers.has(w)) plain.add(w);
		}
		for (const c of calls) {
			const req = await requestOf(ctx, mod, c.node, c.fn);
			if (req) sites.writes.push({ method: req.method, path: req.url, handler: { file, line: mod.line(c.node.start) }, via: 'fetch' });
		}
	}
	const reacher = new Reacher(ctx, sdks);
	const handled = new Set<N>();
	for (const [write, { mod, fn }] of sites.handlers) {
		const r = await reacher.reach(mod, fn);
		if (r.touches.size) write.touches = [...r.touches].sort();
		for (const m of r.mutations) handled.add(m.node);
	}
	for (const file of ctx.project.files) {
		if (!isScript(file) || isTestFile(file) || isConfigFile(file)) continue;
		const text = await ctx.project.read(file);
		if (!/prisma|drizzle|supabase|stripe|mongo|firebase|knex|kysely|sql|redis|kv|sanity|contentful|paypal|lemonsqueezy|braintree|adyen|square|paddle|sequelize|typeorm|mikro-orm|shopify/i.test(text)) continue;
		const mod = await ctx.module(file);
		if (!mod) continue;
		const fns: N[] = [];
		walk(mod.program, (n) => {
			if (isFunction(n)) fns.push(n);
		});
		const covered = new Set<N>();
		for (const fn of fns) {
			const r = await reacher.reach(mod, fn, 4);
			for (const m of r.mutations) {
				if (m.mod !== mod || covered.has(m.node) || handled.has(m.node)) continue;
				covered.add(m.node);
				sites.writes.push({ method: 'SDK', path: null, handler: { file, line: mod.line(m.node.start) }, via: 'sdk', touches: [m.sdk] });
			}
		}
	}
	for (const w of conditional) if (!w.touches?.length) sites.writes.splice(sites.writes.indexOf(w), 1);
	const routeOf = new Map<string, string>();
	for (const r of routes) if (r.kind === 'page' && !routeOf.has(r.file)) routeOf.set(r.file, r.path);
	for (const w of plain) {
		const own = routeOf.get(w.handler.file);
		if (own && (w.path === null || w.path.startsWith('?'))) w.path = own === '/' && w.path ? w.path : `${own}${w.path ?? ''}`;
	}
	sites.plain = plain;
	return sites;
}

/** Drops markup forms that post where a declared handler already answers, and merges writes at one location. */
export function settleWrites(writes: Write[], plain: ReadonlySet<Write>): Write[] {
	const strip = (p: string) => p.replace(/\/+(?=$|\?)/, '') || '/';
	const kept = writes.filter((w) => !plain.has(w) || !writes.some((x) => !plain.has(x) && x.method === w.method && x.path !== null && w.path !== null && (strip(x.path) === strip(w.path) || (!x.path.includes('?') && !w.path.includes('?') && matchRoute(x.path, w.path)))));
	const unique = new Map<string, Write>();
	for (const w of kept) {
		const key = `${w.handler.file}:${w.handler.line}:${w.method}:${w.path}`;
		const prior = unique.get(key);
		if (!prior) unique.set(key, { ...w });
		else {
			if (prior.via === 'form' && w.via !== 'form') prior.via = w.via;
			if (w.touches) prior.touches = [...new Set([...(prior.touches ?? []), ...w.touches])].sort();
		}
	}
	return [...unique.values()];
}
