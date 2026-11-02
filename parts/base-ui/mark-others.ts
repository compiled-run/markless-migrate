// floating-ui's markOthers as Base UI's FloatingFocusManager calls it around a modal popup: aria-hidden on everything
// outside the popup and the page's live regions, data-base-ui-inert on everything outside the popup alone. Scripts are
// never marked and, unlike the aria-hidden package Radix uses, keep nothing around them shown.
const MARKER = 'data-base-ui-inert';
const hiddenCount = new WeakMap<Element, number>();
const markerCount = new WeakMap<Element, number>();
const alreadyHidden = new WeakSet<Element>();

function outside(body: HTMLElement, avoid: readonly Element[]): Element[] {
	const keep = new Set<Element>();
	for (const el of avoid) for (let node: Element | null = el; node && !keep.has(node); node = node.parentElement) keep.add(node);
	const stop = new Set(avoid);
	const out: Element[] = [];
	const walk = (parent: Element) => {
		if (stop.has(parent)) return;
		for (const node of parent.children) {
			if (node.localName === 'script') continue;
			if (keep.has(node)) walk(node);
			else out.push(node);
		}
	};
	walk(body);
	return out;
}

export function markOthers(inside: readonly Element[]): () => void {
	const body = document.body;
	const avoid = inside.filter((el) => body.contains(el));
	const hidden = outside(body, [...avoid, ...body.querySelectorAll('[aria-live]')]);
	const marked = outside(body, avoid);
	for (const node of hidden) {
		const attr = node.getAttribute('aria-hidden');
		const was = attr !== null && attr !== 'false';
		const count = (hiddenCount.get(node) ?? 0) + 1;
		hiddenCount.set(node, count);
		if (count === 1 && was) alreadyHidden.add(node);
		if (!was) node.setAttribute('aria-hidden', 'true');
	}
	for (const node of marked) {
		const count = (markerCount.get(node) ?? 0) + 1;
		markerCount.set(node, count);
		if (count === 1) node.setAttribute(MARKER, '');
	}
	return () => {
		for (const node of hidden) {
			const count = (hiddenCount.get(node) ?? 1) - 1;
			hiddenCount.set(node, count);
			if (count) continue;
			if (!alreadyHidden.has(node)) node.removeAttribute('aria-hidden');
			alreadyHidden.delete(node);
		}
		for (const node of marked) {
			const count = (markerCount.get(node) ?? 1) - 1;
			markerCount.set(node, count);
			if (!count) node.removeAttribute(MARKER);
		}
	};
}
