import { itemsOf, textOf } from './collection.ts';
import { holdPressed, keyboardModality, setModality } from './interactions.ts';
import { ariaHideOutside, closeOverlay, openOverlay, overlayFor, overlayOf, type Overlay } from './overlay.ts';

// React Aria's ComboBox (useComboBox, useComboBoxState with its default `contains` filter): the input keeps focus and
// the listbox's focused option is virtual (aria-activedescendant, data-focused). Typing opens the popover on the options
// whose text contains the input's (accents and case ignored), and closes it when none does unless the listbox has an empty state; the button and ArrowDown /
// ArrowUp open it on every option; arrows move the focused option, Enter or a press chooses it (its text becomes the
// input's value), Escape and leaving the input close it. Its popover is non-modal: the page stays usable.
const INPUT = 'input[data-rac][role="combobox"]';
const BUTTON = 'button[data-rac][aria-haspopup="listbox"]';

// The nearest element holding both the button and the input (the button may sit in a role="group" addon of its own).
const groupOf = (el: Element) => el.closest('[data-rac]:has(input[role="combobox"])');
const inputOf = (el: Element) => (el.matches(INPUT) ? (el as HTMLInputElement) : (groupOf(el)?.querySelector<HTMLInputElement>(INPUT) ?? null));
const buttonOf = (input: Element) => groupOf(input)?.querySelector<HTMLElement>(BUTTON) ?? null;
const isComboButton = (el: Element) => el.matches(BUTTON) && !!groupOf(el)?.querySelector(INPUT);
const listboxOf = (o: Overlay) => o.content.querySelector<HTMLElement>('[role="listbox"]');

interface Combo {
	readonly input: HTMLInputElement;
	readonly overlay: Overlay;
	focused?: HTMLElement;
}
const combos: Combo[] = [];
const comboOf = (input: Element) => combos.find((c) => c.input === input);

const collator = new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' });
function contains(text: string, query: string): boolean {
	if (!query) return true;
	const t = text.normalize('NFC');
	const q = query.normalize('NFC');
	for (let i = 0; i + q.length <= t.length; i++) if (collator.compare(t.slice(i, i + q.length), q) === 0) return true;
	return false;
}

/** Shows the options matching `query` (all for ''), hides the sections left empty; returns how many show. */
function filter(listbox: HTMLElement, query: string): number {
	for (const item of itemsOf(listbox, true)) item.hidden = !contains(textOf(item), query);
	for (const section of listbox.querySelectorAll<HTMLElement>('[role="group"], section')) section.hidden = !section.querySelector('[role="option"]:not([hidden])');
	for (const sep of listbox.querySelectorAll<HTMLElement>('[role="separator"]')) sep.hidden = query !== '';
	const count = itemsOf(listbox).filter((i) => !i.hidden).length;
	const empty = listbox.querySelector<HTMLElement>(':scope > [data-mm-empty]');
	if (empty) {
		empty.hidden = count > 0;
		if (count) listbox.removeAttribute('data-empty');
		else listbox.setAttribute('data-empty', 'true');
	}
	return count;
}

// A listbox with an empty state (renderEmptyState) keeps the popover open when nothing matches.
const keepsEmpty = (listbox: HTMLElement) => !!listbox.querySelector(':scope > [data-mm-empty]');

const shown = (listbox: HTMLElement) => itemsOf(listbox).filter((i) => !i.hidden);

function focusOption(c: Combo, item: HTMLElement | undefined): void {
	const listbox = listboxOf(c.overlay);
	if (!listbox) return;
	for (const el of itemsOf(listbox, true)) {
		el.removeAttribute('data-focused');
		el.removeAttribute('data-focus-visible');
	}
	c.focused = item;
	if (!item) {
		c.input.removeAttribute('aria-activedescendant');
		return;
	}
	item.setAttribute('data-focused', 'true');
	if (keyboardModality()) item.setAttribute('data-focus-visible', 'true');
	if (item.id) c.input.setAttribute('aria-activedescendant', item.id);
	item.scrollIntoView({ block: 'nearest' });
}

function close(c: Combo): void {
	const at = combos.indexOf(c);
	if (at >= 0) combos.splice(at, 1);
	else if (!c.overlay) return;
	focusOption(c, undefined);
	c.input.setAttribute('aria-expanded', 'false');
	rootOf(c.input)?.removeAttribute('data-open');
	c.input.removeAttribute('aria-controls');
	c.input.removeAttribute('aria-activedescendant');
	const button = buttonOf(c.input);
	if (button) {
		holdPressed(button, false);
		button.setAttribute('aria-expanded', 'false');
	}
	closeOverlay(c.overlay, true);
}

const spanOf = (input: Element, button: Element) => {
	const a = input.getBoundingClientRect();
	const b = button.getBoundingClientRect();
	return Math.max(a.right, b.right) - Math.min(a.left, b.left);
};

// The input and its button's span (useComboBox), unless the recorded --trigger-width is the group's (a site's triggerRef).
const anchors = new WeakMap<Element, { readonly anchor: HTMLElement; readonly triggerWidth?: () => number }>();
function anchorOf(input: HTMLInputElement, button: HTMLElement, key: string): { readonly anchor: HTMLElement; readonly triggerWidth?: () => number } {
	const known = anchors.get(input);
	if (known) return known;
	const content = document.querySelector(`[data-mm-layer="${CSS.escape(key)}"] [data-trigger]`) ?? document.querySelector(`[data-mm-layer="${CSS.escape(key)}"][data-trigger]`);
	const recorded = Number(/--trigger-width:\s*([\d.]+)px/.exec(content?.getAttribute('style') ?? '')?.[1] ?? NaN);
	let group: HTMLElement | null = input.parentElement;
	while (group && !group.contains(button)) group = group.parentElement;
	const chosen = group && Math.abs(group.getBoundingClientRect().width - recorded) < 1 && Math.abs(spanOf(input, button) - recorded) >= 1 ? { anchor: group } : { anchor: input as HTMLElement, triggerWidth: () => spanOf(input, button) };
	anchors.set(input, chosen);
	return chosen;
}

const rootOf = (input: Element) => input.closest<HTMLElement>('[data-rac]:not(input):not([role="group"])');

function open(input: HTMLInputElement, query: string, strategy: 'first' | 'last' | null): Combo | undefined {
	const existing = comboOf(input);
	if (existing) return existing;
	const button = buttonOf(input);
	// Without a button (a multiple-selection ComboBox) the layer is the input's, placed under the group around it.
	const key = button ? button.id : input.id;
	if (!key) return undefined;
	const combo = { input } as { -readonly [K in keyof Combo]: Combo[K] };
	const overlay = openOverlay(button ?? input, key, {
		modal: false,
		dismissable: false,
		placement: 'bottom left',
		offset: 8,
		...(button ? anchorOf(input, button, key) : { markTrigger: false, anchor: input.closest<HTMLElement>('[role="group"]') ?? input }),
		onDismiss: () => close(combo),
		onReady: (o) => {
			combo.overlay = o;
			const listbox = listboxOf(o);
			if (!listbox) return;
			if (!filter(listbox, query) && !keepsEmpty(listbox)) return close(combo);
			const list = shown(listbox);
			// useSelectableCollection's autoFocus: the selected option when there is one, else the first or the last.
			if (strategy) focusOption(combo, list.find((o) => o.getAttribute('aria-selected') === 'true') ?? (strategy === 'first' ? list[0] : list[list.length - 1]));
		},
	});
	// Typing that matches nothing closes it as it opens.
	if (!overlay || !overlayFor(button ?? input)) return undefined;
	combo.overlay = overlay;
	combos.push(combo);
	overlay.cleanup.push(ariaHideOutside([input, ...overlay.nodes]));
	input.setAttribute('aria-expanded', 'true');
	rootOf(input)?.setAttribute('data-open', 'true');
	const listbox = listboxOf(overlay);
	if (listbox?.id) input.setAttribute('aria-controls', listbox.id);
	if (button) holdPressed(button, true);
	return combo;
}

const multiple = (listbox: Element | null) => listbox?.getAttribute('aria-multiselectable') === 'true';

function markSelected(item: HTMLElement, on: boolean): void {
	item.setAttribute('aria-selected', String(on));
	if (on) item.setAttribute('data-selected', 'true');
	else item.removeAttribute('data-selected');
	for (const icon of item.querySelectorAll('[data-mm-indicator]')) icon.toggleAttribute('hidden', !on);
}

// The chips (a TagGroup's rows, one per option, the converter's) beside a multiple-selection ComboBox's input.
const chipsOf = (input: Element) => [...(groupOf(input)?.querySelectorAll<HTMLElement>('[role="grid"][data-rac] > [role="row"][data-key]') ?? [])];

/** Chooses an option of a multiple-selection ComboBox or takes it back: its chip shows or hides, the input empties, the popover stays. */
function toggle(c: Combo, item: HTMLElement): void {
	const on = item.getAttribute('aria-selected') !== 'true';
	markSelected(item, on);
	const key = item.getAttribute('data-key');
	for (const chip of chipsOf(c.input)) if (chip.getAttribute('data-key') === key) chip.hidden = !on;
	c.input.value = '';
	const listbox = listboxOf(c.overlay);
	if (listbox) filter(listbox, '');
	c.input.dispatchEvent(new Event('mmchange', { bubbles: true }));
}

/** Removes a chip: it hides, and the option it stands for is no longer chosen. */
function removeChip(chip: HTMLElement): boolean {
	const input = groupOf(chip)?.querySelector<HTMLInputElement>(INPUT);
	if (!input?.id) return false;
	chip.hidden = true;
	const key = chip.getAttribute('data-key');
	for (const option of document.querySelectorAll<HTMLElement>(`[data-mm-layer="${CSS.escape(input.id)}"] [role="option"]`)) if (option.getAttribute('data-key') === key) markSelected(option, false);
	input.focus({ preventScroll: true });
	return true;
}

function choose(c: Combo, item: HTMLElement): void {
	const listbox = listboxOf(c.overlay);
	if (multiple(listbox)) return toggle(c, item);
	if (listbox) for (const el of itemsOf(listbox, true)) markSelected(el, el === item);
	c.input.value = textOf(item);
	for (const clear of clearsOf(c.input)) clear.hidden = false;
	c.input.dispatchEvent(new Event('mmchange', { bubbles: true }));
	close(c);
}

// A clear button the page renders while there is a selection (shadcn's ComboBoxClear): hidden instead of unmounted.
const clearsOf = (input: Element) => [...(groupOf(input)?.querySelectorAll<HTMLElement>('button[data-rac][data-slot$="-clear"]') ?? [])];

function clearSelection(clear: HTMLElement): boolean {
	const input = groupOf(clear)?.querySelector<HTMLInputElement>(INPUT);
	const key = input && (buttonOf(input)?.id || input.id);
	if (!input || !key) return false;
	const c = comboOf(input);
	if (c) close(c);
	input.value = '';
	for (const option of document.querySelectorAll<HTMLElement>(`[data-mm-layer="${CSS.escape(key)}"] [role="option"]`)) markSelected(option, false);
	clear.blur();
	clear.hidden = true;
	input.dispatchEvent(new Event('mmchange', { bubbles: true }));
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	// Focus stays in the input while an option is pressed (the listbox's focus is virtual).
	const o = overlayOf(target);
	if (o && combos.some((c) => c.overlay === o) && target.closest('[role="option"]')) {
		event.preventDefault();
		return true;
	}
	const button = target.closest<HTMLElement>(BUTTON);
	if (!button || !isComboButton(button) || event.button !== 0) return false;
	const input = inputOf(button);
	if (!input) return false;
	event.preventDefault();
	const c = comboOf(input);
	if (c) close(c);
	else open(input, '', null);
	input.focus({ preventScroll: true });
	return true;
}

export function click(target: Element): boolean {
	const button = target.closest<HTMLElement>(BUTTON);
	if (button && isComboButton(button)) return true;
	const clear = target.closest<HTMLElement>('button[data-rac][data-slot$="-clear"]');
	if (clear && groupOf(clear)?.querySelector(INPUT)) return clearSelection(clear);
	const remove = target.closest<HTMLElement>('[role="row"] button[slot="remove"]');
	const chip = remove?.closest<HTMLElement>('[role="row"][data-key]');
	if (chip && groupOf(chip)?.querySelector(INPUT)) return removeChip(chip);
	const item = target.closest<HTMLElement>('[role="option"]');
	const o = item && overlayOf(item);
	const c = o && combos.find((x) => x.overlay === o);
	if (!item || !c || item.getAttribute('aria-disabled') === 'true') return false;
	choose(c, item);
	c.input.focus({ preventScroll: true });
	return true;
}

export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>('[role="option"]');
	const o = item && overlayOf(item);
	const c = o && combos.find((x) => x.overlay === o);
	if (!item || !c) return false;
	focusOption(c, item);
	return true;
}

export function input(target: Element): boolean {
	if (!target.matches(INPUT)) return false;
	const el = target as HTMLInputElement;
	const c = comboOf(el);
	if (!c) {
		if (el.value) open(el, el.value, null);
		return true;
	}
	const listbox = listboxOf(c.overlay);
	if (!listbox) return true;
	if (!filter(listbox, el.value) && !keepsEmpty(listbox)) close(c);
	else focusOption(c, undefined);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	// The button pressed with the keyboard opens on the first option, focus moving to the input.
	const button = target.closest<HTMLElement>(BUTTON);
	if (button && isComboButton(button) && (event.key === 'Enter' || event.key === ' ')) {
		const input = inputOf(button);
		if (!input) return false;
		event.preventDefault();
		setModality('keyboard');
		const c = comboOf(input);
		if (c) close(c);
		else open(input, '', 'first');
		input.focus({ preventScroll: true });
		return true;
	}
	// useMenuTrigger's keys on the button: ArrowDown and ArrowUp toggle it on the first or the last option, focus kept.
	if (button && isComboButton(button) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
		const input = inputOf(button);
		if (!input) return false;
		event.preventDefault();
		setModality('keyboard');
		const c = comboOf(input);
		if (c) close(c);
		else open(input, '', event.key === 'ArrowDown' ? 'first' : 'last');
		return true;
	}
	const chip = target.closest<HTMLElement>('[role="grid"][data-rac] > [role="row"][data-key]');
	if (chip && (event.key === 'Backspace' || event.key === 'Delete') && groupOf(chip)?.querySelector(INPUT)) {
		event.preventDefault();
		return removeChip(chip);
	}
	if (!target.matches(INPUT)) return false;
	const el = target as HTMLInputElement;
	const c = comboOf(el);
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		event.preventDefault();
		setModality('keyboard');
		if (!c) {
			open(el, '', event.key === 'ArrowDown' ? 'first' : 'last');
			return true;
		}
		const listbox = listboxOf(c.overlay);
		if (!listbox) return true;
		const list = shown(listbox);
		const at = c.focused ? list.indexOf(c.focused) : -1;
		const to = event.key === 'ArrowDown' ? (at < 0 ? list[0] : (list[at + 1] ?? list[at])) : at < 0 ? list[list.length - 1] : (list[at - 1] ?? list[at]);
		focusOption(c, to);
		return true;
	}
	if (!c) return false;
	if (event.key === 'Enter' && c.focused) {
		event.preventDefault();
		choose(c, c.focused);
		return true;
	}
	if (event.key === 'Escape') {
		event.preventDefault();
		close(c);
		return true;
	}
	return false;
}

export function focusout(target: Element, event: FocusEvent): boolean {
	if (!target.matches(INPUT)) return false;
	const c = comboOf(target);
	const to = event.relatedTarget;
	if (c && !(to instanceof Node && (c.overlay.nodes.some((n) => n.contains(to)) || groupOf(target)?.contains(to)))) close(c);
	return false;
}
