// Module hooks for running the ported route handlers in Node at convert time: extensionless relative imports resolve as a
// bundler resolves them, packages resolve from the old app (the versions the handlers were written against), server-only
// is the server's, and a JSON import needs no attribute.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

let oldApp;
export function initialize(data) {
	oldApp = pathToFileURL(`${data.oldApp}/package.json`).href;
}

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];

export async function resolve(specifier, context, nextResolve) {
	if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
	if (/^(\.{1,2}\/|\/|file:)/.test(specifier) && context.parentURL?.startsWith('file:')) {
		const base = fileURLToPath(new URL(specifier, context.parentURL));
		if (!(existsSync(base) && statSync(base).isFile())) {
			for (const ext of EXTENSIONS) if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	}
	try {
		return await nextResolve(specifier, context);
	} catch (error) {
		if (specifier.startsWith('node:')) throw error;
		return nextResolve(specifier, { ...context, parentURL: oldApp });
	}
}

export async function load(url, context, nextLoad) {
	if (url.startsWith('file:') && url.endsWith('.json') && context.importAttributes?.type !== 'json') return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};` };
	return nextLoad(url, context);
}
