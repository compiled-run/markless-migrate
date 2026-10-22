// The aria-hidden package's hideOthers, as Radix's modal layers call it: every element beside the chain from the body
// down to the kept nodes is hidden from assistive technology, except live regions and scripts; counts let nested
// layers undo in any order.
const hiddenCount = new WeakMap<Element, number>();
const markerCount = new WeakMap<Element, number>();
const alreadyHidden = new WeakSet<Element>();

export function hideOthers(targets: readonly Element[]): () => void {
	const body = document.body;
	const keep = new Set<Element>([...targets, ...body.querySelectorAll('[aria-live], script')]);
	const chain = new Set<Element>();
	for (const el of keep) for (let node: Element | null = el; node && !chain.has(node); node = node.parentElement) chain.add(node);
	const hidden: Element[] = [];
	const walk = (parent: Element) => {
		if (keep.has(parent) && parent !== body) return;
		for (const node of parent.children) {
			if (chain.has(node)) {
				walk(node);
				continue;
			}
			const attr = node.getAttribute('aria-hidden');
			const was = attr !== null && attr !== 'false';
			const count = (hiddenCount.get(node) ?? 0) + 1;
			const marker = (markerCount.get(node) ?? 0) + 1;
			hiddenCount.set(node, count);
			markerCount.set(node, marker);
			hidden.push(node);
			if (count === 1 && was) alreadyHidden.add(node);
			if (marker === 1) node.setAttribute('data-aria-hidden', 'true');
			if (!was) node.setAttribute('aria-hidden', 'true');
		}
	};
	walk(body);
	return () => {
		for (const node of hidden) {
			if (!hiddenCount.has(node)) continue;
			const count = (hiddenCount.get(node) ?? 1) - 1;
			const marker = (markerCount.get(node) ?? 1) - 1;
			hiddenCount.set(node, count);
			markerCount.set(node, marker);
			if (!count) {
				if (!alreadyHidden.has(node)) node.removeAttribute('aria-hidden');
				alreadyHidden.delete(node);
			}
			if (!marker) node.removeAttribute('data-aria-hidden');
		}
	};
}
