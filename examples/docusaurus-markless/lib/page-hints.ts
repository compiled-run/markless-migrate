// What the importer left on elements for the page's script (data-mm-*): read once, then taken off the page.
const hints = new WeakMap<Element, Record<string, string>>();
export function readHints(root: ParentNode): void {
	for (const el of root.querySelectorAll('*')) {
		let found: Record<string, string> | undefined;
		for (const attr of [...el.attributes]) {
			if (!attr.name.startsWith('data-mm-')) continue;
			(found ??= {})[attr.name.slice('data-mm-'.length)] = attr.value;
			el.removeAttribute(attr.name);
		}
		if (found) hints.set(el, { ...hints.get(el), ...found });
	}
}
export const hint = (el: Element | null | undefined, name: string): string | undefined => (el ? hints.get(el)?.[name] : undefined);
