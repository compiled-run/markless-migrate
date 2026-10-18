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
const isSiteFile = (path) => siteResolver !== null && path.startsWith(website) && !path.includes('/node_modules/') && !path.includes('/.docusaurus/');

// Resolution for imports written in the site's own modules; null leaves Node's resolution in place.
let siteResolver = null;
export function setSiteResolver(resolve) {
	siteResolver = resolve;
}

registerHooks({
	resolve(specifier, context, nextResolve) {
		const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : '';
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
		const source = readFileSync(path, 'utf8');
		const transforms = ['jsx', ...(/\.tsx?$/.test(path) ? ['typescript'] : []), ...(site && /\.js$/.test(path) && /\brequire\(|module\.exports/.test(source) && !/^\s*(import|export)\s/m.test(source) ? ['imports'] : [])];
		const { code } = transform(source, { transforms, jsxPragma: '__h', jsxFragmentPragma: '__Fragment', production: true, filePath: path, preserveDynamicImport: true });
		const prelude = [`import { h as __h, Fragment as __Fragment } from ${JSON.stringify(runtime)};`];
		if (site) prelude.push(`import { requireFor as __requireFor } from ${JSON.stringify(pathToFileURL(join(here, 'mdx.mjs')).href)};`, `const require = __requireFor(${JSON.stringify(path)});`);
		return { format: 'module', source: `${prelude.join('\n')}\n${code}`, shortCircuit: true };
	},
});

export function siteModulePath(specifier, parent) {
	const base = specifier.startsWith('@site/') ? join(website, specifier.slice(6)) : specifier.startsWith('.') ? join(dirname(parent), specifier) : null;
	if (!base) return null;
	for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, join(base, 'index.tsx'), join(base, 'index.ts'), join(base, 'index.js')]) if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	return null;
}

void tooling;
