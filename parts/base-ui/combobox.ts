import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';

// Base UI Combobox: a press on the input or its trigger button opens the list; typing opens it and shows the items
// whose text contains what was typed (the others hidden, where Base UI unmounts them); arrows move data-highlighted
// with aria-activedescendant on the input; choosing an item (click, Enter) writes its text into the input, marks it
// selected and closes; Escape and a press outside close. The popup variant's trigger is a button opening a dialog that
// holds the search input: choosing writes the item's text into the button instead.
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
	if (list) list.hidden = items(p).length === 0;
	highlight(p, undefined);
}

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
	for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) {
		const on = o === option;
		o.setAttribute('aria-selected', String(on));
		if (on) o.setAttribute('data-selected', '');
		else o.removeAttribute('data-selected');
	}
	const text = (option.textContent ?? '').trim();
	if (p.trigger.matches(BOX)) {
		const node = [...p.trigger.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
		if (node) (node as Text).data = text;
		close(p);
		return;
	}
	const input = p.trigger as HTMLInputElement;
	input.value = text;
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
