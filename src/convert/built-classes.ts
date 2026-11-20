import { parse } from 'yuku';
import { parse as parseTsrx } from 'yuku-tsrx';

// biome-ignore lint/suspicious/noExplicitAny: ESTree from yuku and yuku-tsrx, walked generically
type Node = any;

// The class-like word a template's text ends with right before an interpolation: `style-${name}` builds `style-…`.
const START = /(?:^|[\s"'`])(-?[A-Za-z_][\w-]*-)$/;

/** A module's syntax tree, or undefined where it does not parse. */
export function parseModule(file: string, text: string): Node | undefined {
	try {
		return file.endsWith('.tsrx') ? parseTsrx(text, { lang: 'tsx' }).program : parse(text, { path: file, sourceType: 'module' }).program;
	} catch {
		return undefined;
	}
}

/** The starts of the classes a module's template literals can build (`style-` for `` `style-${params.style}` ``). */
export function builtStarts(program: Node): string[] {
	const starts = new Set<string>();
	const visit = (node: Node): void => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'TemplateLiteral')
			for (let i = 0; i < node.expressions.length; i++) {
				const start = START.exec(node.quasis[i]?.value?.cooked ?? '')?.[1];
				if (start) starts.add(start);
			}
		for (const key of Object.keys(node)) if (key !== 'parent' && typeof node[key] === 'object') visit(node[key]);
	};
	visit(program);
	return [...starts];
}

/** `tokens`, and every class longer than one of `starts` that begins with it. */
export function withBuilt(tokens: { has(token: string): boolean }, starts: Iterable<string>): { has(token: string): boolean } {
	const list = [...new Set(starts)];
	if (!list.length) return tokens;
	return { has: (token) => tokens.has(token) || list.some((s) => token.length > s.length && token.startsWith(s)) };
}
