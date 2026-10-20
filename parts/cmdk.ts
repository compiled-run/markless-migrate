import { CHOICES } from './choices.ts';
import { navigate } from '@markless/router';

// cmdk 1.1: typing in [cmdk-input] scores every [cmdk-item] by its value and keywords; an item scoring 0 leaves the list (hidden here),
// a group with none left is hidden, and [cmdk-empty] shows when nothing is left; the first item left is selected
// (aria-selected, data-selected). Arrows, Home, End move the selection; moving the pointer over an item selects it;
// Enter or a click chooses it. What choosing does is the old page's (captured: where it went or what it copied).

export type Filter = (value: string, search: string, keywords: readonly string[]) => number;

let filter: Filter = (value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0);
let keywordsOf: (item: HTMLElement) => readonly string[] = () => [];
let onChoose: (item: HTMLElement) => void = () => {};

/** The site's own Command props: its filter, each item's keywords, and what runs before an item's action (runCommand closing the dialog). */
export function configure(options: { readonly filter?: Filter; readonly keywords?: (item: HTMLElement) => readonly string[]; readonly beforeChoose?: (item: HTMLElement) => void }): void {
	if (options.filter) filter = options.filter;
	if (options.keywords) keywordsOf = options.keywords;
	if (options.beforeChoose) onChoose = options.beforeChoose;
}


const rootOf = (el: Element) => el.closest<HTMLElement>('[cmdk-root]');
const items = (root: Element) => [...root.querySelectorAll<HTMLElement>('[cmdk-item]')].filter((i) => !i.hidden && i.getAttribute('aria-disabled') !== 'true');

function select(root: Element, item: HTMLElement | undefined): void {
	for (const i of root.querySelectorAll('[cmdk-item][aria-selected="true"]')) {
		i.setAttribute('aria-selected', 'false');
		i.setAttribute('data-selected', 'false');
	}
	if (!item) return;
	item.setAttribute('aria-selected', 'true');
	item.setAttribute('data-selected', 'true');
	if (item.parentElement?.firstElementChild === item) item.closest('[cmdk-group]')?.querySelector('[cmdk-group-heading]')?.scrollIntoView({ block: 'nearest' });
	item.scrollIntoView({ block: 'nearest' });
}

function search(root: HTMLElement, text: string): void {
	// cmdk unmounts an item that scores 0; here it is hidden, which takes it out of the list and the accessibility tree alike.
	const list = root.querySelector('[cmdk-list]') ?? root;
	let count = 0;
	for (const item of list.querySelectorAll<HTMLElement>('[cmdk-item]')) {
		const keep = !text || filter(item.getAttribute('data-value') ?? '', text, keywordsOf(item)) > 0;
		item.hidden = !keep;
		if (keep) count++;
	}
	for (const group of list.querySelectorAll<HTMLElement>('[cmdk-group]')) {
		const any = group.querySelector('[cmdk-item]:not([hidden])');
		if (any) group.removeAttribute('hidden');
		else group.setAttribute('hidden', '');
	}
	const empty = root.querySelector<HTMLElement>('[cmdk-empty]');
	if (empty) empty.hidden = count > 0;
	select(root, items(root)[0]);
}

function choose(item: HTMLElement): void {
	const root = rootOf(item);
	if (root) select(root, item);
	const key = item.getAttribute('data-value') ?? (item.textContent ?? '').trim();
	const choice = Object.values(CHOICES).find((c) => key in c)?.[key];
	onChoose(item);
	if (choice?.copied !== undefined) void navigator.clipboard?.writeText(choice.copied).catch(() => {});
	else if (choice?.href) void navigate(choice.href);
}

export function input(target: Element): boolean {
	if (!(target instanceof HTMLInputElement) || !target.hasAttribute('cmdk-input')) return false;
	const root = rootOf(target);
	if (root) search(root, target.value);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const root = rootOf(target);
	if (!root || event.isComposing) return false;
	const list = items(root);
	const at = list.findIndex((i) => i.getAttribute('aria-selected') === 'true');
	let to: HTMLElement | undefined;
	if (event.key === 'ArrowDown' || (event.ctrlKey && (event.key === 'n' || event.key === 'j'))) to = event.metaKey ? list[list.length - 1] : list[at + 1];
	else if (event.key === 'ArrowUp' || (event.ctrlKey && (event.key === 'p' || event.key === 'k'))) to = event.metaKey ? list[0] : list[at - 1];
	else if (event.key === 'Home') to = list[0];
	else if (event.key === 'End') to = list[list.length - 1];
	else if (event.key === 'Enter') {
		event.preventDefault();
		if (list[at]) choose(list[at]!);
		return true;
	} else return false;
	event.preventDefault();
	if (to) select(root, to);
	return true;
}

export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>('[cmdk-item]');
	const root = item && rootOf(item);
	if (!item || !root || item.getAttribute('aria-disabled') === 'true') return false;
	select(root, item);
	return true;
}

export function click(target: Element): boolean {
	const item = target.closest<HTMLElement>('[cmdk-item]');
	if (!item || item.getAttribute('aria-disabled') === 'true') return false;
	choose(item);
	return true;
}
