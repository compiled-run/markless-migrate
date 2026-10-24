import { itemsOf, textOf } from './collection.ts';
import { keyboardModality, setModality } from './interactions.ts';

// React Aria's Autocomplete over a Menu or ListBox in the page (useAutocomplete with the `contains` filter its callers
// pass): typing in the input shows the items whose text contains it (accents and case ignored) and hides the sections
// left empty, and the search field says whether it is empty (data-empty); focus stays in the input while ArrowDown and
// ArrowUp move the collection's virtual focus (aria-activedescendant, data-focused), and hovering an item focuses it.
const INPUT = 'input[data-rac][aria-controls]:not([role="combobox"])';

const collectionOf = (input: Element) => {
	const el = document.getElementById(input.getAttribute('aria-controls') ?? '');
	return el?.matches('[role="menu"][data-rac], [role="listbox"][data-rac]') ? el : null;
};
const inputFor = (collection: Element) => (collection.id ? document.querySelector<HTMLInputElement>(`${INPUT}[aria-controls="${CSS.escape(collection.id)}"]`) : null);

const collator = new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' });
function contains(text: string, query: string): boolean {
	if (!query) return true;
	for (let i = 0; i + query.length <= text.length; i++) if (collator.compare(text.slice(i, i + query.length), query) === 0) return true;
	return false;
}

const shown = (collection: Element) => itemsOf(collection).filter((i) => !i.hidden);
const focusedOf = (collection: Element) => itemsOf(collection, true).find((i) => i.hasAttribute('data-focused'));

function focusItem(input: HTMLInputElement, collection: Element, item: HTMLElement | undefined): void {
	for (const el of itemsOf(collection, true)) {
		el.removeAttribute('data-focused');
		el.removeAttribute('data-focus-visible');
	}
	if (!item) {
		input.removeAttribute('aria-activedescendant');
		return;
	}
	item.setAttribute('data-focused', 'true');
	if (keyboardModality()) item.setAttribute('data-focus-visible', 'true');
	if (item.id) input.setAttribute('aria-activedescendant', item.id);
	item.scrollIntoView({ block: 'nearest' });
}

export function input(target: Element): boolean {
	if (!target.matches(INPUT)) return false;
	const collection = collectionOf(target);
	if (!collection) return false;
	const field = target as HTMLInputElement;
	const query = field.value;
	for (const item of itemsOf(collection, true)) item.hidden = !contains(textOf(item), query);
	for (const section of collection.querySelectorAll<HTMLElement>('[role="group"], section')) section.hidden = !section.querySelector('[role^="menuitem"]:not([hidden]), [role="option"]:not([hidden])');
	for (const sep of collection.querySelectorAll<HTMLElement>('[role="separator"]')) sep.hidden = query !== '';
	// The collection's empty state (renderEmptyState) and data-empty once nothing matches.
	const empty = collection.querySelector<HTMLElement>(':scope > [data-mm-empty]');
	if (empty) {
		const none = shown(collection).length === 0;
		empty.hidden = !none;
		if (none) collection.setAttribute('data-empty', 'true');
		else collection.removeAttribute('data-empty');
	}
	// SearchField's data-empty, on the field around the input.
	const wrapper = field.parentElement?.closest<HTMLElement>('[data-rac][data-empty], [data-rac]:has(> * > input[type="search"])') ?? null;
	if (wrapper) {
		if (query === '') wrapper.setAttribute('data-empty', 'true');
		else wrapper.removeAttribute('data-empty');
	}
	// useAutocomplete focuses the first item that matches what was typed (disableAutoFocusFirst is not set).
	focusItem(field, collection, query ? shown(collection)[0] : undefined);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (!target.matches(INPUT) || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter')) return false;
	const collection = collectionOf(target);
	if (!collection) return false;
	const field = target as HTMLInputElement;
	const list = shown(collection);
	const current = focusedOf(collection);
	if (event.key === 'Enter') {
		if (!current) return false;
		event.preventDefault();
		current.click();
		return true;
	}
	event.preventDefault();
	setModality('keyboard');
	const at = current ? list.indexOf(current) : -1;
	const to = event.key === 'ArrowDown' ? list[at + 1] ?? list[0] : at <= 0 ? list[list.length - 1] : list[at - 1];
	focusItem(field, collection, to);
	return true;
}

export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>('[role^="menuitem"], [role="option"]');
	const collection = item?.closest('[role="menu"][data-rac], [role="listbox"][data-rac]');
	const field = collection && inputFor(collection);
	if (!item || !collection || !field) return false;
	focusItem(field, collection, item);
	return true;
}
