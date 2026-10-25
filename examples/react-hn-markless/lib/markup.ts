// Rows the browser inserts cannot run an attach of their own, so the region's attach shows each row's trusted HTML.
const applied = new WeakMap<Element, string>();

function show(element: Element): void {
	const markup = element.getAttribute('data-html') ?? '';
	if (applied.get(element) === markup) return;
	applied.set(element, markup);
	element.innerHTML = markup;
}

/** Keeps every `[data-html]` element under `root` showing its attribute's HTML as markup, as React's dangerouslySetInnerHTML did. */
export function showMarkup(root: Element): () => void {
	const sweep = () => root.querySelectorAll('[data-html]').forEach(show);
	sweep();
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'attributes' && record.target instanceof Element)
				show(record.target);
			else
				for (const node of record.addedNodes)
					if (node instanceof Element) {
						if (node.hasAttribute('data-html')) show(node);
						node.querySelectorAll('[data-html]').forEach(show);
					}
		}
	});
	observer.observe(root, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['data-html'],
	});
	return () => observer.disconnect();
}
