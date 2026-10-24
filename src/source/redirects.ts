import type { Context } from './context.ts';
import { str, walk, type N } from './js.ts';
import type { Redirect } from './types.ts';

const lineOf = (text: string, index: number) => text.slice(0, Math.max(0, index)).split('\n').length;

function fromJson(file: string, text: string, list: unknown): Redirect[] {
	const out: Redirect[] = [];
	const add = (from: unknown, to: unknown) => {
		if (typeof from !== 'string' || typeof to !== 'string' || !from.startsWith('/')) return;
		out.push({ from, to, file, line: lineOf(text, text.indexOf(JSON.stringify(from))) });
	};
	if (Array.isArray(list)) for (const r of list as Record<string, unknown>[]) add(r.source ?? r.from, r.destination ?? r.to);
	else if (list && typeof list === 'object') for (const [from, to] of Object.entries(list)) add(from, to);
	return out;
}

/** Redirects an app declares in config: Next.js `redirects()`, `vercel.json`, `serve.json`, and `_redirects` (Netlify, Cloudflare Pages). */
export async function scanRedirects(ctx: Context): Promise<Redirect[]> {
	const out: Redirect[] = [];
	for (const file of ['next.config.ts', 'next.config.js', 'next.config.mjs']) {
		if (!ctx.project.has(file)) continue;
		const mod = await ctx.module(file);
		if (!mod) continue;
		walk(mod.program, (n: N, ancestors: readonly N[]) => {
			if (n.type !== 'ObjectExpression') return;
			const prop = (key: string) => n.properties.find((p: N) => p.type === 'Property' && (p.key?.name ?? p.key?.value) === key)?.value;
			const value = (key: string) => str(prop(key), mod);
			const [from, to] = [value('source'), value('destination')];
			if (!from?.startsWith('/') || !to) return;
			// Next.js reads them from the config's redirects() and rewrites() methods.
			const owner = [...ancestors].reverse().find((a) => (a.type === 'Property' || a.type === 'MethodDefinition') && /^(redirects|rewrites)$/.test(a.key?.name ?? ''));
			const kind = owner?.key?.name === 'rewrites' ? 'rewrite' : owner?.key?.name === 'redirects' ? 'redirect' : undefined;
			const permanent = prop('permanent');
			out.push({ from, to, file, line: mod.line(n.start), ...(kind ? { kind } : {}), ...(permanent?.type === 'Literal' && typeof permanent.value === 'boolean' ? { permanent: permanent.value } : {}) });
		});
	}
	for (const file of ['vercel.json', 'serve.json', 'public/serve.json']) {
		if (!ctx.project.has(file)) continue;
		const text = (await ctx.project.read(file)) ?? '';
		try {
			out.push(...fromJson(file, text, (JSON.parse(text) as { redirects?: unknown }).redirects));
		} catch {
			ctx.limits.push(`${file}: not valid JSON, its redirects were not read`);
		}
	}
	for (const file of ['_redirects', 'public/_redirects', 'static/_redirects']) {
		if (!ctx.project.has(file)) continue;
		const text = (await ctx.project.read(file)) ?? '';
		text.split('\n').forEach((line, i) => {
			const [from, to] = line.replace(/#.*/, '').trim().split(/\s+/);
			if (from?.startsWith('/') && to) out.push({ from, to, file, line: i + 1 });
		});
	}
	return out;
}
