// Lets the importer load .jsx/.tsx: its own ported components, and the site's own components and data
// (website/src, components next to blog posts) when no hand port exists. Those run against the ported theme: the
// rule maps each of their framework imports (React, @docusaurus/*, @theme/*, CSS modules, images) to the port's
// modules, so they render static markup; whatever they do once mounted is ported in lib/site.ts.
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { website } from './site.mjs';

const require = createRequire(join(website, '../node_modules/.pnpm/sucrase@3.35.1/node_modules/sucrase/package.json'));
const { transform } = require('sucrase');
const here = import.meta.dirname;
const runtime = pathToFileURL(join(here, 'h.mjs')).href;
const tooling = join(here, '..');
// Only once the old site's own loading is done: Docusaurus imports the same files with its own resolution.
const siteRoots = [];
const isSiteFile = (path) => siteResolver !== null && ((path.startsWith(website) && !path.includes('/node_modules/') && !path.includes('/.docusaurus/')) || siteRoots.some((root) => path.startsWith(root)));
// Package code that runs unmodified against the ported theme, as the site's own modules do.
export function addSiteRoot(dir) {
	siteRoots.push(dir);
}

// Resolution for imports written in the site's own modules; null leaves Node's resolution in place.
let siteResolver = null;
let assetUrls = (code) => code;
export function setSiteResolver(resolve, rewriteAssetUrls) {
	siteResolver = resolve;
	if (rewriteAssetUrls) assetUrls = rewriteAssetUrls;
}

registerHooks({
	resolve(specifier, context, nextResolve) {
		const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : '';
		const type = context.importAttributes?.type;
		if (parent && isSiteFile(parent) && (type === 'text' || type === 'json')) {
			const path = siteModulePath(specifier, parent, false);
			if (type === 'json') return { url: pathToFileURL(path).href, shortCircuit: true, format: 'json' };
			return { url: `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(readFileSync(path, 'utf8'))};`)}`, shortCircuit: true, format: 'module', importAttributes: {} };
		}
		if (parent && isSiteFile(parent) && siteResolver) {
			const resolved = siteResolver(specifier, parent);
			if (resolved) return { url: resolved, shortCircuit: true, format: resolved.startsWith('data:') ? 'module' : undefined };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (!url.startsWith('file:')) return nextLoad(url, context);
		const path = fileURLToPath(url);
		const site = isSiteFile(path);
		if (!/\.(jsx|tsx)$/.test(path) && !(site && /\.(ts|js)$/.test(path))) return nextLoad(url, context);
		const raw = readFileSync(path, 'utf8');
		const source = site && raw.includes('import.meta.url') ? assetUrls(raw, path) : raw;
		const transforms = ['jsx', ...(/\.tsx?$/.test(path) ? ['typescript'] : []), ...(site && /\.js$/.test(path) && /\brequire\(|module\.exports/.test(source) && !/^\s*(import|export)\s/m.test(source) ? ['imports'] : [])];
		const { code } = transform(source, { transforms, jsxPragma: '__h', jsxFragmentPragma: '__Fragment', production: true, filePath: path, preserveDynamicImport: true });
		const prelude = [`import { h as __h, Fragment as __Fragment } from ${JSON.stringify(runtime)};`];
		if (site) prelude.push(`import { requireFor as __requireFor } from ${JSON.stringify(pathToFileURL(join(here, 'mdx.mjs')).href)};`, `const require = __requireFor(${JSON.stringify(path)});`);
		return { format: 'module', source: `${prelude.join('\n')}\n${code}`, shortCircuit: true };
	},
});

export function siteModulePath(specifier, parent, extensions = true) {
	const base = specifier.startsWith('@site/') ? join(website, specifier.slice(6)) : specifier.startsWith('.') ? join(dirname(parent), specifier) : null;
	if (!base) return null;
	if (!extensions) return base;
	for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, join(base, 'index.tsx'), join(base, 'index.ts'), join(base, 'index.js')]) if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	return null;
}

void tooling;
