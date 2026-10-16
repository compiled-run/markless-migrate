import { posix } from 'node:path';
import type { Context } from '../context.ts';
import { isDynamic, joinPath } from '../pattern.ts';
import { descendants, lineOf, named, parseTree, stringValue, type TsNode } from '../trees.ts';
import type { AuthGuard, SourceRoute, Write } from '../types.ts';
import { djangoRegex } from './django.ts';

export interface WordPressFound {
	routes: SourceRoute[];
	writes: Write[];
	guards: AuthGuard[];
}

/** Template hierarchy file to the URL it usually serves, assuming `/%postname%/` permalinks. */
export function templatePath(name: string, has: (template: string) => boolean): string | undefined {
	if (name === 'front-page') return '/';
	if (name === 'home') return has('front-page') ? undefined : '/';
	if (name === 'index') return has('front-page') || has('home') ? undefined : '/';
	if (name === 'single' || name === 'singular') return '/:slug/';
	if (name === 'page') return '/:page/';
	if (name === 'archive') return '/:archive/';
	if (name === 'category') return '/category/:category/';
	if (name === 'tag') return '/tag/:tag/';
	if (name === 'author') return '/author/:author/';
	if (name === 'date') return '/:year/:month?/';
	let m = /^single-([\w-]+)$/.exec(name);
	if (m) return `/${m[1]}/:slug/`;
	m = /^archive-([\w-]+)$/.exec(name);
	if (m) return `/${m[1]}/`;
	m = /^page-([a-z][\w-]*)$/.exec(name);
	if (m) return `/${m[1]}/`;
	m = /^category-([a-z][\w-]*)$/.exec(name);
	if (m) return `/category/${m[1]}/`;
	m = /^tag-([a-z][\w-]*)$/.exec(name);
	if (m) return `/tag/${m[1]}/`;
	m = /^taxonomy-([\w-]+?)(?:-([\w-]+))?$/.exec(name);
	if (m) return m[2] ? `/${m[1]}/${m[2]}/` : `/${m[1]}/:term/`;
	return undefined;
}

function options(array: TsNode | undefined): Map<string, TsNode> {
	const out = new Map<string, TsNode>();
	if (array?.type !== 'array_creation_expression') return out;
	for (const el of named(array)) {
		const parts = named(el);
		if (parts.length === 2) {
			const key = stringValue(parts[0]);
			if (key !== undefined) out.set(key, parts[1]!);
		}
	}
	return out;
}

const callArgs = (call: TsNode) => named(call.childForFieldName('arguments')).map((a) => named(a).at(-1) ?? a);

export async function wordpressRoutes(ctx: Context): Promise<WordPressFound> {
	const found: WordPressFound = { routes: [], writes: [], guards: [] };
	const themes = new Set<string>();
	for (const f of ctx.project.files) {
		if (posix.basename(f) === 'style.css' && /Theme Name:/i.test(await ctx.project.read(f))) themes.add(posix.dirname(f));
	}
	for (const theme of themes) {
		const prefix = theme === '.' ? '' : `${theme}/`;
		const templates = ctx.project.files.filter((f) => f.startsWith(prefix) && (/^[\w-]+\.php$/.test(f.slice(prefix.length)) || /^templates\/[\w-]+\.html$/.test(f.slice(prefix.length))));
		const names = new Set(templates.map((f) => posix.basename(f).replace(/\.\w+$/, '')));
		for (const file of templates) {
			const path = templatePath(posix.basename(file).replace(/\.\w+$/, ''), (t) => names.has(t));
			if (!path) continue;
			found.routes.push({ path, file, line: 1, dynamic: isDynamic(path), kind: 'page' });
			if (!file.endsWith('.php')) continue;
			const root = await parseTree('php', await ctx.project.read(file));
			const calls = [...descendants(root, 'function_call_expression')];
			const fn = (c: TsNode) => c.childForFieldName('function')?.text;
			const gate = calls.find((c) => fn(c) === 'auth_redirect') ?? (calls.some((c) => fn(c) === 'is_user_logged_in') && calls.some((c) => /^wp_(safe_)?redirect$/.test(fn(c) ?? '')) ? calls.find((c) => fn(c) === 'is_user_logged_in') : undefined);
			if (gate) {
				const can = calls.find((c) => fn(c) === 'current_user_can');
				found.guards.push({ role: can ? (stringValue(callArgs(can)[0]) ?? null) : null, file, line: lineOf(gate), routes: [path], how: fn(gate)!, redirectTo: '/wp-login.php' });
			}
		}
	}
	for (const file of ctx.project.files.filter((f) => f.endsWith('.php') && !/^(wp-admin|wp-includes)\//.test(f))) {
		const text = await ctx.project.read(file);
		if (!/register_post_type|add_rewrite_rule|register_rest_route|register_taxonomy/.test(text)) continue;
		const root = await parseTree('php', text);
		for (const call of descendants(root, 'function_call_expression')) {
			const name = call.childForFieldName('function')?.text;
			const args = callArgs(call);
			const line = lineOf(call);
			if (name === 'register_post_type' || name === 'register_taxonomy') {
				const type = stringValue(args[0]);
				const opts = options(name === 'register_post_type' ? args[1] : args[2]);
				if (!type || opts.get('public')?.text === 'false') continue;
				const slug = stringValue(options(opts.get('rewrite')).get('slug')) ?? type;
				if (name === 'register_taxonomy') {
					found.routes.push({ path: `/${slug}/:term/`, file, line, dynamic: true, kind: 'page' });
					continue;
				}
				found.routes.push({ path: `/${slug}/:slug/`, file, line, dynamic: true, kind: 'page' });
				const archive = opts.get('has_archive');
				if (archive && archive.text !== 'false') found.routes.push({ path: `/${stringValue(archive) ?? slug}/`, file, line, dynamic: false, kind: 'page' });
			} else if (name === 'add_rewrite_rule') {
				const regex = stringValue(args[0]);
				if (regex) {
					const path = djangoRegex(regex.replace(/\/\?\$?$/, '/$'));
					found.routes.push({ path, file, line, dynamic: isDynamic(path), kind: 'page' });
				}
			} else if (name === 'register_rest_route') {
				const ns = stringValue(args[0]);
				const route = stringValue(args[1]);
				if (!ns || route === undefined) continue;
				const path = joinPath('wp-json', ns, route.replace(/\(\?P<(\w+)>[^)]*\)/g, ':$1'));
				const methods = (stringValue(options(args[2]).get('methods')) ?? options(args[2]).get('methods')?.text ?? 'GET').split(/[,\s|]+/).map((m) => m.replace(/^WP_REST_Server::/, '')).map((m) => ({ READABLE: 'GET', CREATABLE: 'POST', EDITABLE: 'PATCH', DELETABLE: 'DELETE', ALLMETHODS: '*' })[m] ?? m.toUpperCase());
				found.routes.push({ path, file, line, dynamic: isDynamic(path), kind: 'endpoint', methods });
				for (const m of methods) if (m !== 'GET') found.writes.push({ method: m, path, handler: { file, line }, via: 'route' });
			}
		}
	}
	if (themes.size) ctx.limits.push('WordPress: routes come from the theme template hierarchy and assume /%postname%/ permalinks; the real permalink structure, pages and posts live in the database, so sample URLs come from the crawl.');
	return found;
}
