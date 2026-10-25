import { Kind, parse, type DocumentNode, type SelectionSetNode } from 'graphql';
import type { Context } from './context.ts';
import { isConfigFile, isScript, isTestFile, resolveImport } from './files.ts';
import { enclosingFunction, functionOf, isFunction, keyName, memberName, patternNames, property, queryText, staticValue, str, unwrap, urlText, walk, known, type Module, type N } from './js.ts';
import { Sdks } from './sdk.ts';
import { isHttpClient } from './writes.ts';
import type { Client, Write } from './types.ts';

const CMS: [RegExp, string][] = [
	[/^contentful$/, 'contentful'],
	[/^(@sanity\/client|next-sanity|@sanity\/react-loader|@sanity\/svelte-loader|@nuxtjs\/sanity|astro-sanity|@sanity\/astro)/, 'sanity'],
	[/^@prismicio\/client/, 'prismic'],
	[/^(@storyblok\/|storyblok-js-client)/, 'storyblok'],
	[/^@builder\.io\/sdk/, 'builder'],
	[/^@directus\/sdk/, 'directus'],
	[/^(@strapi\/client|strapi-sdk-js|@nuxtjs\/strapi)/, 'strapi'],
	[/^@tryghost\/content-api/, 'ghost'],
	[/^(@datocms\/|datocms-)/, 'datocms'],
	[/^@wordpress\/api-fetch/, 'wordpress-rest'],
	[/^(@shopify\/storefront-api-client|@shopify\/hydrogen-react)/, 'shopify-storefront'],
	[/^(@hygraph\/|graphcms)/, 'hygraph'],
	[/^(payload|payload\/)/, 'payload'],
	[/^@keystatic\//, 'keystatic'],
	[/^@algolia\/|^algoliasearch/, 'algolia'],
];
const GQL_TAGS = /^(gql|graphql|groq|defineQuery)$/;
const GQL_KEYWORD = /^\s*(query|mutation|subscription|fragment)\b/;
// A schema (Apollo Server's typeDefs) defines the server's types; no page sends it.
const GQL_SCHEMA = /^(\s*#[^\n]*\n)*\s*(type|input|enum|scalar|interface|union|schema|directive|extend)\b/;
const ARRAY_METHODS = /^(map|forEach|filter|find|findIndex|some|every|flatMap|reduce|sort|slice|at|includes|join|length|concat|keys|values|entries|toString|then|json|text)$/;

/** Leaf field paths a GraphQL document selects, keyed by response name; `shared` holds fragments other files define. */
export function graphqlFields(doc: DocumentNode, shared: ReadonlyMap<string, SelectionSetNode> = new Map()): string[] {
	const fragments = new Map([...shared, ...doc.definitions.filter((d) => d.kind === Kind.FRAGMENT_DEFINITION).map((d) => [d.name.value, d.selectionSet] as const)]);
	const out: string[] = [];
	const visit = (set: SelectionSetNode, prefix: string, depth: number) => {
		if (depth > 12) return;
		for (const sel of set.selections) {
			if (sel.kind === Kind.FIELD) {
				const key = prefix + (sel.alias?.value ?? sel.name.value);
				if (sel.selectionSet) visit(sel.selectionSet, `${key}.`, depth + 1);
				else if (sel.name.value !== '__typename') out.push(key);
			} else if (sel.kind === Kind.INLINE_FRAGMENT) visit(sel.selectionSet, prefix, depth + 1);
			else {
				const frag = fragments.get(sel.name.value);
				if (frag) visit(frag, prefix, depth + 1);
				else out.push(`${prefix}...${sel.name.value}`);
			}
		}
	};
	for (const d of doc.definitions) if (d.kind === Kind.OPERATION_DEFINITION) visit(d.selectionSet, '', 0);
	if (!doc.definitions.some((d) => d.kind === Kind.OPERATION_DEFINITION)) for (const d of doc.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) visit(d.selectionSet, '', 0);
	return [...new Set(out)];
}

/** Top-level and nested keys of the first GROQ projection, e.g. `title`, `author.name`. */
export function groqFields(query: string): string[] {
	const start = (() => {
		let depth = 0;
		let quote = '';
		for (let i = 0; i < query.length; i++) {
			const ch = query[i]!;
			if (quote) {
				if (ch === '\\') i++;
				else if (ch === quote) quote = '';
			} else if (ch === '"' || ch === "'") quote = ch;
			else if (ch === '[' || ch === '(') depth++;
			else if (ch === ']' || ch === ')') depth--;
			else if (ch === '{' && depth === 0) return i;
		}
		return -1;
	})();
	if (start < 0) return [];
	const out: string[] = [];
	const block = (from: number, prefix: string): number => {
		let i = from + 1;
		let item = '';
		const flush = (inner?: [number, number]) => {
			const text = item.trim();
			item = '';
			if (!text || text.startsWith('...')) return;
			const alias = /^"([^"]+)"\s*:/.exec(text)?.[1];
			const name = alias ?? /^([A-Za-z_]\w*)/.exec(text)?.[1];
			if (!name) return;
			if (inner && !alias) block(inner[0], `${prefix}${name}.`);
			else out.push(prefix + name);
		};
		let inner: [number, number] | undefined;
		let quote = '';
		let depth = 0;
		for (; i < query.length; i++) {
			const ch = query[i]!;
			if (quote) {
				item += ch;
				if (ch === '\\') item += query[++i] ?? '';
				else if (ch === quote) quote = '';
				continue;
			}
			if (ch === '"' || ch === "'") {
				quote = ch;
				item += ch;
			} else if (ch === '[' || ch === '(') {
				depth++;
				item += ch;
			} else if (ch === ']' || ch === ')') {
				depth--;
				item += ch;
			} else if (ch === '{' && depth === 0) {
				const end = skip(query, i);
				inner = [i, end];
				i = end;
			} else if (ch === '}' && depth === 0) {
				flush(inner);
				return i;
			} else if (ch === ',' && depth === 0) {
				flush(inner);
				inner = undefined;
			} else item += ch;
		}
		flush(inner);
		return i;
	};
	block(start, '');
	return [...new Set(out)];
}

function skip(text: string, open: number): number {
	let depth = 0;
	let quote = '';
	for (let i = open; i < text.length; i++) {
		const ch = text[i]!;
		if (quote) {
			if (ch === '\\') i++;
			else if (ch === quote) quote = '';
		} else if (ch === '"' || ch === "'") quote = ch;
		else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return i;
	}
	return text.length;
}

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Property paths read off a value, through destructuring and array callbacks, inside `scope`. */
export function fieldsRead(scope: N, names: Map<string, string>): string[] {
	const out = new Set<string>();
	const pathOf = (n: N): { root: string; path: string[] } | undefined => {
		if (n.type === 'Identifier') return names.has(n.name) ? { root: n.name, path: [] } : undefined;
		if (n.type === 'MemberExpression' || (n.type === 'ChainExpression' && n.expression.type === 'MemberExpression')) {
			const m = n.type === 'ChainExpression' ? n.expression : n;
			const inner = pathOf(m.object);
			if (!inner) return undefined;
			if (m.computed) return m.property.type === 'Literal' && typeof m.property.value === 'string' ? { root: inner.root, path: [...inner.path, m.property.value] } : inner;
			return { root: inner.root, path: [...inner.path, m.property.name] };
		}
		if (n.type === 'TSNonNullExpression' || n.type === 'AwaitExpression' || n.type === 'TSAsExpression' || n.type === 'ParenthesizedExpression') return pathOf(n.expression ?? n.argument);
		if (n.type === 'LogicalExpression') return pathOf(n.left);
		if (n.type === 'ChainExpression') return pathOf(n.expression);
		return undefined;
	};
	const record = (root: string, path: string[]) => {
		const clean = path.filter((p) => !ARRAY_METHODS.test(p));
		const prefix = names.get(root)!;
		const full = [prefix, ...clean].filter(Boolean).join('.');
		if (full) out.add(full);
	};
	let changed = true;
	for (let pass = 0; changed && pass < 6; pass++) {
		changed = false;
		walk(scope, (n, ancestors) => {
			if (n.type === 'VariableDeclarator' && n.init) {
				const p = pathOf(unwrap(n.init)!);
				if (!p) return;
				const base = [names.get(p.root)!, ...p.path.filter((x) => !ARRAY_METHODS.test(x))].filter(Boolean).join('.');
				const bind = (pattern: N, prefix: string) => {
					if (pattern.type === 'Identifier' && !names.has(pattern.name)) {
						names.set(pattern.name, prefix);
						changed = true;
					} else if (pattern.type === 'ObjectPattern') {
						for (const prop of pattern.properties as N[]) {
							if (prop.type !== 'Property') continue;
							const key = keyName(prop.key);
							if (key) bind(prop.value.type === 'AssignmentPattern' ? prop.value.left : prop.value, [prefix, key].filter(Boolean).join('.'));
						}
					} else if (pattern.type === 'ArrayPattern') for (const el of pattern.elements as N[]) if (el) bind(el, prefix);
				};
				bind(n.id, base);
				return;
			}
			if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && /^(map|forEach|filter|find|flatMap|some|every|sort|reduce)$/.test(n.callee.property.name)) {
				const p = pathOf(n.callee.object);
				const fn = unwrap(n.arguments[0]);
				if (p && fn && isFunction(fn)) {
					const param = fn.params[n.callee.property.name === 'reduce' ? 1 : 0];
					const base = [names.get(p.root)!, ...p.path.filter((x) => !ARRAY_METHODS.test(x))].filter(Boolean).join('.');
					for (const name of param ? patternNames(param.type === 'ObjectPattern' ? { type: 'Identifier', name: '__skip', start: 0, end: 0 } : param) : []) {
						if (name !== '__skip' && !names.has(name)) {
							names.set(name, base);
							changed = true;
						}
					}
					if (param?.type === 'ObjectPattern') for (const prop of param.properties as N[]) if (prop.type === 'Property' && keyName(prop.key)) out.add([base, keyName(prop.key)].filter(Boolean).join('.'));
				}
			}
			if (n.type === 'MemberExpression') {
				const parent = ancestors.at(-1);
				if (parent?.type === 'MemberExpression' && parent.object === n) return;
				const p = pathOf(n);
				if (p) record(p.root, p.path);
			}
			if (n.type === 'Identifier' && names.get(n.name)) {
				const parent = ancestors.at(-1);
				const binding = !parent || (parent.type === 'MemberExpression' && (parent.object === n || (parent.property === n && !parent.computed))) || (parent.type === 'VariableDeclarator' && parent.id === n) || (parent.type === 'Property' && (parent.key === n || ancestors.at(-2)?.type === 'ObjectPattern')) || parent.type === 'ArrayPattern' || (isFunction(parent) && (parent.params as N[]).includes(n));
				if (!binding) record(n.name, []);
			}
		});
	}
	return [...out].filter((f) => ![...out].some((o) => o !== f && o.startsWith(`${f}.`))).sort();
}

/** The value a call's result is bound to (`const x = await call`, `.then(r => r.json())`, `const r = await call; const x = await r.json()`). */
function resultNames(scope: N, call: N): Map<string, string> {
	const names = new Map<string, string>();
	let holder: N | undefined;
	walk(scope, (n) => {
		if (holder) return false;
		if (n.type === 'VariableDeclarator' && n.init) {
			let init = unwrap(n.init);
			while (init && init.type === 'CallExpression' && init.callee.type === 'MemberExpression' && /^(then|json)$/.test(init.callee.property.name) && init !== call) init = unwrap(init.callee.object);
			if (init === call) holder = n;
		}
	});
	walk(scope, (n) => {
		if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.property.name !== 'then') return;
		let object = unwrap(n.callee.object);
		let json = false;
		while (object && object !== call && object.type === 'CallExpression' && object.callee.type === 'MemberExpression') {
			const step = object.callee.property.name;
			const cb = unwrap(object.arguments[0]);
			if (step === 'json' || (step === 'then' && cb && isFunction(cb) && /\.json\(\)$/.test(memberName(cb.body) ?? ''))) json = true;
			object = unwrap(object.callee.object);
		}
		if (object !== call) return;
		const cb = unwrap(n.arguments[0]);
		const param = cb && isFunction(cb) ? cb.params[0] : undefined;
		if (json && param?.type === 'Identifier') names.set(param.name, '');
		else if (json && param?.type === 'ObjectPattern') for (const p of param.properties as N[]) if (p.type === 'Property' && keyName(p.key) && p.value.type === 'Identifier') names.set(p.value.name, keyName(p.key)!);
	});
	if (!holder) return names;
	const add = (pattern: N, prefix: string) => {
		if (pattern.type === 'Identifier') names.set(pattern.name, prefix);
		else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties as N[]) if (p.type === 'Property' && keyName(p.key)) add(p.value, prefix ? `${prefix}.${keyName(p.key)}` : keyName(p.key) === 'data' ? '' : keyName(p.key)!);
	};
	add(holder.id, '');
	const responseVar = holder.id.type === 'Identifier' ? holder.id.name : undefined;
	if (responseVar) {
		walk(scope, (n) => {
			if (n.type === 'VariableDeclarator' && n.init) {
				const init = unwrap(n.init);
				if (init?.type === 'CallExpression' && memberName(init.callee) === `${responseVar}.json`) add(n.id, '');
			}
			if (n.type === 'CallExpression' && /^(json|text|blob|arrayBuffer)$/.test(n.callee.property?.name ?? '') && memberName(n.callee.object) === responseVar) names.delete(responseVar);
		});
	}
	return names;
}

function restKind(url: string): string {
	if (/\/wp-json\//.test(url)) return 'wordpress-rest';
	if (/strapi/i.test(url) || /\$\{[^}]*STRAPI[^}]*\}/.test(url)) return 'strapi';
	if (/cdn\.contentful\.com|preview\.contentful\.com/.test(url)) return 'contentful';
	if (/myshopify\.com\/admin/.test(url)) return 'shopify-admin';
	if (/\.api\.sanity\.io|apicdn\.sanity\.io/.test(url)) return 'sanity';
	return 'rest';
}

function baseOf(url: string): string | undefined {
	const env = /^\$\{([^}]+)\}/.exec(url)?.[1];
	if (env) return `\${${env}}`;
	const origin = /^(https?:\/\/[^/]+)/.exec(url)?.[1];
	if (origin) return origin;
	return url.startsWith('/') ? '(same origin)' : undefined;
}

function urlFields(url: string): string[] {
	const out: string[] = [];
	const query = url.split('?')[1] ?? '';
	for (const part of query.split('&')) {
		const [k, v] = part.split('=');
		if (!k || !v) continue;
		const key = decodeURIComponent(k);
		if (key === '_fields' || key === 'fields' || key === 'select') out.push(...decodeURIComponent(v).split(',').map((s) => s.replace(/^fields\./, '')));
		else if (/^fields\[\d*\]$/.test(key)) out.push(decodeURIComponent(v));
	}
	return out;
}

async function resolveQueryNode(ctx: Context, mod: Module, node: N | undefined, depth = 0): Promise<{ text: string; mod: Module } | undefined> {
	const n = unwrap(node);
	if (!n || depth > 4) return undefined;
	if (n.type === 'Identifier' && !mod.bindings.has(n.name)) {
		const imported = mod.imports.get(n.name);
		const file = imported && resolveImport(ctx.project, mod.file, imported.source);
		const other = file ? await ctx.module(file) : undefined;
		return other ? resolveQueryNode(ctx, other, other.exports.get(imported!.imported), depth + 1) : undefined;
	}
	const text = queryText(n, mod);
	return text ? { text, mod } : undefined;
}

function parseGraphql(text: string): DocumentNode | undefined {
	try {
		return parse(text);
	} catch {
		return undefined;
	}
}

export interface ClientFacts {
	clients: Client[];
	writes: Write[];
}

export async function scanClients(ctx: Context): Promise<ClientFacts> {
	const out: ClientFacts = { clients: [], writes: [] };
	const cms = new Sdks(ctx, CMS);
	const docs = new Map<string, Client>();
	// Apollo colocates fragments with components and interpolates them from other files, so a spread is resolved project-wide once every file is read.
	const parsed = new Map<Client, DocumentNode>();
	const addGraphql = (file: string, line: number, text: string, kind: string, endpoint: string | null) => {
		const doc = parseGraphql(text);
		if (!doc || !doc.definitions.some((d) => d.kind === Kind.OPERATION_DEFINITION || d.kind === Kind.FRAGMENT_DEFINITION)) return false;
		const key = `${file}\n${normalise(text)}`;
		const prior = docs.get(key);
		if (prior) {
			if (endpoint && !prior.base) prior.base = baseOf(endpoint) ?? endpoint;
			return true;
		}
		const client: Client = { kind, file, line, queries: [normalise(text)], fields: graphqlFields(doc), ...(endpoint ? { base: baseOf(endpoint) ?? endpoint } : {}) };
		docs.set(key, client);
		parsed.set(client, doc);
		out.clients.push(client);
		for (const d of doc.definitions) if (d.kind === Kind.OPERATION_DEFINITION && d.operation === 'mutation') out.writes.push({ method: 'POST', path: endpoint, handler: { file, line }, via: 'graphql-mutation' });
		return true;
	};
	const wrappers: Wrapper[] = [];
	for (const file of ctx.project.files) {
		if (isTestFile(file) || isConfigFile(file)) continue;
		if (/\.(graphql|gql)$/.test(file)) {
			const text = await ctx.project.read(file);
			addGraphql(file, 1, text, /shopify|storefront/i.test(file) ? 'shopify-storefront' : 'graphql', null);
			continue;
		}
		if (!isScript(file)) continue;
		const mod = await ctx.module(file);
		if (!mod) continue;
		const shopify = /myshopify\.com|@shopify\/|storefront/i.test(mod.text) && /graphql|storefront/i.test(mod.text);
		const endpoints = new Set<string>();
		walk(mod.program, (n) => {
			if (n.type === 'Literal' || n.type === 'TemplateLiteral') {
				const u = urlText(n, mod);
				if (u && /graphql/i.test(u) && /^(https?:|\$\{|\/)/.test(u)) endpoints.add(u);
			}
		});
		const endpoint = endpoints.size === 1 ? [...endpoints][0]! : null;
		const gqlKind = shopify ? 'shopify-storefront' : 'graphql';
		const seenDocs = new Set<N>();
		const groqDocs: { node: N; text: string }[] = [];
		const pending: { call: N; fn: N | undefined }[] = [];
		walk(mod.program, (n, ancestors) => {
			if (n.type === 'TaggedTemplateExpression' || (n.type === 'CallExpression' && unwrap(n.arguments[0])?.type === 'TemplateLiteral')) {
				const tag = memberName(n.type === 'TaggedTemplateExpression' ? n.tag : n.callee)?.split('.').pop();
				if (tag && GQL_TAGS.test(tag)) {
					const text = queryText(n, mod) ?? '';
					seenDocs.add(n.type === 'TaggedTemplateExpression' ? n.quasi : unwrap(n.arguments[0])!);
					if (tag !== 'groq' && tag !== 'defineQuery' && GQL_SCHEMA.test(text)) return false;
					if (tag === 'groq' || tag === 'defineQuery' || !GQL_KEYWORD.test(text) && !/^\s*\{/.test(text)) groqDocs.push({ node: n, text });
					else addGraphql(file, mod.line(n.start), text, gqlKind, endpoint);
					return false;
				}
			}
			if ((n.type === 'TemplateLiteral' && !seenDocs.has(n)) || (n.type === 'Literal' && typeof n.value === 'string')) {
				const text = n.type === 'Literal' ? (n.value as string) : n.quasis.map((q: N) => q.value.cooked ?? q.value.raw).join(' ');
				if (GQL_KEYWORD.test(text) && /\{/.test(text)) addGraphql(file, mod.line(n.start), text, gqlKind, endpoint);
				return;
			}
			if (n.type === 'CallExpression') pending.push({ call: n, fn: enclosingFunction(ancestors) });
		});
		const groqUsed = new Set<N>();
		for (const { call, fn } of pending) {
			const name = memberName(call.callee);
			if (!name) continue;
			const root = name.split(/[.(]/)[0]!;
			const imported = mod.imports.get(root);
			const kind = await cms.ofName(mod, root, fn);
			const scope = fn ?? mod.program;
			if (kind) {
				if (/^(createClient|createStorefrontApiClient|createDirectus|createBuilderClient|storyblokInit|apiPlugin|defineLive|createImageUrlBuilder|imageUrlBuilder)$/.test(name.split('.').pop()!) || (imported && imported.imported === 'createClient')) continue;
				if (/\.(config|withConfig|withoutUnresolvableLinks|withAllLocales|withoutLinkResolution)$/.test(name)) continue;
				const args = call.arguments as N[];
				const queries: string[] = [];
				const fields: string[] = [];
				let line = mod.line(call.start);
				if (kind === 'sanity') {
					const q = await resolveQueryNode(ctx, mod, unwrap(args[0])?.type === 'ObjectExpression' ? property(args[0], 'query') : args[0]);
					if (q) {
						queries.push(normalise(q.text));
						fields.push(...groqFields(q.text));
						for (const d of groqDocs) if (normalise(d.text) === normalise(q.text)) groqUsed.add(d.node);
					}
				} else if (kind === 'shopify-storefront' || kind === 'hygraph' || kind === 'datocms') {
					const q = await resolveQueryNode(ctx, mod, unwrap(args[0])?.type === 'ObjectExpression' ? property(args[0], 'query') : args[0]);
					const doc = q && parseGraphql(q.text);
					if (q && doc) {
						queries.push(normalise(q.text));
						fields.push(...graphqlFields(doc));
					}
				} else {
					for (const a of args.slice(0, 2)) {
						const v = staticValue(a, mod);
						if (typeof v === 'string') queries.push(v);
						else if (known(v) && v && typeof v === 'object' && !Array.isArray(v)) {
							const o = v as Record<string, unknown>;
							for (const key of ['content_type', 'type', 'collection', 'path', 'slug', 'documentType', 'model']) if (typeof o[key] === 'string') queries.push(`${key}=${o[key]}`);
							const sel = o.select ?? o.fields ?? o._fields;
							if (typeof sel === 'string') fields.push(...sel.split(',').map((s) => s.trim().replace(/^fields\./, '')));
							else if (Array.isArray(sel)) fields.push(...sel.filter((s): s is string => typeof s === 'string').map((s) => s.replace(/^fields\./, '')));
						} else if (unwrap(a)?.type === 'ObjectExpression') {
							for (const key of ['content_type', 'type', 'collection']) {
								const s = str(property(a, key), mod);
								if (s) queries.push(`${key}=${s}`);
							}
						}
					}
				}
				const read = fieldsRead(scope, resultNames(scope, call));
				const prefix = kind === 'contentful' ? /(?:^|\.)fields\.(.+)$/ : kind === 'prismic' ? /(?:^|\.)data\.(.+)$/ : kind === 'storyblok' ? /(?:^|\.)content\.(.+)$/ : undefined;
				fields.push(...(prefix ? read.flatMap((f) => prefix.exec(f)?.[1] ?? []) : read));
				if (kind === 'contentful') walk(scope, (n) => {
					const m = n.type === 'MemberExpression' ? /\.fields\.(\w+)$/.exec(memberName(n) ?? '') : undefined;
					if (m) fields.push(m[1]!);
				});
				line = mod.line(call.start);
				out.clients.push({ kind, file, line, ...(queries.length ? { queries } : {}), ...(fields.length ? { fields: [...new Set(fields)].sort() } : {}) });
				continue;
			}
			const viaClient = /\.(get|request)$/.test(name) || name === root ? await isHttpClient(ctx, mod, root) : false;
			if (!/^(fetch|window\.fetch|globalThis\.fetch|\$fetch|useFetch|useLazyFetch|ofetch|apiFetch)$/.test(name) && !viaClient) continue;
			const args = call.arguments as N[];
			const opts = unwrap(args[1]);
			const method = str(property(opts, 'method'), mod)?.toUpperCase();
			const body = property(opts, 'body');
			const bodyQuery = body && unwrap(body)?.type === 'CallExpression' && memberName(unwrap(body)!.callee) === 'JSON.stringify' ? property(unwrap(body)!.arguments[0], 'query') : undefined;
			const url = name === 'apiFetch' ? str(property(args[0], 'path'), mod)?.replace(/^/, '/wp-json') : urlText(unwrap(args[0])?.type === 'ObjectExpression' ? property(args[0], 'url') : args[0], mod, fn);
			if (!url) continue;
			if (bodyQuery) {
				const q = await resolveQueryNode(ctx, mod, bodyQuery);
				if (q && addGraphql(file, mod.line(call.start), q.text, /myshopify|storefront/i.test(url) || shopify ? 'shopify-storefront' : 'graphql', url)) continue;
			}
			if (method && method !== 'GET') continue;
			if (/graphql/i.test(url)) continue;
			const read = fieldsRead(fn ?? mod.program, resultNames(fn ?? mod.program, call));
			const site = { file, line: mod.line(call.start) };
			const wrapper = wrapperOf(mod, fn, url);
			if (wrapper) wrappers.push({ ...wrapper, mod, url, read, site, kind: name === 'apiFetch' ? 'wordpress-rest' : undefined });
			else out.clients.push(restClient(url, site, read, name === 'apiFetch' ? 'wordpress-rest' : undefined));
		}
		for (const d of groqDocs) {
			if (groqUsed.has(d.node)) continue;
			out.clients.push({ kind: 'sanity', file, line: mod.line(d.node.start), queries: [normalise(d.text)], fields: groqFields(d.text) });
		}
	}
	const shared = new Map<string, SelectionSetNode>();
	for (const doc of parsed.values()) for (const d of doc.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION && !shared.has(d.name.value)) shared.set(d.name.value, d.selectionSet);
	for (const [client, doc] of parsed) if (client.fields?.some((f) => f.includes('...'))) client.fields = graphqlFields(doc, shared);
	out.clients.push(...(await expandWrappers(ctx, wrappers)));
	return out;
}

interface Wrapper {
	mod: Module;
	fn: N;
	name: string;
	params: { placeholder: string; index: number; key?: string }[];
	url: string;
	read: string[];
	site: { file: string; line: number };
	kind?: string;
}

function restClient(url: string, site: { file: string; line: number }, read: string[], kind?: string, via?: { file: string; line: number }): Client {
	const fields = read.length ? read : urlFields(url);
	const base = baseOf(url);
	const path = url.replace(/^https?:\/\/[^/]+|^\$\{[^}]+\}/, '') || '/';
	return { kind: kind ?? restKind(url), file: site.file, line: site.line, queries: [path], ...(fields.length ? { fields: [...new Set(fields)].sort() } : {}), ...(base ? { base } : {}), ...(via ? { via } : {}) };
}

/** When a fetch URL is built from a parameter of a named top-level function, the function is a wrapper and its callers say the URL. */
function wrapperOf(mod: Module, fn: N | undefined, url: string): Omit<Wrapper, 'mod' | 'url' | 'read' | 'site' | 'kind'> | undefined {
	if (!fn) return undefined;
	let top: { name: string; fn: N } | undefined;
	for (const [name, node] of mod.bindings) {
		const f = functionOf(node, mod);
		if (f && f.start <= fn.start && fn.end <= f.end) top = { name, fn: f };
	}
	if (!top) return undefined;
	const params: Wrapper['params'] = [];
	(top.fn.params as N[]).forEach((p, index) => {
		const id = p.type === 'AssignmentPattern' ? p.left : p;
		if (id.type === 'Identifier') params.push({ placeholder: id.name, index });
		else if (id.type === 'ObjectPattern') for (const prop of id.properties as N[]) if (prop.type === 'Property' && prop.value.type === 'Identifier') params.push({ placeholder: prop.value.name, index, key: keyName(prop.key) });
	});
	const used = params.filter((p) => url.includes(`\${${p.placeholder}}`) || new RegExp(`:${p.placeholder}(?![\\w])`).test(url));
	return used.length ? { fn: top.fn, name: top.name, params: used } : undefined;
}

async function expandWrappers(ctx: Context, wrappers: Wrapper[]): Promise<Client[]> {
	if (!wrappers.length) return [];
	const out: Client[] = [];
	const expanded = new Set<Wrapper>();
	const target = async (mod: Module, name: string): Promise<Wrapper | undefined> => {
		const local = functionOf(mod.bindings.get(name), mod);
		if (local) return wrappers.find((w) => w.fn === local);
		const imported = mod.imports.get(name);
		const file = imported && resolveImport(ctx.project, mod.file, imported.source);
		const other = file ? await ctx.module(file) : undefined;
		const fn = other ? functionOf(other.exports.get(imported!.imported), other) : undefined;
		return fn ? wrappers.find((w) => w.fn === fn) : undefined;
	};
	const substitute = (w: Wrapper, value: (p: Wrapper['params'][number]) => string | undefined) => {
		let url = w.url;
		for (const p of w.params) {
			const v = value(p);
			if (v === undefined) continue;
			url = url.split(`\${${p.placeholder}}`).join(v).replace(new RegExp(`:${p.placeholder}(?![\\w])`, 'g'), v);
		}
		return url;
	};
	for (const file of ctx.project.files) {
		if (!isScript(file) || isTestFile(file)) continue;
		const mod = await ctx.module(file);
		if (!mod || !wrappers.some((w) => mod.text.includes(w.name))) continue;
		const sites: { node: N; scope: N | undefined; name: string }[] = [];
		walk(mod.program, (n, ancestors) => {
			if (n.type === 'CallExpression' && n.callee.type === 'Identifier') sites.push({ node: n, scope: enclosingFunction(ancestors), name: n.callee.name });
			if (n.type === 'JSXOpeningElement' && n.name.type === 'JSXIdentifier') sites.push({ node: n, scope: enclosingFunction(ancestors), name: n.name.name });
		});
		for (const site of sites) {
			const w = await target(mod, site.name);
			if (!w || site.scope === w.fn) continue;
			const value = (p: Wrapper['params'][number]) => {
				if (site.node.type === 'JSXOpeningElement') {
					const attr = (site.node.attributes as N[]).find((a) => a.type === 'JSXAttribute' && a.name.name === p.key);
					const v = attr?.value;
					return v ? (v.type === 'JSXExpressionContainer' ? urlText(v.expression, mod, site.scope) : str(v, mod)) : undefined;
				}
				const arg = site.node.arguments[p.index];
				return p.key ? urlText(property(arg, p.key), mod, site.scope) : urlText(arg, mod, site.scope);
			};
			const url = substitute(w, value);
			const read = site.node.type === 'CallExpression' && site.scope ? fieldsRead(site.scope, resultNames(site.scope, site.node)) : [];
			out.push(restClient(url, { file, line: mod.line(site.node.start) }, [...new Set([...w.read, ...read])].sort(), w.kind, w.site));
			expanded.add(w);
		}
	}
	for (const w of wrappers) if (!expanded.has(w)) out.push(restClient(w.url, w.site, w.read, w.kind));
	return out;
}
