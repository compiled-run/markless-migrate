// Runs in the old page. React Aria's type-to-select matches an item's textValue (its textValue prop, children that are one
// string, or aria-label; otherwise empty): read from the item's collection node on its React fiber.
export function markTextValues(): void {
	type Fiber = { memoizedProps?: { node?: { type?: string; textValue?: unknown } }; return?: Fiber | null };
	const added = (window as unknown as { __mmAdded?: (Element | { node: Element })[] }).__mmAdded ?? [];
	const roots = added.map((a) => (a instanceof Element ? a : a.node)).filter((n) => n.isConnected);
	for (const root of roots)
		for (const item of [root, ...root.querySelectorAll('*')]) {
			if (!item.hasAttribute('data-rac') || !/^(option|menuitem|menuitemcheckbox|menuitemradio)$/.test(item.getAttribute('role') ?? '')) continue;
			const key = Object.keys(item).find((k) => k.startsWith('__reactFiber$'));
			let fiber = key ? (item as unknown as Record<string, Fiber>)[key] : undefined;
			for (; fiber; fiber = fiber.return ?? undefined) {
				const node = fiber.memoizedProps?.node;
				if (node && node.type === 'item' && typeof node.textValue === 'string') {
					item.setAttribute('data-mm-text-value', node.textValue);
					break;
				}
			}
		}
}
