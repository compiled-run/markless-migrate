import { parse } from 'yuku-css';
import { generate } from 'yuku-css/codegen';
import type { SourceLink } from './types.ts';

/** One selector of one style rule in an OLD stylesheet, with where it sits in the source. */
export interface CssRule {
	readonly selector: string;
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly order: number;
	readonly specificity: readonly [number, number, number];
	/** Media, container and supports conditions around the rule, outermost first. */
	readonly conditions: readonly { readonly kind: 'media' | 'container' | 'supports'; readonly text: string }[];
	readonly declarations: readonly { readonly property: string; readonly value: string; readonly important: boolean }[];
	/** Where the rule was written, when the stylesheet's source map or the old source says. */
	readonly original?: SourceLink;
}

export type CssState =
	| { readonly kind: 'pseudo'; readonly pseudo: 'hover' | 'focus' | 'focus-visible' | 'focus-within' | 'active'; readonly target: string; readonly label: string }
	| { readonly kind: 'property'; readonly property: 'checked' | 'disabled' | 'open'; readonly target: string; readonly label: string }
	| { readonly kind: 'media'; readonly feature: 'prefers-color-scheme' | 'prefers-reduced-motion'; readonly value: string; readonly label: string }
	| { readonly kind: 'width'; readonly width: number; readonly label: string }
	| { readonly kind: 'container'; readonly name: string | undefined; readonly width: number; readonly label: string };

export interface StyleSource {
	readonly url: string;
	readonly text: string;
}

const FORCED_PSEUDO = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active']);
const DOM_STATES = new Set(['checked', 'disabled']);
const EM = 16;
const GROUPING = new Set(['media', 'supports', 'container', 'layer', 'scope', 'starting-style']);

// biome-ignore lint/suspicious/noExplicitAny: css-tree's AST, walked generically
type Node = any;

function specificity(selector: Node): [number, number, number] {
	let a = 0;
	let b = 0;
	let c = 0;
	const visit = (node: Node) => {
		switch (node.type) {
			case 'IdSelector':
				a++;
				return;
			case 'ClassSelector':
			case 'AttributeSelector':
				b++;
				return;
			case 'PseudoClassSelector':
				if (node.name === 'where') return;
				if (['is', 'not', 'has', 'matches'].includes(node.name) && node.children) {
					const inner = (node.children[0]?.children ?? []).map((s: Node) => specificity(s));
					const top = inner.sort((x: number[], y: number[]) => y[0]! - x[0]! || y[1]! - x[1]! || y[2]! - x[2]!)[0] ?? [0, 0, 0];
					a += top[0];
					b += top[1];
					c += top[2];
					return;
				}
				b++;
				return;
			case 'TypeSelector':
				if (node.name !== '*') c++;
				return;
			case 'PseudoElementSelector':
				c++;
				return;
		}
	};
	for (const child of selector.children ?? []) visit(child);
	return [a, b, c];
}

const add = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const compareSpecificity = (a: readonly number[], b: readonly number[]) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;

function nest(selector: string, parents: readonly string[]): string {
	if (!parents.length) return selector;
	const parent = parents.length === 1 ? parents[0]! : `:is(${parents.join(', ')})`;
	const wrapped = /^[\w.#[:*-]/.test(parent) && !parent.includes(' ') && !parent.includes(',') ? parent : `:is(${parent})`;
	return selector.includes('&') ? selector.replaceAll('&', wrapped) : `${wrapped} ${selector}`;
}

export function parseRules(sources: readonly StyleSource[]): CssRule[] {
	const rules: CssRule[] = [];
	for (const source of sources) {
		const { ast } = parse(source.text, { positions: true });
		const walk = (nodes: readonly Node[], conditions: CssRule['conditions'], parents: readonly string[], parentSpecificity: readonly [number, number, number]) => {
			for (const node of nodes) {
				if (node.type === 'Atrule' && node.block && GROUPING.has(node.name)) {
					const kind = node.name === 'media' || node.name === 'container' || node.name === 'supports' ? node.name : undefined;
					const text = node.prelude ? generate(node.prelude) : '';
					walk(node.block.children, kind ? [...conditions, { kind, text }] : conditions, parents, parentSpecificity);
				} else if (node.type === 'Rule' && node.prelude?.type === 'SelectorList') {
					const selectors = node.prelude.children as Node[];
					const texts = selectors.map((s) => nest(generate(s), parents));
					const children = node.block.children as Node[];
					const declarations = children
						.filter((d) => d.type === 'Declaration')
						.map((d) => ({ property: d.property.toLowerCase(), value: generate(d.value), important: Boolean(d.important) }));
					const specificities = selectors.map((sel) => add(specificity(sel), parents.length ? parentSpecificity : [0, 0, 0]));
					if (declarations.length) {
						selectors.forEach((sel, i) => {
							rules.push({ selector: texts[i]!, file: source.url, line: sel.loc.start.line, column: sel.loc.start.column, order: rules.length, specificity: specificities[i]!, conditions, declarations });
						});
					}
					walk(
						children.filter((d) => d.type !== 'Declaration'),
						conditions,
						texts,
						specificities.reduce((top, x) => (compareSpecificity(x, top) > 0 ? x : top), [0, 0, 0] as [number, number, number]),
					);
				}
			}
		};
		walk(ast.children, [], [], [0, 0, 0]);
	}
	return rules;
}

// The compound the state applies to, without the state: `.card:hover > .title` targets `.card`.
function stateTarget(selector: Node, index: number): string {
	const children = selector.children as Node[];
	let end = index + 1;
	while (end < children.length && children[end].type !== 'Combinator') end++;
	const kept = children.slice(0, end).filter((_, i) => i !== index);
	const text = kept.length ? generate({ type: 'Selector', children: kept } as Node) : '*';
	return /(^|[\s>+~])$/.test(text) ? `${text}*` : text;
}

function widthEdges(text: string): number[] {
	const px = (value: string, unit: string) => Math.round(Number(value) * (unit === 'px' ? 1 : EM));
	const edges: number[] = [];
	for (const m of text.matchAll(/(min|max)-(?:width|inline-size)\s*:\s*([\d.]+)(px|r?em)/g)) {
		const w = px(m[2]!, m[3]!);
		edges.push(...(m[1] === 'min' ? [w - 1, w] : [w, w + 1]));
	}
	for (const m of text.matchAll(/(?:width|inline-size)\s*(<=|>=|<|>)\s*([\d.]+)(px|r?em)/g)) {
		const w = px(m[2]!, m[3]!);
		edges.push(...(m[1] === '>=' || m[1] === '<' ? [w - 1, w] : [w, w + 1]));
	}
	for (const m of text.matchAll(/([\d.]+)(px|r?em)\s*(<=|>=|<|>)\s*(?:width|inline-size)/g)) {
		const w = px(m[1]!, m[2]!);
		edges.push(...(m[3] === '<=' || m[3] === '>' ? [w - 1, w] : [w, w + 1]));
	}
	return edges;
}

/** Every state and condition the OLD stylesheets style, deduplicated, in source order. */
export function discoverStates(sources: readonly StyleSource[]): CssState[] {
	const states = new Map<string, CssState>();
	const add = (state: CssState) => {
		if (!states.has(state.label)) states.set(state.label, state);
	};
	for (const source of sources) {
		const { ast } = parse(source.text);
		const walk = (nodes: readonly Node[], parents: readonly string[]) => {
			for (const node of nodes) {
				if (node.type === 'Atrule') {
					const text = node.prelude ? generate(node.prelude) : '';
					if (node.name === 'media') {
						for (const m of text.matchAll(/prefers-color-scheme\s*:\s*(dark|light)/g)) add({ kind: 'media', feature: 'prefers-color-scheme', value: m[1]!, label: `prefers-color-scheme: ${m[1]}` });
						if (/prefers-reduced-motion/.test(text)) add({ kind: 'media', feature: 'prefers-reduced-motion', value: 'no-preference', label: 'prefers-reduced-motion: no-preference' });
						for (const width of widthEdges(text)) add({ kind: 'width', width, label: `viewport width ${width}px` });
					} else if (node.name === 'container') {
						const name = /^\s*([a-z_][\w-]*)\s+(?!and\b|or\b|not\b)/i.exec(text)?.[1];
						for (const width of widthEdges(text)) add({ kind: 'container', name, width, label: `container${name ? ` ${name}` : ''} width ${width}px` });
					}
					if (node.block && GROUPING.has(node.name)) walk(node.block.children, parents);
				} else if (node.type === 'Rule' && node.prelude?.type === 'SelectorList') {
					const texts = (node.prelude.children as Node[]).map((s) => nest(generate(s), parents));
					for (const selector of node.prelude.children as Node[]) {
						(selector.children as Node[]).forEach((part, index) => {
							const target = () => nest(stateTarget(selector, index), parents).replace(/^:is\((.*)\)$/, '$1');
							if (part.type === 'PseudoClassSelector' && FORCED_PSEUDO.has(part.name)) add({ kind: 'pseudo', pseudo: part.name, target: target(), label: `:${part.name} on ${target()}` });
							else if (part.type === 'PseudoClassSelector' && DOM_STATES.has(part.name)) add({ kind: 'property', property: part.name, target: target(), label: `:${part.name} on ${target()}` });
							else if (part.type === 'AttributeSelector' && part.name?.name === 'open') add({ kind: 'property', property: 'open', target: target(), label: `[open] on ${target()}` });
						});
					}
					walk(
						(node.block.children as Node[]).filter((d) => d.type !== 'Declaration'),
						texts,
					);
				}
			}
		};
		walk(ast.children, []);
	}
	return [...states.values()];
}

const SHORTHANDS: Record<string, readonly string[]> = {
	inset: ['top', 'right', 'bottom', 'left'],
	gap: ['row-gap', 'column-gap'],
	font: ['line-height'],
	'place-items': ['align-items', 'justify-items'],
	'place-content': ['align-content', 'justify-content'],
	'place-self': ['align-self', 'justify-self'],
	'flex-flow': ['flex-direction', 'flex-wrap'],
	columns: ['column-width', 'column-count'],
};

/** Whether a declared property sets a computed longhand. */
export function covers(declared: string, computed: string): boolean {
	return declared === computed || computed.startsWith(`${declared}-`) || (SHORTHANDS[declared]?.includes(computed) ?? false);
}

export function describeRule(rule: CssRule): string {
	const where = rule.conditions.map((c) => `@${c.kind} ${c.text}`).join(' ');
	const at = rule.original ? `${rule.original.file}:${rule.original.line}:${rule.original.column}, served as ` : '';
	return `\`${rule.selector}\`${where ? ` inside ${where}` : ''} (${at}${rule.file}:${rule.line}:${rule.column})`;
}
