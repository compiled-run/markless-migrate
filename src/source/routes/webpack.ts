import { posix } from 'node:path';
import type { Context } from '../context.ts';
import { keyName, memberName, property, staticValue, str, unwrap, walk, type Module, type N } from '../js.ts';
import type { SourceRoute } from '../types.ts';

const CONFIG = /^(?:[^/]+\/)?webpack(?:\.[\w-]+)*\.config\.[cm]?[jt]s$/;

/** A path expression as a project-relative path: literals, `path.resolve(__dirname, 'x')` and `path.join(...)`. */
function pathOf(node: N | undefined, mod: Module, dir: string): string | undefined {
	const n = unwrap(node);
	if (!n) return undefined;
	const s = str(n, mod);
	if (s !== undefined) return posix.normalize(s.startsWith('/') ? s.slice(1) : posix.join(dir, s));
	if (n.type === 'Identifier' && n.name === '__dirname') return dir;
	if (n.type === 'CallExpression' && /(^|\.)(resolve|join)$/.test(memberName(n.callee) ?? '')) {
		let out = '';
		for (const arg of n.arguments as N[]) {
			const a = unwrap(arg);
			if (a?.type === 'Identifier' && a.name === '__dirname') out = dir;
			else if (a?.type === 'CallExpression' && memberName(a.callee) === 'process.cwd') out = '';
			else {
				const part = str(a, mod);
				if (part === undefined) return undefined;
				out = part.startsWith('/') ? part.slice(1) : posix.join(out, part);
			}
		}
		return posix.normalize(out || '.');
	}
	return undefined;
}

const clean = (p: string) => p.replace(/^\.\//, '').replace(/^\.$/, '');

function entryFiles(node: N | undefined, mod: Module, dir: string): Map<string, string[]> {
	const out = new Map<string, string[]>();
	const value = unwrap(node);
	const list = (v: N | undefined): string[] => {
		const u = unwrap(v);
		if (u?.type === 'ArrayExpression') return (u.elements as N[]).flatMap((e) => list(e));
		if (u?.type === 'ObjectExpression') return list(property(u, 'import'));
		const p = pathOf(u, mod, dir);
		return p ? [clean(p)] : [];
	};
	if (value?.type === 'ObjectExpression') {
		for (const p of value.properties as N[]) {
			const name = p.type === 'Property' ? keyName(p.key) : undefined;
			if (name) out.set(name, list(p.value));
		}
	} else if (value) out.set('main', list(value));
	return out;
}

/** The constructor a plugin import names, by the package it comes from or its usual local name. */
function pluginOf(n: N, mod: Module): 'html' | 'copy' | undefined {
	const name = memberName(n.callee);
	if (!name) return undefined;
	const source = mod.imports.get(name.split('.')[0]!)?.source ?? '';
	if (source === 'html-webpack-plugin' || /^Html(Webpack)?Plugin$/.test(name)) return 'html';
	if (source === 'copy-webpack-plugin' || /^Copy(Webpack)?Plugin$/.test(name)) return 'copy';
	return undefined;
}

const pagePath = (file: string) => `/${file}`.replace(/(^|\/)index\.html$/, '$1') || '/';

/**
 * Pages a webpack build emits: one per HtmlWebpackPlugin (at its `filename`, loading the entry
 * chunks it injects) and per HTML file CopyPlugin copies to the output (loading the entries its
 * scripts name). Each route's file is the HTML template; `entries` are the modules it runs.
 */
export async function webpackRoutes(ctx: Context): Promise<SourceRoute[]> {
	const routes: SourceRoute[] = [];
	for (const file of ctx.project.files.filter((f) => CONFIG.test(f))) {
		const mod = await ctx.module(file);
		if (!mod) continue;
		const dir = posix.dirname(file) === '.' ? '' : posix.dirname(file);
		let config: N | undefined;
		walk(mod.program, (n) => {
			if (!config && n.type === 'ObjectExpression' && property(n, 'entry')) config = n;
		});
		const entries = entryFiles(property(config, 'entry'), mod, dir);
		const output = property(config, 'output');
		const outDir = pathOf(property(output, 'path'), mod, dir);
		const filename = str(property(output, 'filename'), mod) ?? '[name].js';
		const add = (template: string | undefined, served: string, chunks: readonly string[]) => {
			const files = [...new Set(chunks.flatMap((c) => entries.get(c) ?? []))].filter((f) => ctx.project.has(f));
			routes.push({ path: pagePath(served), file: template && ctx.project.has(template) ? template : file, line: 1, dynamic: false, kind: 'page', ...(files.length ? { entries: files } : {}) });
		};
		const plugins: N[] = [];
		walk(mod.program, (n) => {
			if (n.type === 'NewExpression' && pluginOf(n, mod)) plugins.push(n);
		});
		for (const plugin of plugins) {
			const options = unwrap(plugin.arguments[0]);
			if (pluginOf(plugin, mod) === 'html') {
				const template = pathOf(property(options, 'template'), mod, dir);
				const served = str(property(options, 'filename'), mod) ?? 'index.html';
				const only = staticValue(property(options, 'chunks'));
				const except = staticValue(property(options, 'excludeChunks'));
				const chunks = [...entries.keys()].filter((c) => (!Array.isArray(only) || only.includes(c)) && !(Array.isArray(except) && except.includes(c)));
				add(template && clean(template), served.replace(/^\//, ''), chunks);
				continue;
			}
			const patterns = unwrap(property(options, 'patterns'));
			for (const p of patterns?.type === 'ArrayExpression' ? (patterns.elements as N[]) : []) {
				const from = pathOf(unwrap(p)?.type === 'ObjectExpression' ? property(p, 'from') : p, mod, dir);
				if (!from || !/\.html?$/.test(from) || !ctx.project.has(clean(from))) continue;
				const toNode = unwrap(p)?.type === 'ObjectExpression' ? property(p, 'to') : undefined;
				const to = toNode ? pathOf(toNode, mod, dir) : undefined;
				const literal = toNode ? str(toNode, mod) : undefined;
				// `to` is relative to the output folder when written as a plain string, absolute when built from __dirname.
				const target = to === undefined || to === outDir ? '' : literal !== undefined && !literal.startsWith('/') ? literal : outDir && to.startsWith(`${outDir}/`) ? to.slice(outDir.length + 1) : '';
				const served = /\.html?$/.test(target) ? target : posix.join(target, posix.basename(from));
				const html = await ctx.project.read(clean(from));
				const named = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)].map((m) => posix.basename(m[1]!));
				const chunks = [...entries.keys()].filter((c) => named.includes(filename.replace('[name]', c).split('/').pop()!));
				add(clean(from), served.replace(/^\.?\//, ''), chunks);
			}
		}
	}
	const byPath = new Map<string, SourceRoute>();
	for (const r of routes) {
		const prior = byPath.get(r.path);
		if (!prior) byPath.set(r.path, r);
		else if (r.entries) prior.entries = [...new Set([...(prior.entries ?? []), ...r.entries])];
	}
	return [...byPath.values()];
}
