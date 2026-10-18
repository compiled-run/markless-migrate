// Writes the docs' Markdown copies and llms.txt files into public/ from the docs source: node scripts/llms.mjs <vite-docs-dir>
// The old site's own vitepress-plugin-llms, with the settings in the docs' VitePress config, does the converting.
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const docs = process.argv[2] && resolve(process.argv[2]);
if (!docs) throw new Error('usage: node scripts/llms.mjs <vite-docs-dir>');
const fromDocs = createRequire(join(docs, 'package.json'));
const { resolveConfig } = await import(pathToFileURL(fromDocs.resolve('vitepress')).href);
const site = await resolveConfig(docs, 'build', 'production');
const plugins = site.userConfig.vite.plugins.flat(Infinity).filter((p) => p?.name?.startsWith('vitepress-plugin-llms'));
const tags = plugins.find((p) => p.name.endsWith(':llm-tags'));
const build = plugins.find((p) => p.name === 'vitepress-plugin-llms');
if (!tags || !build) throw new Error('vitepress-plugin-llms is not in the docs config');

const out = await mkdtemp(join(tmpdir(), 'vite-llms-'));
site.outDir = out;
build.configResolved({ vitepress: site, build: {} });
build.buildStart();
for (const page of site.pages) {
	const file = join(site.srcDir, page);
	await tags.transform(await readFile(file, 'utf8'), file);
}
// The plugin rewrites images to the build's hashed names; the docs build's own asset names are the ones the site serves.
const bundle = Object.fromEntries((await readdir(join(docs, '.vitepress/dist/assets')).catch(() => [])).map((name) => [name, { fileName: `assets/${name}` }]));
await build.generateBundle({}, bundle);

const written = [];
async function collect(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) await collect(path);
		else if (/\.(md|txt)$/.test(entry.name)) written.push(relative(out, path));
	}
}
await collect(out);
for (const file of written) await cp(join(out, file), join('public', file));
await rm(out, { recursive: true, force: true });
process.stdout.write(`public/: ${written.length} files (${written.filter((f) => f.endsWith('.md')).length} Markdown pages, ${written.filter((f) => f.endsWith('.txt')).join(', ')})\n`);
