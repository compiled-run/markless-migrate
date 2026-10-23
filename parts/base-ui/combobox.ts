import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { layersFor } from '../reveal.ts';

// Base UI Combobox: a press on the input or its trigger button opens the list; typing opens it and shows the items
// whose text contains what was typed (the others hidden, where Base UI unmounts them); arrows move data-highlighted
// with aria-activedescendant on the input; choosing an item (click, Enter) writes its text into the input, marks it
// selected and closes; Escape and a press outside close. The popup variant's trigger is a button opening a dialog that
// holds the search input: choosing writes the item's text into the button instead. Nothing matching marks the popup
// data-empty (shadcn shows the empty message off it). With several values (aria-multiselectable) choosing toggles the item
// and its chip and keeps the list open; a chip's remove button and the clear button take values away. The converter
// renders every item's indicator and chip hidden (data-mm-indicator, data-mm-chip), so these only switch `hidden`.
const INPUT = 'input[role="combobox"][aria-haspopup="listbox"]:not([cmdk-input])';
const BUTTON = '[data-slot="input-group-button"][aria-haspopup="listbox"]';
const OPTION = '[role="option"]';
const BOX = '[data-slot="combobox-trigger"][aria-haspopup="dialog"]';

const inputOf = (el: Element) => (el.matches(INPUT) ? (el as HTMLInputElement) : (el.closest('[data-slot="input-group"]')?.querySelector<HTMLInputElement>(INPUT) ?? null));
const inBox = (input: HTMLElement) => {
	const outer = popupOf(input);
	return outer?.trigger.matches(BOX) ? outer : undefined;
};
const popupFor = (input: HTMLElement) => inBox(input) ?? [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === input);
const ours = (p: Popup) => p.trigger.matches(INPUT) || p.trigger.matches(BOX);
const inputIn = (p: Popup) => (p.trigger.matches(BOX) ? p.popup.querySelector<HTMLInputElement>(INPUT) : (p.trigger as HTMLInputElement));
const items = (p: Popup) => [...p.popup.querySelectorAll<HTMLElement>(OPTION)].filter((o) => !o.hidden && !o.hasAttribute('data-disabled'));

function highlight(p: Popup, option: HTMLElement | undefined): void {
	for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) o.removeAttribute('data-highlighted');
	if (!option) {
		inputIn(p)?.removeAttribute('aria-activedescendant');
		return;
	}
	option.setAttribute('data-highlighted', '');
	if (option.id) inputIn(p)?.setAttribute('aria-activedescendant', option.id);
	option.scrollIntoView({ block: 'nearest' });
}

function filter(p: Popup, query: string): void {
	const q = query.trim().toLowerCase();
	for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) o.hidden = q !== '' && !(o.textContent ?? '').toLowerCase().includes(q);
	const list = p.popup.querySelector<HTMLElement>('[role="listbox"]');
	const empty = items(p).length === 0;
	if (list) list.hidden = empty;
	p.popup.toggleAttribute('data-empty', empty);
	highlight(p, undefined);
}

const multiple = (root: ParentNode) => root.querySelector('[role="listbox"]')?.getAttribute('aria-multiselectable') === 'true';
const textOf = (option: Element) => [...option.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim() || (option.textContent ?? '').trim();

function mark(option: HTMLElement, on: boolean): void {
	option.setAttribute('aria-selected', String(on));
	option.toggleAttribute('data-selected', on);
	const indicator = option.querySelector<HTMLElement>(':scope > [data-mm-indicator]');
	if (indicator) {
		indicator.hidden = !on;
		indicator.toggleAttribute('data-selected', on);
	}
}

// The options of the list an input opens, open or not.
const optionsOf = (input: HTMLElement) => layersFor(input.id).flatMap((n) => [...n.querySelectorAll<HTMLElement>(OPTION)]);
const chipsOf = (input: HTMLElement) => [...(input.closest('[data-slot="combobox-chips"]')?.querySelectorAll<HTMLElement>('[data-mm-chip]') ?? [])];

function openBox(button: HTMLElement): void {
	const p = openPopup(button, { popupSelector: '[data-slot="combobox-content"]', onDismiss: (x) => close(x) });
	if (!p) return;
	button.setAttribute('aria-controls', p.popup.id);
	button.setAttribute('data-popup-side', p.popup.getAttribute('data-side') ?? 'bottom');
	const input = inputIn(p);
	if (input) {
		input.value = '';
		input.setAttribute('aria-expanded', 'true');
		const list = p.popup.querySelector<HTMLElement>('[role="listbox"]');
		if (list?.id) input.setAttribute('aria-controls', list.id);
		input.focus({ preventScroll: true });
	}
	filter(p, '');
}

function open(input: HTMLInputElement): Popup | undefined {
	const existing = popupFor(input);
	if (existing) return existing;
	const p = openPopup(input, { popupSelector: '[data-slot="combobox-content"], [role="listbox"]', onDismiss: (x) => close(x) });
	if (!p) return undefined;
	const list = p.popup.querySelector<HTMLElement>('[role="listbox"]') ?? p.popup;
	if (list.id) input.setAttribute('aria-controls', list.id);
	input.setAttribute('data-popup-side', p.popup.getAttribute('data-side') ?? 'bottom');
	for (const b of input.closest('[data-slot="input-group"]')?.querySelectorAll<HTMLElement>(BUTTON) ?? []) b.setAttribute('aria-expanded', 'true');
	filter(p, '');
	return p;
}

function close(p: Popup): void {
	if (p.trigger.matches(BOX)) {
		p.trigger.removeAttribute('aria-controls');
		p.trigger.removeAttribute('data-popup-side');
		inputIn(p)?.removeAttribute('aria-activedescendant');
		closePopup(p, true);
		return;
	}
	const input = p.trigger;
	input.removeAttribute('aria-controls');
	input.removeAttribute('aria-activedescendant');
	input.removeAttribute('data-popup-side');
	for (const b of input.closest('[data-slot="input-group"]')?.querySelectorAll<HTMLElement>(BUTTON) ?? []) b.setAttribute('aria-expanded', 'false');
	closePopup(p, false);
}

function choose(p: Popup, option: HTMLElement): void {
	const text = textOf(option);
	if (multiple(p.popup) && !p.trigger.matches(BOX)) {
		const on = option.getAttribute('aria-selected') !== 'true';
		mark(option, on);
		const input = p.trigger as HTMLInputElement;
		for (const chip of chipsOf(input)) if (chip.dataset.mmChip === text) chip.hidden = !on;
		input.value = '';
		filter(p, '');
		input.focus({ preventScroll: true });
		return;
	}
	for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) mark(o, o === option);
	if (p.trigger.matches(BOX)) {
		const node = [...p.trigger.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
		if (node) (node as Text).data = text;
		close(p);
		return;
	}
	const input = p.trigger as HTMLInputElement;
	input.value = text;
	const group = input.closest('[data-slot="input-group"]');
	for (const c of group?.querySelectorAll<HTMLElement>('[data-slot="combobox-clear"]') ?? []) c.hidden = false;
	for (const b of group?.querySelectorAll<HTMLElement>(BUTTON) ?? []) b.removeAttribute('data-placeholder');
	close(p);
	input.focus({ preventScroll: true });
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	if (event.button !== 0) return false;
	const box = target.closest<HTMLElement>(BOX);
	if (box) {
		const p = [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === box);
		if (p) close(p);
		else openBox(box);
		event.preventDefault();
		return true;
	}
	const opener = target.closest(`${INPUT}, ${BUTTON}`);
	const input = opener && inputOf(opener);
	if (!input) return false;
	if (inBox(input)) return true;
	const p = popupFor(input);
	if (p && opener!.matches(BUTTON)) close(p);
	else open(input);
	if (opener!.matches(BUTTON)) {
		event.preventDefault();
		input.focus({ preventScroll: true });
	}
	return true;
}

export function click(target: Element): boolean {
	const remove = target.closest<HTMLElement>('[data-slot="combobox-chip-remove"]');
	const chip = remove?.closest<HTMLElement>('[data-mm-chip]');
	const chipsInput = chip?.closest('[data-slot="combobox-chips"]')?.querySelector<HTMLInputElement>(INPUT);
	if (chip && chipsInput) {
		chip.hidden = true;
		for (const o of optionsOf(chipsInput)) if (textOf(o) === chip.dataset.mmChip) mark(o, false);
		chipsInput.focus({ preventScroll: true });
		return true;
	}
	const clear = target.closest<HTMLElement>('[data-slot="combobox-clear"]');
	const cleared = clear && inputOf(clear);
	if (clear && cleared) {
		cleared.value = '';
		for (const o of optionsOf(cleared)) mark(o, false);
		clear.hidden = true;
		for (const b of cleared.closest('[data-slot="input-group"]')?.querySelectorAll<HTMLElement>(BUTTON) ?? []) b.setAttribute('data-placeholder', '');
		cleared.focus({ preventScroll: true });
		return true;
	}
	const option = target.closest<HTMLElement>(OPTION);
	const p = option && popupOf(option);
	if (!option || !p || !ours(p)) return Boolean(target.closest(BOX) || (target.closest(`${INPUT}, ${BUTTON}`) && inputOf(target.closest(`${INPUT}, ${BUTTON}`)!)));
	choose(p, option);
	return true;
}

export function pointerover(target: Element): boolean {
	const option = target.closest<HTMLElement>(OPTION);
	const p = option && popupOf(option);
	if (!option || !p || !ours(p)) return false;
	highlight(p, option);
	return true;
}

export function input(target: Element): boolean {
	const el = target.closest<HTMLInputElement>(INPUT);
	if (!el) return false;
	const p = open(el);
	if (p) filter(p, el.value);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const el = target.closest<HTMLInputElement>(INPUT);
	if (!el) return false;
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		const p = open(el);
		if (!p) return false;
		event.preventDefault();
		const list = items(p);
		const current = list.findIndex((o) => o.hasAttribute('data-highlighted'));
		highlight(p, event.key === 'ArrowDown' ? list[Math.min(list.length - 1, current + 1)] : list[Math.max(0, current < 0 ? list.length - 1 : current - 1)]);
		return true;
	}
	const p = popupFor(el);
	if (!p) return false;
	if (event.key === 'Enter') {
		const at = items(p).find((o) => o.hasAttribute('data-highlighted'));
		if (at) {
			event.preventDefault();
			choose(p, at);
		}
		return true;
	}
	if (event.key === 'Home' || event.key === 'End') return false;
	return false;
}
