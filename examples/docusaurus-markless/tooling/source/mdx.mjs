// Compiles an MDX file with the loaders its content plugin configured, then imports the result with every import
// resolved by rule: the JSX runtime, React and MDX's provider to source/, `@theme/*` and `@docusaurus/*` to the
// ported theme in theme/, the site's own components to ports/, partials recursively, data files as data, and
// assets to the URLs the old build gave them.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileWithPluginLoaders, website, siteRequire } from './site.mjs';
import { assetUrl } from './assets.mjs';
import { idealImage } from './ideal-image.mjs';
import { parse } from '../../../../node_modules/yuku/dist/index.js';

const tooling = join(import.meta.dirname, '..');
// `@generated/routes` and `@generated/registry`, as the old build generated them from the route tree.
const generatedModules = new Map();
export function provideGenerated(specifier, value) {
	generatedModules.set(specifier, value);
}
// `new URL('./file', import.meta.url)`: the bundler's asset URL for that file, as `.href` and as a string.
export function assetUrlsIn(code, fromFile) {
	if (!code.includes('import.meta.url')) return code;
	const { program } = parse(code, { sourceType: 'module', lang: /\.tsx?$/.test(fromFile) ? 'tsx' : 'jsx' });
	const found = [];
	const walk = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) return node.forEach(walk);
		const [spec, base] = node.arguments ?? [];
		if (node.type === 'NewExpression' && node.callee?.name === 'URL' && typeof spec?.value === 'string' && base?.type === 'MemberExpression' && base.object?.type === 'MetaProperty' && base.property?.name === 'url') found.push([node.start, node.end, spec.value]);
		for (const key in node) if (key !== 'parent') walk(node[key]);
	};
	walk(program);
	for (const [start, end, spec] of found.sort((a, b) => b[0] - a[0])) {
		const path = spec.startsWith('@site/') ? join(website, spec.slice(6)) : resolve(dirname(fromFile), spec);
		const href = JSON.stringify(assetUrl(path, ''));
		code = `${code.slice(0, start)}({ href: ${href}, toString: () => ${href} })${code.slice(end)}`;
	}
	return code;
}
// The debug plugin's theme has no port: its own compiled components run against the ported theme.
export const debugTheme = realpathSync(join(dirname(createRequire(siteRequire.resolve('@docusaurus/preset-classic')).resolve('@docusaurus/plugin-debug')), 'theme'));
export const jsonViewLite = realpathSync(dirname(createRequire(join(debugTheme, 'index.js')).resolve('react-json-view-lite')));
const cacheDir = join(tooling, '.cache/mdx');
const compiled = new Map();
export const missingPorts = new Map();

const url = (path) => pathToFileURL(path).href;

function portFile(dir, name) {
	for (const ext of ['.jsx', '.tsx', '.mjs']) {
		const file = join(tooling, dir, `${name}${ext}`);
		if (existsSync(file)) return file;
	}
	return null;
}

// What an MDX module or one of the site's own modules may import, and where each kind of import comes from in
// the port: the JSX runtime, React and MDX's provider to source/, `@theme/*` and `@docusaurus/*` to the ported
// theme, the site's own components to a hand port in ports/ when there is one (else their own source, run
// against the ported theme), data files as data, CSS modules as their built class names, and assets as their URLs.
export function resolveSync(specifier, fromFile) {
	const bare = specifier.replace(/^!+[^!]*!/, '');
	if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') return url(join(import.meta.dirname, 'h.mjs'));
	if (specifier === '@mdx-js/react') return url(join(import.meta.dirname, 'mdx-react.mjs'));
	if (specifier === 'react') return url(join(import.meta.dirname, 'react.mjs'));
	if (generatedModules.has(specifier)) return dataModule(specifier, generatedModules.get(specifier));
	if (specifier === 'react-dom') return url(join(import.meta.dirname, 'react-dom.mjs'));
	if (specifier === 'clsx') return url(join(import.meta.dirname, 'clsx.mjs'));
	if (specifier.startsWith('@theme/') || specifier.startsWith('@theme-original/') || specifier.startsWith('@theme-init/')) {
		const name = specifier.replace(/^@theme(-original|-init)?\//, '');
		const debug = join(debugTheme, name, 'index.js');
		return orMissing(portFile('theme', name.replace(/\//g, '-')) ?? (existsSync(debug) ? debug : null), specifier, fromFile);
	}
	if (specifier.startsWith('@docusaurus/')) {
		const name = specifier.slice('@docusaurus/'.length);
		return orMissing(portFile('theme/docusaurus', name.replace(/\//g, '-')), specifier, fromFile);
	}
	let path = bare.startsWith('@site/') ? join(website, bare.slice('@site/'.length)) : bare.startsWith('.') ? resolve(dirname(fromFile), bare) : null;
	if (!path) {
		const file = portFile('ports', specifier.replace(/\//g, '-'));
		if (file) return url(file);
		if (/\.css$/.test(specifier)) return dataModule(specifier, {});
		return null;
	}
	path = path.split('?')[0];
	const candidates = [path, `${path}.tsx`, `${path}.ts`, `${path}.jsx`, `${path}.js`, `${path}.mdx`, `${path}.md`, join(path, 'index.tsx'), join(path, 'index.ts'), join(path, 'index.js')];
	const found = candidates.find((file) => existsSync(file) && statSync(file).isFile());
	if (!found) return missing(specifier, fromFile);
	const ext = extname(found);
	if (ext === '.json') return dataModule(found, JSON.parse(readFileSync(found, 'utf8')));
	if (ext === '.yaml' || ext === '.yml' || specifier.includes('raw-loader')) return textModule(found, readFileSync(found, 'utf8'));
	if (ext === '.md' || ext === '.mdx') return compiledFiles.has(found) ? url(compiledFiles.get(found)) : { mdx: found };
	if (ext === '.css' || ext === '.scss') return url(join(import.meta.dirname, 'css-module.mjs')) + `?file=${encodeURIComponent(found)}`;
	if (ext === '.svg') return svgModule(found);
	if (/\.(tsx|ts|jsx|js)$/.test(ext)) {
		const rel = relative(join(website, 'src'), found);
		const name = (rel.startsWith('..') ? relative(website, found) : rel).replace(/\/index\.(tsx|ts|js)$/, '').replace(/\.(tsx|ts|jsx|js)$/, '').replace(/\//g, '-');
		return url(portFile('ports', name) ?? found);
	}
	if (/\.(png|jpe?g)$/i.test(ext) && !specifier.startsWith('!')) return dataModule(found, idealImage(found));
	if (/\.(png|jpe?g|gif|webp|ico|pdf|docx|xyz|mp4)$/i.test(ext)) return dataModule(found, assetUrl(found, specifier));
	return missing(specifier, fromFile);
}

export async function resolveImport(specifier, fromFile, rules) {
	const resolved = resolveSync(specifier, fromFile);
	if (resolved && typeof resolved === 'object') return url(await compileMdx(resolved.mdx, '', rules));
	return resolved ?? missing(specifier, fromFile);
}

const orMissing = (file, specifier, fromFile) => (file ? url(file) : missing(specifier, fromFile));

function missing(specifier, fromFile) {
	const list = missingPorts.get(specifier) ?? new Set();
	list.add(relative(website, fromFile));
	missingPorts.set(specifier, list);
	return `${url(join(import.meta.dirname, 'missing.mjs'))}?name=${encodeURIComponent(specifier)}`;
}

async function writeCached(name, source) {
	await mkdir(cacheDir, { recursive: true });
	const file = join(cacheDir, `${createHash('sha1').update(name + source).digest('hex').slice(0, 16)}-${basename(name).replace(/[^\w.-]/g, '_')}.mjs`);
	await writeFile(file, source);
	return file;
}

const dataModules = new Map();
function dataModule(file, value) {
	const key = `${file}\0${JSON.stringify(value)}`;
	if (!dataModules.has(key)) dataModules.set(key, `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(value)};`)}`);
	return dataModules.get(key);
}
function textModule(file, text) {
	return dataModule(file, text);
}
// `import x from './file' with {type: 'text'}`: the file's text.
function textFile(specifier, fromFile) {
	const path = specifier.startsWith('@site/') ? join(website, specifier.slice(6)) : resolve(dirname(fromFile), specifier);
	return textModule(path, readFileSync(path, 'utf8'));
}
function svgModule(file) {
	return url(join(import.meta.dirname, 'svg-module.mjs')) + `?file=${encodeURIComponent(file)}`;
}

// `require(...)` in compiled MDX: asset requests the image/file rules rewrote, and the authors' own requires.
// Modules an MDX `require()` may name by package (`require('@docusaurus/useBaseUrl')`), loaded up front.
export const requirable = new Map();
export async function loadRequirable(specifiers, rules) {
	for (const specifier of specifiers) requirable.set(specifier, await import(await resolveImport(specifier, website, rules)));
}

export function requireFor(fromFile) {
	return (request) => {
		if (requirable.has(request)) return requirable.get(request);
		const bare = request.replace(/^!+/, '').replace(/^[^!]*!/, '');
		const [pathPart] = bare.split('?');
		const path = pathPart.startsWith('@site/') ? join(website, pathPart.slice(6)) : resolve(dirname(fromFile), pathPart);
		if (path.endsWith('.json') && bare === request) return JSON.parse(readFileSync(path, 'utf8'));
		// The ideal-image plugin owns png/jpeg requires from components and MDX JSX; `!`-prefixed asset requests skip it.
		if (!request.startsWith('!') && /\.(png|jpe?g)$/i.test(path)) return idealImage(path);
		// An asset module is its URL: used as a string (`require(x) + ""`) and as `require(x).default`.
		const url = new String(assetUrl(path, request));
		url.default = String(url);
		return url;
	};
}

// MDX files a site module imports, compiled ahead so the synchronous module hooks can point at them.
const compiledFiles = new Map();
export async function compileSiteMdxImports(entry, rules, seen = new Set()) {
	if (seen.has(entry)) return;
	seen.add(entry);
	const source = readFileSync(entry, 'utf8');
	for (const match of source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
		const spec = match[1];
		if (!spec.startsWith('.') && !spec.startsWith('@site/')) continue;
		const path = spec.startsWith('@site/') ? join(website, spec.slice(6)) : resolve(dirname(entry), spec);
		const found = [path, `${path}.tsx`, `${path}.ts`, `${path}.js`, `${path}.mdx`, `${path}.md`, join(path, 'index.tsx')].find((f) => existsSync(f) && statSync(f).isFile());
		if (!found) continue;
		if (/\.mdx?$/.test(found)) compiledFiles.set(found, await compileMdx(found, '', rules));
		else if (/\.(tsx|ts|js)$/.test(found)) await compileSiteMdxImports(found, rules, seen);
	}
}

export async function compileMdx(filePath, query = '', rules) {
	const key = filePath + query;
	if (compiled.has(key)) return compiled.get(key);
	const promise = (async () => {
		const { source } = await compileWithPluginLoaders(rules, filePath, query);
		const lines = [];
		let code = source;
		const { program } = parse(code, { sourceType: 'module', lang: 'jsx' });
		const declarations = program.body.filter((node) => node.source && /^(Import|ExportNamed|ExportAll)Declaration$/.test(node.type));
		for (const node of declarations.reverse()) {
			const type = node.attributes?.find((a) => (a.key.name ?? a.key.value) === 'type')?.value.value;
			const resolved = type === 'text' ? textFile(node.source.value, filePath) : type === 'json' ? url(resolve(dirname(filePath), node.source.value.replace(/^@site\//, `${website}/`))) : await resolveImport(node.source.value, filePath, rules);
			const tail = type === 'json' ? code.slice(node.source.end, node.end) : code.slice(node.source.end, node.end).replace(/^\s*with\s*\{[^}]*\}/, '');
			code = code.slice(0, node.source.start) + JSON.stringify(resolved) + tail + code.slice(node.end);
		}
		code = assetUrlsIn(code, filePath);
		lines.push(`import { requireFor as __requireFor } from ${JSON.stringify(url(import.meta.filename))};`);
		lines.push(`const require = __requireFor(${JSON.stringify(filePath)});`);
		lines.push(code);
		return writeCached(filePath + query, lines.join('\n'));
	})();
	compiled.set(key, promise);
	return promise;
}

export async function importMdx(filePath, query, rules) {
	const file = await compileMdx(filePath, query, rules);
	return import(url(file));
}

void siteRequire;
