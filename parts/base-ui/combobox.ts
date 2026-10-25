import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { layersFor } from '../reveal.ts';

// Base UI Combobox: a press on the input or its trigger button opens the list (the button toggles it, from the keyboard
// too); typing opens it and shows the items whose label contains what was typed (the others hidden, where Base UI
// unmounts them); arrows move data-highlighted with aria-activedescendant on the input, past either end to no item;
// opening highlights the selected item; choosing an item (click, Enter) writes its label into the input and the hidden
// form input, marks it selected and closes; Escape and a press outside close, and Escape on a closed one clears it. The
// popup variant's trigger is a button opening a dialog that holds the search input: choosing writes the item's label
// into the button instead. Nothing matching marks the popup data-empty (shadcn shows the empty message off it). With
// several values (aria-multiselectable) choosing toggles the item and its chip and keeps the list open; a chip's remove
// button and the clear button take values away. The converter renders every item's indicator and chip hidden
// (data-mm-indicator, data-mm-chip), so these only switch `hidden`.
const INPUT = 'input[role="combobox"][aria-haspopup="listbox"]:not([cmdk-input])';
const BUTTON = '[data-slot="input-group-button"][aria-haspopup="listbox"]';
const OPTION = '[role="option"]';
const BOX = '[data-slot="combobox-trigger"][aria-haspopup="dialog"]';
const HIDDEN_INPUT = 'input[aria-hidden="true"][tabindex="-1"]:not([role])';

const groupOf = (input: HTMLElement) => input.closest('[data-slot="input-group"]');
const buttonsOf = (input: HTMLElement) => [...(groupOf(input)?.querySelectorAll<HTMLElement>(BUTTON) ?? [])];
const inputOf = (el: Element) => (el.matches(INPUT) ? (el as HTMLInputElement) : (el.closest('[data-slot="input-group"]')?.querySelector<HTMLInputElement>(INPUT) ?? null));
const inBox = (input: HTMLElement) => {
	const outer = popupOf(input);
	return outer?.trigger.matches(BOX) ? outer : undefined;
};
const openFor = (trigger: HTMLElement) => [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);
const popupFor = (input: HTMLElement) => inBox(input) ?? openFor(input);
const ours = (p: Popup) => p.trigger.matches(INPUT) || p.trigger.matches(BOX);
const inputIn = (p: Popup) => (p.trigger.matches(BOX) ? p.popup.querySelector<HTMLInputElement>(INPUT) : (p.trigger as HTMLInputElement));
const items = (p: Popup) => [...p.popup.querySelectorAll<HTMLElement>(OPTION)].filter((o) => !o.hidden && !o.hasAttribute('data-disabled'));
const multiple = (root: ParentNode) => root.querySelector('[role="listbox"]')?.getAttribute('aria-multiselectable') === 'true';

// Base UI writes an item's label (itemToStringLabel), not its whole text: the label is the item's first text.
function textOf(option: Element): string {
	const own = [...option.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
	if (own) return own;
	const walker = document.createTreeWalker(option, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent!.trim()) return n.textContent!.trim();
	return '';
}

// The hidden input AriaCombobox renders after the root's parts, holding the serialized value a form submits.
function hiddenInputOf(control: HTMLElement): HTMLInputElement | null {
	for (let el: Element = control; el.parentElement && el !== document.body; el = el.parentElement) {
		for (let s = el.nextElementSibling; s; s = s.nextElementSibling) if (s.matches(HIDDEN_INPUT)) return s as HTMLInputElement;
		// Past the root: the next level holds another combobox.
		if ([...el.parentElement.querySelectorAll(`${INPUT}, ${BOX}`)].some((c) => !el.contains(c))) return null;
	}
	return null;
}
const setValue = (control: HTMLElement, value: string) => {
	const hidden = hiddenInputOf(control);
	if (hidden) hidden.value = value;
};

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
	for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) o.hidden = q !== '' && !textOf(o).toLowerCase().includes(q);
	const list = p.popup.querySelector<HTMLElement>('[role="listbox"]');
	const empty = items(p).length === 0;
	if (list) list.hidden = empty;
	p.popup.toggleAttribute('data-empty', empty);
	highlight(p, undefined);
}

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

// The order values were chosen in: with several, the last chosen is the one opening highlights (syncSelectedIndex).
const chosen = new WeakMap<HTMLElement, string[]>();
function chosenOf(input: HTMLElement, p: Popup): string[] {
	let list = chosen.get(input);
	if (!list) chosen.set(input, (list = [...p.popup.querySelectorAll<HTMLElement>(OPTION)].filter((o) => o.getAttribute('aria-selected') === 'true').map(textOf)));
	return list;
}
function selectedIn(p: Popup): HTMLElement | undefined {
	const options = [...p.popup.querySelectorAll<HTMLElement>(OPTION)].filter((o) => o.getAttribute('aria-selected') === 'true');
	if (!multiple(p.popup) || p.trigger.matches(BOX)) return options[0];
	const last = chosenOf(p.trigger, p).at(-1);
	return options.find((o) => textOf(o) === last);
}

// Base UI's Combobox.Input and Combobox.Trigger both carry data-pressed while the popup is open (pressableTriggerOpenStateMapping).
function press(input: HTMLElement, on: boolean): void {
	input.toggleAttribute('data-pressed', on);
	for (const b of buttonsOf(input)) {
		b.setAttribute('aria-expanded', String(on));
		b.toggleAttribute('data-popup-open', on);
		b.toggleAttribute('data-pressed', on);
	}
}

function openBox(button: HTMLElement): void {
	const p = openPopup(button, { popupSelector: '[data-slot="combobox-content"]', onDismiss: (x) => close(x) });
	if (!p) return;
	button.setAttribute('aria-controls', p.popup.id);
	button.setAttribute('data-popup-side', p.popup.getAttribute('data-side') ?? 'bottom');
	button.setAttribute('data-pressed', '');
	const input = inputIn(p);
	if (input) {
		input.value = '';
		input.setAttribute('aria-expanded', 'true');
		const list = p.popup.querySelector<HTMLElement>('[role="listbox"]');
		if (list?.id) input.setAttribute('aria-controls', list.id);
		input.focus({ preventScroll: true });
	}
	filter(p, '');
	highlight(p, selectedIn(p));
}

// `typed`: opened by typing, which leaves no item highlighted.
function open(input: HTMLInputElement, typed = false): Popup | undefined {
	const existing = popupFor(input);
	if (existing) return existing;
	const p = openPopup(input, { popupSelector: '[data-slot="combobox-content"], [role="listbox"]', outsidePress: false, onDismiss: (x) => close(x) });
	if (!p) return undefined;
	const list = p.popup.querySelector<HTMLElement>('[role="listbox"]') ?? p.popup;
	if (list.id) input.setAttribute('aria-controls', list.id);
	input.setAttribute('data-popup-side', p.popup.getAttribute('data-side') ?? 'bottom');
	press(input, true);
	// Base UI hides the input's addons from assistive technology while the list is open (its trigger is the input's).
	for (const a of groupOf(input)?.querySelectorAll<HTMLElement>('[data-slot="input-group-addon"]') ?? []) a.setAttribute('aria-hidden', 'true');
	// The input and its trigger button are the popup's references: a press on either is not one outside it.
	const onDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (!target || p.popup.contains(target) || input.contains(target) || buttonsOf(input).some((b) => b.contains(target))) return;
		close(p);
	};
	const timer = setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
	p.cleanup.push(() => {
		clearTimeout(timer);
		document.removeEventListener('pointerdown', onDown, true);
	});
	filter(p, '');
	if (!typed) highlight(p, selectedIn(p));
	return p;
}

function close(p: Popup): void {
	highlight(p, undefined);
	if (p.trigger.matches(BOX)) {
		p.trigger.removeAttribute('aria-controls');
		p.trigger.removeAttribute('data-popup-side');
		p.trigger.removeAttribute('data-pressed');
		inputIn(p)?.removeAttribute('aria-activedescendant');
		closePopup(p, true);
		return;
	}
	const input = p.trigger as HTMLInputElement;
	input.removeAttribute('aria-controls');
	input.removeAttribute('aria-activedescendant');
	input.removeAttribute('data-popup-side');
	press(input, false);
	for (const a of groupOf(input)?.querySelectorAll<HTMLElement>('[data-slot="input-group-addon"]') ?? []) a.removeAttribute('aria-hidden');
	// With one value the input shows the selected item's label again once closed (handleUnmount); with several it empties.
	const selected = [...p.popup.querySelectorAll<HTMLElement>(OPTION)].find((o) => o.getAttribute('aria-selected') === 'true');
	input.value = multiple(p.popup) ? '' : selected ? textOf(selected) : '';
	closePopup(p, false);
}

// Clearing (Combobox.Clear, Escape on a closed input, emptying the input): no value, no chip, the placeholder back.
function clear(input: HTMLInputElement): void {
	input.value = '';
	for (const o of optionsOf(input)) mark(o, false);
	for (const chip of chipsOf(input)) chip.hidden = true;
	chosen.set(input, []);
	for (const c of groupOf(input)?.querySelectorAll<HTMLElement>('[data-slot="combobox-clear"]') ?? []) c.hidden = true;
	for (const b of buttonsOf(input)) b.setAttribute('data-placeholder', '');
	setValue(input, '');
}

function choose(p: Popup, option: HTMLElement): void {
	const text = textOf(option);
	if (multiple(p.popup) && !p.trigger.matches(BOX)) {
		const on = option.getAttribute('aria-selected') !== 'true';
		mark(option, on);
		const input = p.trigger as HTMLInputElement;
		const order = chosenOf(input, p).filter((t) => t !== text);
		chosen.set(input, on ? [...order, text] : order);
		for (const chip of chipsOf(input)) if (chip.dataset.mmChip === text) chip.hidden = !on;
		input.value = '';
		filter(p, '');
		highlight(p, option);
		input.focus({ preventScroll: true });
		return;
	}
	for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) mark(o, o === option);
	if (p.trigger.matches(BOX)) {
		const node = [...p.trigger.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
		if (node) (node as Text).data = text;
		setValue(p.trigger, text);
		close(p);
		return;
	}
	const input = p.trigger as HTMLInputElement;
	input.value = text;
	setValue(input, text);
	for (const c of groupOf(input)?.querySelectorAll<HTMLElement>('[data-slot="combobox-clear"]') ?? []) c.hidden = false;
	for (const b of buttonsOf(input)) b.removeAttribute('data-placeholder');
	close(p);
	input.focus({ preventScroll: true });
}

// The trigger button toggles the list (useClick on mousedown, or the click a key makes); the input stays where focus goes.
function toggle(input: HTMLInputElement): void {
	const p = popupFor(input);
	if (p) close(p);
	else open(input);
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	if (event.button !== 0) return false;
	const box = target.closest<HTMLElement>(BOX);
	if (box) {
		const p = openFor(box);
		if (p) close(p);
		else openBox(box);
		event.preventDefault();
		return true;
	}
	const opener = target.closest<HTMLElement>(`${INPUT}, ${BUTTON}`);
	const input = opener && inputOf(opener);
	if (!input) return false;
	if (inBox(input)) return true;
	if (opener!.matches(BUTTON)) {
		toggle(input);
		event.preventDefault();
		input.focus({ preventScroll: true });
	} else open(input);
	return true;
}

export function click(target: Element, event: MouseEvent): boolean {
	const remove = target.closest<HTMLElement>('[data-slot="combobox-chip-remove"]');
	const chip = remove?.closest<HTMLElement>('[data-mm-chip]');
	const chipsInput = chip?.closest('[data-slot="combobox-chips"]')?.querySelector<HTMLInputElement>(INPUT);
	if (chip && chipsInput) {
		chip.hidden = true;
		for (const o of optionsOf(chipsInput)) if (textOf(o) === chip.dataset.mmChip) mark(o, false);
		chosen.set(chipsInput, (chosen.get(chipsInput) ?? []).filter((t) => t !== chip.dataset.mmChip));
		chipsInput.focus({ preventScroll: true });
		return true;
	}
	const clearer = target.closest<HTMLElement>('[data-slot="combobox-clear"]');
	const cleared = clearer && inputOf(clearer);
	if (clearer && cleared) {
		clear(cleared);
		cleared.focus({ preventScroll: true });
		return true;
	}
	const option = target.closest<HTMLElement>(OPTION);
	const p = option && popupOf(option);
	if (option && p && ours(p)) {
		choose(p, option);
		return true;
	}
	// A press was answered on pointerdown; the click a key makes on a focused trigger (detail 0) toggles it.
	const box = target.closest<HTMLElement>(BOX);
	if (box) {
		if (event.detail === 0) {
			const open = openFor(box);
			if (open) close(open);
			else openBox(box);
		}
		return true;
	}
	const opener = target.closest<HTMLElement>(`${INPUT}, ${BUTTON}`);
	const input = opener && inputOf(opener);
	if (!input) return false;
	if (event.detail === 0 && opener!.matches(BUTTON) && !inBox(input)) toggle(input);
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
	// Emptying a single-value input clears its value (inputClear); the list stays open (openOnInputClick).
	if (el.value === '' && !inBox(el)) {
		const p = popupFor(el);
		if (!p || !multiple(p.popup)) {
			for (const o of optionsOf(el)) mark(o, false);
			for (const c of groupOf(el)?.querySelectorAll<HTMLElement>('[data-slot="combobox-clear"]') ?? []) c.hidden = true;
			for (const b of buttonsOf(el)) b.setAttribute('data-placeholder', '');
			setValue(el, '');
		}
	}
	const p = open(el, true);
	if (p) filter(p, el.value);
	return true;
}

// useListNavigation with loopFocus and no autoHighlight (allowEscape): past either end is no item, then the other end.
function step(p: Popup, down: boolean): void {
	const list = items(p);
	if (!list.length) return;
	const at = list.findIndex((o) => o.hasAttribute('data-highlighted'));
	if (at < 0) highlight(p, down ? list[0] : list[list.length - 1]);
	else if ((down && at === list.length - 1) || (!down && at === 0)) highlight(p, undefined);
	else highlight(p, list[at + (down ? 1 : -1)]);
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (event.ctrlKey || event.altKey || event.metaKey) return false;
	const trigger = target.closest<HTMLElement>(`${BUTTON}, ${BOX}`);
	if (trigger && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
		// ComboboxTrigger: the arrows open the popup and move focus to the input.
		event.preventDefault();
		if (trigger.matches(BOX)) {
			if (!openFor(trigger)) openBox(trigger);
			return true;
		}
		const input = inputOf(trigger);
		if (!input) return false;
		open(input);
		input.focus({ preventScroll: true });
		return true;
	}
	const el = target.closest<HTMLInputElement>(INPUT);
	if (!el || event.shiftKey) return false;
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		const was = popupFor(el);
		const p = open(el);
		if (!p) return false;
		event.preventDefault();
		// Opening by an arrow highlights the selected item, or the first (ArrowDown) or last (ArrowUp) one.
		if (!was) {
			const list = items(p);
			highlight(p, selectedIn(p) ?? (event.key === 'ArrowDown' ? list[0] : list[list.length - 1]));
		} else step(p, event.key === 'ArrowDown');
		return true;
	}
	const p = popupFor(el);
	if (!p) {
		// Escape clears only a combobox whose popup is unmounted: not the press that closed it, nor one during its exit.
		if (event.key !== 'Escape' || event.defaultPrevented || inBox(el) || layersFor(el.id).some((n) => n.hasAttribute('data-base-ui-portal') && !n.hidden)) return false;
		const empty = el.value === '' && !optionsOf(el).some((o) => o.getAttribute('aria-selected') === 'true');
		clear(el);
		return !empty;
	}
	if (event.key === 'Enter') {
		const at = items(p).find((o) => o.hasAttribute('data-highlighted'));
		if (at) {
			event.preventDefault();
			choose(p, at);
		} else if (!p.trigger.matches(BOX)) close(p);
		return true;
	}
	return false;
}
