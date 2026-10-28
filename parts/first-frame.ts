// The old page's cmdk paints its first items with the dialog and the rest a frame later: here the groups past the first
// screenful of items wait one paint the same way.
const FIRST_FRAME_ITEMS = 20;

/** Hides the cmdk groups in `el` past its first screenful of items until the next paint, each keeping its own display. */
export function itemsAfterFirstPaint(el: HTMLElement): void {
	const later: [HTMLElement, string][] = [];
	let items = 0;
	for (const group of el.querySelectorAll<HTMLElement>('[cmdk-list] [cmdk-group]')) {
		if (items >= FIRST_FRAME_ITEMS) later.push([group, group.style.display]);
		items += group.querySelectorAll('[cmdk-item]').length;
	}
	if (!later.length) return;
	for (const [group] of later) group.style.display = 'none';
	requestAnimationFrame(() => setTimeout(() => later.forEach(([group, display]) => (group.style.display = display))));
}
