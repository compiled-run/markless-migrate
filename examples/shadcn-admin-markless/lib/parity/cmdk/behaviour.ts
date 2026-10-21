// Parity port of cmdk inside a Radix Dialog, as command-menu.tsx uses it: the DOM half. The palette's markup is
// rendered once by the shell inside the shared Radix Dialog port; these functions filter and select its items, and
// say what the chosen item does.
import { dropScrollbar } from '../radix-ui-react-scroll-area/hover-scrollbar.ts';

const KEY = 'command-palette';

const dialog = () => document.getElementById(`${KEY}-input`)?.closest('[role=dialog]') ?? null;
const input = () => document.getElementById(`${KEY}-input`) as HTMLInputElement | null;
const itemsIn = (root: Element | null) => [...(root?.querySelectorAll<HTMLElement>('[cmdk-item]') ?? [])];
const items = () => itemsIn(dialog());
// Shown within the list, whether or not the dialog around it is shown yet: the palette is reset as it opens.
const shownIn = (el: Element, root: Element | null) => {
	for (let node: Element | null = el; node && node !== root; node = node.parentElement) if ((node as HTMLElement).hidden) return false;
	return true;
};
const visibleIn = (root: Element | null) => itemsIn(root).filter((el) => shownIn(el, root));
const visible = () => visibleIn(dialog());

function selectIn(root: Element | null, target: HTMLElement | undefined): void {
	for (const el of itemsIn(root)) {
		const on = el === target;
		el.setAttribute('aria-selected', String(on));
		el.setAttribute('data-selected', String(on));
	}
	target?.scrollIntoView({ block: 'nearest' });
}

const select = (target: HTMLElement | undefined) => selectIn(dialog(), target);

let pointing = false;
// cmdk selects the item under the pointer as it moves, and the item a press lands on.
function followPointer(): void {
	if (pointing) return;
	pointing = true;
	document.addEventListener('pointermove', (event) => {
		const item = event.target instanceof Element ? (event.target.closest('[cmdk-item]') as HTMLElement | null) : null;
		if (item && item.getAttribute('aria-disabled') !== 'true' && item.getAttribute('aria-selected') !== 'true') selectIn(item.closest('[cmdk-root], [role=dialog]'), item);
	});
}

/** The palette opening afresh: the query cleared and its first item selected. The dialog around it is the shared Radix Dialog port. */
export function resetPalette(): void {
	const field = input();
	if (field) field.value = '';
	filterCommands('');
	// Radix mounts the list's ScrollArea afresh with the dialog: no scrollbar until the pointer is over it.
	dropScrollbar(dialog()?.querySelector<HTMLElement>('[data-slot=scroll-area]'));
}

/** cmdk's matching, simplified: every typed character in order in the item's value; groups and separators with nothing left are hidden. */
export function filterIn(root: Element | null, query: string): void {
	followPointer();
	const q = query.trim().toLowerCase();
	const matches = (value: string) => {
		let at = 0;
		for (const ch of value.toLowerCase()) if (ch === q[at]) at++;
		return at === q.length;
	};
	for (const el of itemsIn(root)) el.hidden = !!q && !matches(el.dataset.value ?? el.textContent ?? '');
	for (const group of root?.querySelectorAll<HTMLElement>('[data-slot=command-group]') ?? []) group.hidden = !group.querySelector('[cmdk-item]:not([hidden])');
	for (const sep of root?.querySelectorAll<HTMLElement>('[cmdk-separator]') ?? []) sep.hidden = !!q;
	const empty = root?.querySelector<HTMLElement>('[cmdk-empty]');
	if (empty) empty.hidden = visibleIn(root).length > 0;
	selectIn(root, visibleIn(root)[0]);
}

export const filterCommands = (query: string): void => filterIn(dialog(), query);

export function moveIn(root: Element | null, key: string): void {
	const list = visibleIn(root);
	if (!list.length) return;
	const at = list.findIndex((el) => el.getAttribute('aria-selected') === 'true');
	const next = key === 'Home' ? 0 : key === 'End' ? list.length - 1 : key === 'ArrowDown' ? Math.min(at + 1, list.length - 1) : Math.max(at - 1, 0);
	selectIn(root, list[next]);
}

export const moveSelection = (key: string): void => moveIn(dialog(), key);

/** The `data-option` of the selected item in a list, or of the item under a press. */
export function chosenIn(root: Element | null, target?: EventTarget | null): string | undefined {
	const el = target instanceof Element ? (target.closest('[cmdk-item]') as HTMLElement | null) : visibleIn(root).find((item) => item.getAttribute('aria-selected') === 'true');
	if (el && target instanceof Element) selectIn(root, el);
	return el?.dataset.option;
}

/** A list opening afresh: the query cleared and its first item selected. */
export function resetIn(root: Element | null): void {
	const field = root?.querySelector<HTMLInputElement>('[cmdk-input]');
	if (field) field.value = '';
	filterIn(root, '');
}

/** What the selected item, or the item under a press, does: go to a page, or set the theme. */
export function chosenCommand(target?: EventTarget | null): { url?: string; theme?: 'light' | 'dark' | 'system' } | undefined {
	const el = target instanceof Element ? (target.closest('[cmdk-item]') as HTMLElement | null) : visible().find((item) => item.getAttribute('aria-selected') === 'true');
	if (!el) return undefined;
	return { ...(el.dataset.url ? { url: el.dataset.url } : {}), ...(el.dataset.theme ? { theme: el.dataset.theme as 'light' | 'dark' | 'system' } : {}) };
}
