// Parity port of cmdk inside a Radix Dialog, as command-menu.tsx uses it: the DOM half. The palette's markup is
// rendered once by the shell; these functions show it modally, filter and select its items, and say what the
// chosen item does. The open/closed state stays in the shell, which writes it in its own handlers.
import { hideOthers, showOthers } from '../radix-ui-react-dropdown-menu/behaviour.ts';

const KEY = 'command-palette';
let opener: HTMLElement | null = null;

const dialog = () => document.getElementById(KEY);
const input = () => document.getElementById(`${KEY}-input`) as HTMLInputElement | null;
const items = () => [...(dialog()?.querySelectorAll<HTMLElement>('[cmdk-item]') ?? [])];
const visible = () => items().filter((el) => !el.hidden);

function select(target: HTMLElement | undefined): void {
	for (const el of items()) {
		const on = el === target;
		el.setAttribute('aria-selected', String(on));
		el.setAttribute('data-selected', String(on));
	}
	target?.scrollIntoView({ block: 'nearest' });
}

export function openPalette(): void {
	const el = dialog();
	if (!el) return;
	opener = document.activeElement as HTMLElement | null;
	el.hidden = false;
	if (el.previousElementSibling instanceof HTMLElement) el.previousElementSibling.hidden = false;
	hideOthers(KEY, el);
	document.body.style.pointerEvents = 'none';
	filterCommands('');
	const field = input();
	if (field) {
		field.value = '';
		field.focus();
	}
}

export function closePalette(): void {
	showOthers(KEY);
	document.body.style.pointerEvents = '';
	opener?.focus();
	opener = null;
}

/** cmdk's matching, simplified: every typed character in order in the item's value; groups and separators with nothing left are hidden. */
export function filterCommands(query: string): void {
	const q = query.trim().toLowerCase();
	const matches = (value: string) => {
		let at = 0;
		for (const ch of value.toLowerCase()) if (ch === q[at]) at++;
		return at === q.length;
	};
	for (const el of items()) el.hidden = !!q && !matches(el.dataset.value ?? el.textContent ?? '');
	for (const group of dialog()?.querySelectorAll<HTMLElement>('[data-slot=command-group]') ?? []) group.hidden = !group.querySelector('[cmdk-item]:not([hidden])');
	for (const sep of dialog()?.querySelectorAll<HTMLElement>('[cmdk-separator]') ?? []) sep.hidden = !!q;
	const empty = dialog()?.querySelector<HTMLElement>('[cmdk-empty]');
	if (empty) empty.hidden = visible().length > 0;
	select(visible()[0]);
}

export function moveSelection(key: string): void {
	const list = visible();
	if (!list.length) return;
	const at = list.findIndex((el) => el.getAttribute('aria-selected') === 'true');
	const next = key === 'Home' ? 0 : key === 'End' ? list.length - 1 : key === 'ArrowDown' ? Math.min(at + 1, list.length - 1) : Math.max(at - 1, 0);
	select(list[next]);
}

/** What the selected item, or the item under a press, does: go to a page, or set the theme. */
export function chosenCommand(target?: EventTarget | null): { url?: string; theme?: 'light' | 'dark' | 'system' } | undefined {
	const el = target instanceof Element ? (target.closest('[cmdk-item]') as HTMLElement | null) : visible().find((item) => item.getAttribute('aria-selected') === 'true');
	if (!el) return undefined;
	return { ...(el.dataset.url ? { url: el.dataset.url } : {}), ...(el.dataset.theme ? { theme: el.dataset.theme as 'light' | 'dark' | 'system' } : {}) };
}
