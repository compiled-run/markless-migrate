import { parse, serialize, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';

export type Node = DefaultTreeAdapterMap['childNode'];
export type Element = DefaultTreeAdapterMap['element'];
export type ParentNode = DefaultTreeAdapterMap['parentNode'];
export type Text = DefaultTreeAdapterMap['textNode'];
export type Document = DefaultTreeAdapterMap['document'];
export type Template = DefaultTreeAdapterMap['template'];

export const parseDocument = (html: string): Document => parse(html);
export const outer = (node: Node): string => serializeOuter(node);
export const inner = (node: ParentNode): string => serialize(node);

export const isElement = (node: Node | ParentNode): node is Element => 'tagName' in node;
export const isText = (node: Node): node is Text => node.nodeName === '#text';

export function attr(el: Element, name: string): string | undefined {
	return el.attrs.find((a) => a.name === name && !a.prefix)?.value;
}

export function setAttr(el: Element, name: string, value: string): void {
	const found = el.attrs.find((a) => a.name === name && !a.prefix);
	if (found) found.value = value;
	else el.attrs.push({ name, value });
}

export function removeAttr(el: Element, name: string): void {
	el.attrs = el.attrs.filter((a) => !(a.name === name && !a.prefix));
}

export function childrenOf(node: ParentNode): Node[] {
	return node.nodeName === 'template' ? (node as Template).content.childNodes : node.childNodes;
}

export function elementChildren(node: ParentNode): Element[] {
	return childrenOf(node).filter(isElement);
}

/** Every element under `root` in document order, `root` first when it is one. */
export function* walk(root: ParentNode): Generator<Element> {
	if (isElement(root)) yield root;
	for (const child of childrenOf(root)) if (isElement(child)) yield* walk(child);
}

export function find(root: ParentNode, test: (el: Element) => boolean): Element | undefined {
	for (const el of walk(root)) if (test(el)) return el;
	return undefined;
}

export function remove(node: Node): void {
	const parent = node.parentNode;
	if (!parent) return;
	const list = childrenOf(parent);
	const at = list.indexOf(node);
	if (at >= 0) list.splice(at, 1);
	node.parentNode = null;
}

export function replaceWith(node: Node, replacements: readonly Node[]): void {
	const parent = node.parentNode;
	if (!parent) return;
	const list = childrenOf(parent);
	const at = list.indexOf(node);
	if (at < 0) return;
	for (const r of replacements) r.parentNode = parent;
	list.splice(at, 1, ...replacements);
	node.parentNode = null;
}

export function textContent(node: Node | ParentNode): string {
	if ('value' in node && node.nodeName === '#text') return (node as Text).value;
	if (!('childNodes' in node)) return '';
	return childrenOf(node as ParentNode)
		.map((n) => textContent(n))
		.join('');
}

export function head(doc: Document): Element {
	return find(doc, (el) => el.tagName === 'head')!;
}

export function body(doc: Document): Element {
	return find(doc, (el) => el.tagName === 'body')!;
}

export function html(doc: Document): Element {
	return find(doc, (el) => el.tagName === 'html')!;
}
