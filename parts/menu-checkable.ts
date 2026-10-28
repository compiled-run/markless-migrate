// A menu's checkable items convert marked (markMenuCheckables), switched as the old page switched them.
const initial = new WeakMap<HTMLElement, boolean>();

function apply(item: HTMLElement, on: boolean): void {
	if (!initial.has(item)) initial.set(item, item.getAttribute('aria-checked') === 'true');
	const attrs = JSON.parse(item.getAttribute(on ? 'data-mm-on' : 'data-mm-off') ?? '{}') as Record<string, string | null>;
	for (const [name, value] of Object.entries(attrs)) {
		if (value === null) item.removeAttribute(name);
		else item.setAttribute(name, value);
	}
	for (const child of item.querySelectorAll<HTMLElement>(':scope > [data-mm-when]')) child.hidden = child.dataset.mmWhen !== (on ? 'on' : 'off');
}

/** Switches the checkable item a press chose: a checkbox flips, a radio becomes its group's one checked item. */
export function switchItem(item: Element): void {
	if (!(item instanceof HTMLElement) || !item.hasAttribute('data-mm-toggle')) return;
	const radio = item.getAttribute('data-mm-radio');
	if (radio === null) return apply(item, item.getAttribute('aria-checked') !== 'true');
	for (const other of item.closest('[role="menu"]')?.querySelectorAll<HTMLElement>(`[data-mm-radio="${radio}"]`) ?? []) apply(other, other === item);
}

/** Puts back the items whose state was the menu's own (Base UI's uncontrolled items), as the menu unmounts. */
export function resetItems(root: Element): void {
	for (const item of root.querySelectorAll<HTMLElement>('[data-mm-toggle="reset"]')) {
		const was = initial.get(item);
		if (was !== undefined) apply(item, was);
	}
}
