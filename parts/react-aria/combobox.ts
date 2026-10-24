import { itemsOf, textOf } from './collection.ts';
import { holdPressed, keyboardModality, setModality } from './interactions.ts';
import { closeOverlay, openOverlay, overlayFor, overlayOf, type Overlay } from './overlay.ts';

// React Aria's ComboBox (useComboBox, useComboBoxState with its default `contains` filter): the input keeps focus and
// the listbox's focused option is virtual (aria-activedescendant, data-focused). Typing opens the popover on the options
// whose text contains the input's (accents and case ignored), and closes it when none does; the button and ArrowDown /
// ArrowUp open it on every option; arrows move the focused option, Enter or a press chooses it (its text becomes the
// input's value), Escape and leaving the input close it. Its popover is non-modal: the page stays usable.
const INPUT = 'input[data-rac][role="combobox"]';
const BUTTON = 'button[data-rac][aria-haspopup="listbox"]';

const groupOf = (el: Element) => el.closest('[role="group"]');
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
	return itemsOf(listbox).filter((i) => !i.hidden).length;
}

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

const rootOf = (input: Element) => input.closest<HTMLElement>('[data-rac]:not(input):not([role="group"])');

function open(input: HTMLInputElement, query: string, strategy: 'first' | 'last' | null): Combo | undefined {
	const existing = comboOf(input);
	if (existing) return existing;
	const button = buttonOf(input);
	if (!button?.id) return undefined;
	const combo = { input } as { -readonly [K in keyof Combo]: Combo[K] };
	const overlay = openOverlay(button, button.id, {
		modal: false,
		dismissable: false,
		placement: 'bottom left',
		offset: 8,
		onDismiss: () => close(combo),
		onReady: (o) => {
			combo.overlay = o;
			const listbox = listboxOf(o);
			if (!listbox) return;
			if (!filter(listbox, query)) return close(combo);
			const list = shown(listbox);
			if (strategy) focusOption(combo, strategy === 'first' ? list[0] : list[list.length - 1]);
		},
	});
	// Typing that matches nothing closes it as it opens.
	if (!overlay || !overlayFor(button)) return undefined;
	combo.overlay = overlay;
	combos.push(combo);
	input.setAttribute('aria-expanded', 'true');
	rootOf(input)?.setAttribute('data-open', 'true');
	const listbox = listboxOf(overlay);
	if (listbox?.id) input.setAttribute('aria-controls', listbox.id);
	holdPressed(button, true);
	return combo;
}

function choose(c: Combo, item: HTMLElement): void {
	const listbox = listboxOf(c.overlay);
	if (listbox)
		for (const el of itemsOf(listbox, true)) {
			const on = el === item;
			el.setAttribute('aria-selected', String(on));
			if (on) el.setAttribute('data-selected', 'true');
			else el.removeAttribute('data-selected');
			for (const icon of el.querySelectorAll('[data-mm-indicator]')) icon.toggleAttribute('hidden', !on);
		}
	c.input.value = textOf(item);
	c.input.dispatchEvent(new Event('mmchange', { bubbles: true }));
	close(c);
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
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
	if (!filter(listbox, el.value)) close(c);
	else focusOption(c, undefined);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
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
