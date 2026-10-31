import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A converted app's parts import packages it may not have installed yet: they resolve from markless-migrate's own, and
// one neither has becomes a stub whose every export is an inert callable, so the rest of the module still loads.
const OWN = new URL('../../package.json', import.meta.url).href;
const STUB = 'markless-ledger-stub:';

type Next = (s: string, c: object) => Promise<unknown>;

export async function resolve(specifier: string, context: { parentURL?: string }, next: Next): Promise<unknown> {
	try {
		return await next(specifier, context);
	} catch (error) {
		if (specifier.startsWith('.') || !/^(@[\w.-]+\/)?[\w.-]+(\/.*)?$/.test(specifier)) throw error;
		try {
			return await next(specifier, { ...context, parentURL: OWN });
		} catch {
			return { url: `${STUB}${encodeURIComponent(specifier)}?from=${encodeURIComponent(context.parentURL ?? '')}`, shortCircuit: true };
		}
	}
}

const INERT = `const inert = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : inert), apply: () => inert, construct: () => inert });`;

export async function load(url: string, context: object, next: (u: string, c: object) => Promise<unknown>): Promise<unknown> {
	if (!url.startsWith(STUB)) return next(url, context);
	const [spec, query] = url.slice(STUB.length).split('?from=') as [string, string];
	const specifier = decodeURIComponent(spec);
	const from = decodeURIComponent(query ?? '');
	let names: string[] = [];
	try {
		const text = readFileSync(fileURLToPath(from), 'utf8');
		const quoted = specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
		for (const m of text.matchAll(new RegExp(`import\\s+(?:type\\s+)?(?:\\w+\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]${quoted}['"]`, 'g'))) names.push(...m[1]!.split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim()).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)));
		// `import * as v from 'valibot'`: the names read off the namespace (`v.string`).
		for (const m of text.matchAll(new RegExp(`import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s*['"]${quoted}['"]`, 'g'))) for (const u of text.matchAll(new RegExp(`\\b${m[1]}\\.([A-Za-z_$][\\w$]*)`, 'g'))) names.push(u[1]!);
	} catch {
		names = [];
	}
	const unique = [...new Set(names)].filter((n) => n !== 'default');
	return { format: 'module', shortCircuit: true, source: `${INERT}\nexport default inert;\n${unique.map((n) => `export const ${n} = inert;`).join('\n')}\n` };
}
