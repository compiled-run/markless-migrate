// React Aria's selectable collection (useSelectableCollection, ListKeyboardDelegate, useTypeSelect) over the items a
// ListBox or Menu renders: one focused item holding the tab stop, arrows, Home/End and PageUp/PageDown moving focus
// without wrapping, and typeahead finding the next item whose text starts with what was typed in the last second.

const ITEM = '[role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const disabled = (el: Element) => el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled');

/** The collection's items in order; `all` keeps the disabled ones. */
export function itemsOf(collection: Element, all = false): HTMLElement[] {
	return [...collection.querySelectorAll<HTMLElement>(ITEM)].filter((el) => el.closest('[role="listbox"], [role="menu"]') === collection && (all || !disabled(el)));
}

export const textOf = (item: Element) => (item.getAttribute('data-text-value') ?? item.textContent ?? '').trim();

/** Moves focus to an item, which takes the collection's tab stop. */
export function focusItem(collection: Element, item: HTMLElement | undefined): void {
	if (!item) return;
	for (const el of itemsOf(collection, true)) el.setAttribute('tabindex', el === item ? '0' : '-1');
	item.focus({ preventScroll: true });
	scrollIntoView(collection as HTMLElement, item);
}

// scrollIntoView with the collection as the scroll container: the item is brought fully into view, nothing else scrolls.
function scrollIntoView(collection: HTMLElement, item: HTMLElement): void {
	let scroller: HTMLElement | null = collection;
	while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
	if (!scroller || scroller === document.body || scroller === document.documentElement) return;
	const s = scroller.getBoundingClientRect();
	const r = item.getBoundingClientRect();
	if (r.top < s.top) scroller.scrollTop -= s.top - r.top;
	else if (r.bottom > s.bottom) scroller.scrollTop += r.bottom - s.bottom;
}

const search = new WeakMap<Element, { text: string; timer: ReturnType<typeof setTimeout> | undefined }>();
const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' }) : undefined;
const starts = (text: string, prefix: string) => (collator ? collator.compare(text.slice(0, prefix.length), prefix) === 0 : text.toLowerCase().startsWith(prefix.toLowerCase()));

/** useTypeSelect: the item a typed character leads to, from the focused one on, then from the start. */
export function typeahead(collection: Element, key: string, from: HTMLElement | undefined): HTMLElement | undefined {
	if (key.length !== 1 || !/\S| /.test(key)) return undefined;
	const state = search.get(collection) ?? { text: '', timer: undefined };
	if (key === ' ' && !state.text) return undefined;
	state.text += key;
	clearTimeout(state.timer);
	state.timer = setTimeout(() => (state.text = ''), 1000);
	search.set(collection, state);
	const list = itemsOf(collection);
	const at = from ? list.indexOf(from) : 0;
	return list.slice(Math.max(0, at)).find((el) => starts(textOf(el), state.text)) ?? list.find((el) => starts(textOf(el), state.text));
}

/** Whether a typeahead is in progress, so that Space types instead of choosing. */
export const typing = (collection: Element) => (search.get(collection)?.text ?? '') !== '';

// ListKeyboardDelegate's getKeyPageBelow / getKeyPageAbove over DOMLayoutDelegate's rects: in a collection that cannot
// scroll, the last or first item; otherwise the first item at least a visible height beyond the focused one.
function scrollable(el: Element): boolean {
	const cs = getComputedStyle(el);
	return /(auto|scroll)/.test(cs.overflow + cs.overflowX + cs.overflowY);
}
function page(collection: HTMLElement, from: HTMLElement, down: boolean): HTMLElement | undefined {
	const list = itemsOf(collection);
	if (!scrollable(collection)) return down ? list[list.length - 1] : list[0];
	const box = collection.getBoundingClientRect();
	const rect = (el: HTMLElement) => {
		const r = el.getBoundingClientRect();
		return { y: r.top - box.top + collection.scrollTop, height: r.height };
	};
	let at = list.indexOf(from);
	let r = rect(from);
	if (down) {
		const pageY = Math.min(collection.scrollHeight, r.y - r.height + collection.clientHeight);
		while (at >= 0 && at < list.length && r.y < pageY) {
			at++;
			if (at < list.length) r = rect(list[at]!);
		}
		return list[at] ?? list[list.length - 1];
	}
	const pageY = Math.max(0, r.y + r.height - collection.clientHeight);
	while (at >= 0 && r.y > pageY) {
		at--;
		if (at >= 0) r = rect(list[at]!);
	}
	return list[at] ?? list[0];
}

/** The item a navigation key moves focus to, or undefined when the key is not one. */
export function navigate(collection: HTMLElement, event: KeyboardEvent, from: HTMLElement | undefined, orientation: 'vertical' | 'horizontal' = 'vertical'): HTMLElement | undefined | null {
	const list = itemsOf(collection);
	if (!list.length) return null;
	const at = from ? list.indexOf(from) : -1;
	const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
	const prev = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
	switch (event.key) {
		case next:
			return at < 0 ? list[0] : (list[at + 1] ?? list[at]);
		case prev:
			return at < 0 ? list[list.length - 1] : (list[at - 1] ?? list[at]);
		case 'Home':
			return list[0];
		case 'End':
			return list[list.length - 1];
		case 'PageDown':
			return from ? page(collection, from, true) : list[0];
		case 'PageUp':
			return from ? page(collection, from, false) : list[0];
		default:
			return undefined;
	}
}
