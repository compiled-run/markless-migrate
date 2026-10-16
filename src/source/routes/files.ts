import { posix } from 'node:path';
import { HTTP_METHODS, type Context } from '../context.ts';
import { str, walk, type Module, type N } from '../js.ts';
import { isDynamic, joinPath } from '../pattern.ts';
import type { SourceRoute } from '../types.ts';

const SCRIPT = /\.(tsx?|jsx?|mjs|mts)$/;

/** Exported HTTP method handlers of an endpoint module (`ALL` included), with the line of each. */
export function methodExports(mod: Module | undefined): { method: string; line: number }[] {
	if (!mod) return [];
	const out: { method: string; line: number }[] = [];
	for (const [name, node] of mod.exports) if ((HTTP_METHODS as readonly string[]).includes(name) || name === 'ALL' || name === 'DEL') out.push({ method: name === 'DEL' ? 'DELETE' : name, line: mod.line(node.start) });
	return out;
}

export const defaultLine = (mod: Module | undefined) => {
	const node = mod?.exports.get('default');
	return node ? mod!.line(node.start) : 1;
};

async function route(ctx: Context, path: string, file: string, kind: 'page' | 'endpoint'): Promise<SourceRoute> {
	const mod = SCRIPT.test(file) || /\.(vue|svelte|astro)$/.test(file) ? await ctx.module(file) : undefined;
	const methods = kind === 'endpoint' ? methodExports(mod) : [];
	const line = methods.length ? Math.min(...methods.map((m) => m.line)) : defaultLine(mod);
	return { path, file, line, dynamic: isDynamic(path), kind, ...(methods.length ? { methods: methods.map((m) => m.method) } : {}) };
}

/** Bracket segments shared by Next, SvelteKit, Nuxt, Astro and SolidStart; undefined drops the whole file. */
function bracketSegment(seg: string, restOptional: boolean): string | undefined {
	if (/^\(.*\)$/.test(seg) || seg.startsWith('@')) return '';
	let m = /^\[\[\.\.\.(\w+)\]\]$/.exec(seg);
	if (m) return `*${m[1]}?`;
	m = /^\[\.\.\.(\w+)\]$/.exec(seg);
	if (m) return `*${m[1]}${restOptional ? '?' : ''}`;
	m = /^\[\[(\w+)(?:=\w+)?\]\]$/.exec(seg);
	if (m) return `:${m[1]}?`;
	m = /^\[(\w+)(?:=\w+)?\]$/.exec(seg);
	if (m) return `:${m[1]}`;
	if (seg.includes('[')) return `:${[...seg.matchAll(/\[(?:\.\.\.)?(\w+)/g)].map((x) => x[1]).join('_')}`;
	return seg;
}

const segmentsOf = (dir: string) => (dir === '.' || dir === '' ? [] : dir.split('/'));

export async function nextRoutes(ctx: Context): Promise<SourceRoute[]> {
	const out: SourceRoute[] = [];
	for (const base of ['app', 'src/app']) {
		for (const file of ctx.project.files) {
			if (!file.startsWith(`${base}/`)) continue;
			const name = posix.basename(file);
			const kind = /^page\.(tsx?|jsx?|mdx?)$/.test(name) ? 'page' : /^route\.(tsx?|jsx?)$/.test(name) ? 'endpoint' : undefined;
			if (!kind) continue;
			const segs = segmentsOf(posix.dirname(file.slice(base.length + 1)));
			if (segs.some((s) => s.startsWith('_') || /^\(\.+\)/.test(s))) continue;
			out.push(await route(ctx, joinPath(...segs.map((s) => bracketSegment(s, false))), file, kind));
		}
	}
	for (const base of ['pages', 'src/pages']) {
		for (const file of ctx.project.files) {
			if (!file.startsWith(`${base}/`) || !/\.(tsx?|jsx?|mdx)$/.test(file)) continue;
			const rel = file.slice(base.length + 1).replace(/\.[^.]+$/, '');
			if (/^(_app|_document|_error|404|500)$/.test(rel) || rel.split('/').some((s) => s.startsWith('_'))) continue;
			const segs = rel.split('/');
			if (segs.at(-1) === 'index') segs.pop();
			out.push(await route(ctx, joinPath(...segs.map((s) => bracketSegment(s, false))), file, segs[0] === 'api' ? 'endpoint' : 'page'));
		}
	}
	return out;
}

export async function svelteKitRoutes(ctx: Context): Promise<SourceRoute[]> {
	const byDir = new Map<string, { page?: string; server?: string }>();
	for (const file of ctx.project.files) {
		if (!file.startsWith('src/routes/')) continue;
		const name = posix.basename(file);
		const dir = posix.dirname(file);
		const entry = byDir.get(dir) ?? {};
		if (/^\+page(\.server)?\.(svelte|ts|js)$/.test(name)) entry.page = entry.page?.endsWith('.svelte') ? entry.page : name.endsWith('.svelte') ? file : (entry.page ?? file);
		else if (/^\+server\.(ts|js)$/.test(name)) entry.server = file;
		else continue;
		byDir.set(dir, entry);
	}
	const out: SourceRoute[] = [];
	for (const [dir, entry] of byDir) {
		const path = joinPath(...segmentsOf(dir.slice('src/routes'.length + 1)).map((s) => bracketSegment(s, true)));
		if (entry.page) out.push(await route(ctx, path, entry.page, 'page'));
		if (entry.server) out.push(await route(ctx, path, entry.server, 'endpoint'));
	}
	return out;
}

export async function nuxtRoutes(ctx: Context): Promise<SourceRoute[]> {
	const out: SourceRoute[] = [];
	for (const base of ['pages', 'app/pages', 'src/pages']) {
		for (const file of ctx.project.files) {
			if (!file.startsWith(`${base}/`) || !/\.(vue|tsx|jsx)$/.test(file)) continue;
			const segs = file.slice(base.length + 1).replace(/\.[^.]+$/, '').split('/');
			if (segs.at(-1) === 'index') segs.pop();
			out.push(await route(ctx, joinPath(...segs.map((s) => bracketSegment(s, true))), file, 'page'));
		}
	}
	for (const [base, prefix] of [['server/api', 'api'], ['server/routes', '']] as const) {
		for (const file of ctx.project.files) {
			if (!file.startsWith(`${base}/`) || !SCRIPT.test(file)) continue;
			const segs = file.slice(base.length + 1).replace(/\.[^.]+$/, '').split('/');
			let last = segs.pop()!;
			const method = /\.(get|post|put|patch|delete|head|options)$/.exec(last)?.[1]?.toUpperCase();
			if (method) last = last.slice(0, -(method.length + 1));
			if (last !== 'index') segs.push(last);
			const r = await route(ctx, joinPath(prefix, ...segs.map((s) => bracketSegment(s, false))), file, 'endpoint');
			out.push({ ...r, line: defaultLine(await ctx.module(file)), methods: [method ?? 'ALL'] });
		}
	}
	return out;
}

export async function astroRoutes(ctx: Context): Promise<SourceRoute[]> {
	const out: SourceRoute[] = [];
	for (const file of ctx.project.files) {
		if (!file.startsWith('src/pages/')) continue;
		const segs = file.slice('src/pages/'.length).replace(/\.[^.]+$/, '').split('/');
		if (segs.some((s) => s.startsWith('_'))) continue;
		const kind = /\.(astro|mdx?|html)$/.test(file) ? 'page' : SCRIPT.test(file) ? 'endpoint' : undefined;
		if (!kind) continue;
		if (segs.at(-1) === 'index') segs.pop();
		const last = segs.at(-1);
		if (kind === 'endpoint' && last && /\.\w+$/.test(last)) segs[segs.length - 1] = last;
		out.push(await route(ctx, joinPath(...segs.map((s) => bracketSegment(s, true))), file, kind));
	}
	return out;
}

export async function solidStartRoutes(ctx: Context): Promise<SourceRoute[]> {
	const out: SourceRoute[] = [];
	const base = 'src/routes/';
	for (const file of ctx.project.files) {
		if (!file.startsWith(base) || !/\.(tsx?|jsx?|mdx)$/.test(file)) continue;
		const rel = file.slice(base.length).replace(/\.[^.]+$/, '');
		if (ctx.project.files.some((f) => f.startsWith(`${base}${rel}/`))) continue;
		const segs = rel.split('/');
		if (segs.at(-1) === 'index') segs.pop();
		const mod = await ctx.module(file);
		const kind = mod && !mod.exports.has('default') && methodExports(mod).length ? 'endpoint' : 'page';
		out.push(await route(ctx, joinPath(...segs.map((s) => bracketSegment(s, false))), file, kind));
	}
	return out;
}

const tanstackSegment = (seg: string): string => {
	if (seg === '$') return '*splat';
	let m = /^\{-\$(\w+)\}$/.exec(seg);
	if (m) return `:${m[1]}?`;
	m = /^\$(\w+)$/.exec(seg);
	if (m) return `:${m[1]}`;
	if (/^\(.*\)$/.test(seg) || seg.startsWith('_') || seg === 'index' || seg === 'route') return '';
	return seg.replace(/_$/, '').replace(/\[(.)\]/g, '$1');
};

export const tanstackPath = (path: string) => joinPath(...path.split('/').map(tanstackSegment));

export async function tanstackRoutes(ctx: Context): Promise<SourceRoute[]> {
	const out: SourceRoute[] = [];
	for (const base of ['src/routes/', 'app/routes/', 'routes/']) {
		for (const file of ctx.project.files) {
			if (!file.startsWith(base) || !/\.(tsx?|jsx?)$/.test(file) || /\.lazy\.[jt]sx?$/.test(file)) continue;
			const rel = file.slice(base.length).replace(/\.[^.]+$/, '');
			if (rel.split('/').some((s) => s.startsWith('-')) || /(^|\/)__root$/.test(rel)) continue;
			const mod = await ctx.module(file);
			let declared: { path: string; line: number; kind: 'page' | 'endpoint' } | undefined;
			if (mod) {
				walk(mod.program, (n) => {
					if (declared || n.type !== 'CallExpression') return;
					const callee = n.callee.type === 'CallExpression' ? n.callee.callee : n.callee;
					const name = callee.type === 'Identifier' ? callee.name : undefined;
					if (name === 'createFileRoute' || name === 'createAPIFileRoute' || name === 'createServerFileRoute') {
						const arg = (n.callee.type === 'CallExpression' ? n.callee.arguments[0] : n.arguments[0]) as N | undefined;
						const path = str(arg, mod);
						if (path !== undefined) declared = { path, line: mod.line(n.start), kind: name === 'createFileRoute' ? 'page' : 'endpoint' };
					}
				});
			}
			const raw = declared?.path ?? rel.split(/[/.]/).join('/');
			const last = raw.split('/').filter(Boolean).at(-1) ?? '';
			if (/^_/.test(last) && !/_$/.test(last) && !/^(index|route)$/.test(rel.split(/[/.]/).at(-1) ?? '')) continue;
			const path = tanstackPath(raw);
			const r = await route(ctx, path, file, declared?.kind ?? 'page');
			out.push({ ...r, line: declared?.line ?? r.line });
		}
		if (out.length) break;
	}
	return out;
}

const remixSegments = (name: string): string[] | undefined => {
	const parts: string[] = [];
	let current = '';
	let escaped = false;
	for (const ch of name) {
		if (ch === '[') escaped = true;
		else if (ch === ']') escaped = false;
		else if (ch === '.' && !escaped) {
			parts.push(current);
			current = '';
		} else current += ch;
	}
	parts.push(current);
	const last = parts.at(-1)!;
	if (last.startsWith('_') && last !== '_index') return undefined;
	return parts.map((p) => {
		if (p === '_index' || (p.startsWith('_') && !p.endsWith('_'))) return '';
		const s = p.replace(/_$/, '').replace(/^_/, '');
		if (s === '$') return '*splat';
		let m = /^\(\$(\w+)\)$/.exec(s);
		if (m) return `:${m[1]}?`;
		m = /^\$(\w+)$/.exec(s);
		if (m) return `:${m[1]}`;
		return s.replace(/^\((.*)\)$/, '$1');
	});
};

export async function remixFlatRoutes(ctx: Context, base = 'app/routes'): Promise<SourceRoute[]> {
	const out: SourceRoute[] = [];
	for (const file of ctx.project.files) {
		if (!file.startsWith(`${base}/`) || !/\.(tsx?|jsx?|mdx?)$/.test(file)) continue;
		const rel = file.slice(base.length + 1);
		const parts = rel.split('/');
		let name: string;
		if (parts.length === 1) name = parts[0]!.replace(/\.[^.]+$/, '');
		else if (parts.length === 2 && /^route\.[^.]+$/.test(parts[1]!)) name = parts[0]!;
		else continue;
		const segs = remixSegments(name);
		if (!segs) continue;
		const mod = await ctx.module(file);
		const kind = mod && !mod.exports.has('default') && (mod.exports.has('loader') || mod.exports.has('action')) ? 'endpoint' : 'page';
		out.push(await route(ctx, joinPath(...segs), file, kind));
	}
	return out;
}

export function htmlRoutes(ctx: Context): SourceRoute[] {
	return ctx.project.files
		.filter((f) => /\.html$/.test(f) && !/^(public|dist|static)\//.test(f) && !/(^|\/)(401|403|404|500)\.html$/.test(f) && !f.includes('/node_modules/'))
		.map((file) => {
			const path = `/${file}`.replace(/(^|\/)index\.html$/, '$1');
			return { path: path || '/', file, line: 1, dynamic: false, kind: 'page' as const };
		});
}

