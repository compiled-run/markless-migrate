import { posix } from 'node:path';
import type { Context } from '../context.ts';
import { joinPath } from '../pattern.ts';
import type { SourceRoute } from '../types.ts';

const MARKDOWN = /\.mdx?$/;

function frontMatter(text: string): Record<string, string> {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
	const out: Record<string, string> = {};
	for (const m of block.matchAll(/^(\w+):\s*(.*?)\s*$/gm)) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
	return out;
}

// The line a page's content starts on: after its front matter.
function bodyLine(text: string): number {
	const block = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)?.[0];
	return block ? block.split('\n').length : 1;
}

const page = (path: string, file: string, line: number): SourceRoute => ({ path, file, line, dynamic: false, kind: 'page' });

/** Docusaurus: docs/ under the docs route base (number prefixes dropped, index and README as the folder, `slug` and `id` front matter), src/pages/, and blog posts by date. */
export async function docusaurusRoutes(ctx: Context): Promise<SourceRoute[]> {
	const config = (await Promise.all(['docusaurus.config.js', 'docusaurus.config.ts', 'docusaurus.config.mjs'].map((f) => ctx.project.read(f)))).join('\n');
	const docsBase = /docs\s*:\s*\{[^}]*?routeBasePath\s*:\s*['"]([^'"]*)['"]/s.exec(config)?.[1] ?? 'docs';
	const blogBase = /blog\s*:\s*\{[^}]*?routeBasePath\s*:\s*['"]([^'"]*)['"]/s.exec(config)?.[1] ?? 'blog';
	const out: SourceRoute[] = [];
	for (const file of ctx.project.files) {
		const text = MARKDOWN.test(file) || /\.[jt]sx?$/.test(file) ? await ctx.project.read(file) : '';
		if (file.startsWith('docs/') && MARKDOWN.test(file)) {
			const segs = file.slice('docs/'.length).replace(MARKDOWN, '').split('/');
			if (segs.some((s) => s.startsWith('_'))) continue;
			const fm = frontMatter(text);
			const clean = segs.map((s) => s.replace(/^\d+[-_.]\s*/, ''));
			if (/^(index|readme)$/i.test(clean.at(-1)!) || (clean.length > 1 && clean.at(-1) === clean.at(-2))) clean.pop();
			else if (fm.id) clean[clean.length - 1] = fm.id;
			let path = joinPath(docsBase, ...clean);
			if (fm.slug) path = fm.slug.startsWith('/') ? joinPath(docsBase, fm.slug) : joinPath(docsBase, ...clean.slice(0, -1), fm.slug);
			out.push(page(path, file, bodyLine(text)));
		} else if (file.startsWith('src/pages/') && /\.(mdx?|[jt]sx?)$/.test(file) && !/\.test\.|__tests__/.test(file)) {
			const segs = file.slice('src/pages/'.length).replace(/\.\w+$/, '').split('/');
			if (segs.some((s) => s.startsWith('_'))) continue;
			if (segs.at(-1) === 'index') segs.pop();
			out.push(page(joinPath(...segs), file, MARKDOWN.test(file) ? bodyLine(text) : 1));
		} else if (file.startsWith('blog/') && MARKDOWN.test(file)) {
			const name = file.slice('blog/'.length).replace(/\/index\.mdx?$/, '').replace(MARKDOWN, '');
			const dated = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/.exec(posix.basename(name));
			if (!dated && name.includes('/')) continue;
			const fm = frontMatter(text);
			const path = fm.slug ? joinPath(blogBase, fm.slug) : dated ? joinPath(blogBase, dated[1], dated[2], dated[3], dated[4]) : joinPath(blogBase, name);
			out.push(page(path, file, bodyLine(text)));
		}
	}
	return out;
}

/** VitePress: every Markdown file under the source directory (index as the folder), with `.html` unless cleanUrls. */
export async function vitepressRoutes(ctx: Context): Promise<SourceRoute[]> {
	for (const root of ['', 'docs', 'website', 'site']) {
		const config = (await Promise.all(['config.ts', 'config.mts', 'config.js', 'config.mjs'].map((f) => ctx.project.read(posix.join(root, '.vitepress', f))))).filter(Boolean).join('\n');
		if (!config) continue;
		const srcDir = posix.normalize(posix.join(root, /srcDir\s*:\s*['"]([^'"]+)['"]/.exec(config)?.[1] ?? '.'));
		const prefix = srcDir === '.' ? '' : `${srcDir}/`;
		const clean = /cleanUrls\s*:\s*true/.test(config);
		const out: SourceRoute[] = [];
		for (const file of ctx.project.files) {
			if (!file.startsWith(prefix) || !file.endsWith('.md') || /(^|\/)(node_modules|public)\//.test(file.slice(prefix.length))) continue;
			const segs = file.slice(prefix.length).replace(/\.md$/, '').split('/');
			const text = await ctx.project.read(file);
			if (segs.at(-1) === 'index') {
				segs.pop();
				out.push(page(segs.length ? `${joinPath(...segs)}/` : '/', file, bodyLine(text)));
			} else out.push(page(`${joinPath(...segs)}${clean ? '' : '.html'}`, file, bodyLine(text)));
		}
		return out;
	}
	return [];
}
