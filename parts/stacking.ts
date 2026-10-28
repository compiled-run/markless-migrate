// A portal mounts an opening popup last, over every open one; Markless owns node order, so z-index does it here.
export function raiseOver(nodes: readonly HTMLElement[], others: readonly HTMLElement[]): (() => void) | undefined {
	const z = (n: Element) => Number.parseInt(getComputedStyle(n).zIndex, 10) || 0;
	const first = nodes[0];
	if (!first) return undefined;
	let over = -Infinity;
	for (const n of others) if (!nodes.includes(n) && first.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) over = Math.max(over, z(n));
	const low = nodes.filter((n) => getComputedStyle(n).position !== 'static' && z(n) <= over);
	if (!low.length) return undefined;
	const was = low.map((n) => n.style.zIndex);
	for (const n of low) n.style.zIndex = String(over + 1);
	return () => low.forEach((n, i) => (n.style.zIndex = was[i]!));
}
