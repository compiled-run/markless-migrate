import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Language, Parser, type Node } from 'web-tree-sitter';

export type TsNode = Node;

const require = createRequire(import.meta.url);
const GRAMMARS = { ruby: ['tree-sitter-ruby', 'tree-sitter-ruby.wasm'], php: ['tree-sitter-php', 'tree-sitter-php.wasm'], python: ['tree-sitter-python', 'tree-sitter-python.wasm'] } as const;
export type Grammar = keyof typeof GRAMMARS;

let init: Promise<void> | undefined;
const parsers = new Map<Grammar, Promise<Parser>>();

function parserFor(grammar: Grammar): Promise<Parser> {
	let parser = parsers.get(grammar);
	if (!parser) {
		parser = (async () => {
			init ??= Parser.init();
			await init;
			const [pkg, file] = GRAMMARS[grammar];
			const language = await Language.load(join(dirname(require.resolve(`${pkg}/package.json`)), file));
			const p = new Parser();
			p.setLanguage(language);
			return p;
		})();
		parsers.set(grammar, parser);
	}
	return parser;
}

export async function parseTree(grammar: Grammar, text: string): Promise<TsNode> {
	const tree = (await parserFor(grammar)).parse(text);
	if (!tree) throw new Error(`tree-sitter could not parse ${grammar}`);
	return tree.rootNode;
}

export const lineOf = (node: TsNode) => node.startPosition.row + 1;

export function* descendants(node: TsNode, type?: string | readonly string[]): Generator<TsNode> {
	const types = typeof type === 'string' ? [type] : type;
	const cursor = node.walk();
	let depth = 0;
	for (;;) {
		const current = cursor.currentNode;
		if (depth > 0 && current.isNamed && (!types || types.includes(current.type))) yield current;
		if (cursor.gotoFirstChild()) {
			depth++;
			continue;
		}
		for (;;) {
			if (depth === 0) return;
			if (cursor.gotoNextSibling()) break;
			cursor.gotoParent();
			depth--;
		}
	}
}

export const named = (node: TsNode | null | undefined): TsNode[] => (node ? (node.namedChildren.filter(Boolean) as TsNode[]) : []);

/** The value of a string literal in Ruby, PHP or Python; undefined for interpolated strings. */
export function stringValue(node: TsNode | null | undefined): string | undefined {
	if (!node) return undefined;
	switch (node.type) {
		case 'string':
		case 'encapsed_string':
		case 'concatenated_string': {
			if (node.type === 'concatenated_string') {
				const parts = named(node).map(stringValue);
				return parts.every((p) => p !== undefined) ? parts.join('') : undefined;
			}
			let out = '';
			for (const child of named(node)) {
				if (child.type === 'string_content' || child.type === 'string_value') out += child.text;
				else if (child.type === 'escape_sequence') out += child.text;
				else if (child.type === 'string_start' || child.type === 'string_end') continue;
				else return undefined;
			}
			return out;
		}
		case 'simple_symbol':
			return node.text.slice(1);
		case 'hash_key_symbol':
		case 'string_content':
		case 'identifier':
			return node.text;
		case 'delimited_symbol':
			return stringValue(named(node)[0]) ?? node.text.slice(2, -1);
		case 'nowdoc':
		case 'heredoc':
			return undefined;
		default:
			return undefined;
	}
}
