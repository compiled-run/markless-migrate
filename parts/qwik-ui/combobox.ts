// @qwik-ui/headless Combobox (combobox/*): focus stays in the input and the highlighted item is its
// aria-activedescendant. Typing filters the items by their text (display none on the rest; the empty state shows when
// none is left) and opens the list; Down and Up open it or move the highlight past filtered and disabled items
// (wrapping only with data-mm-loop), Home and End go to the ends, Enter chooses (closing a single combobox), Escape and Tab
// close. The trigger toggles the list and keeps focus in the input; a pointer over an item highlights it once the
// pointer has entered the panel; a click chooses it. Choosing writes the item's text into the input. A press outside
// the panel and the control closes it.
import { enabled, hidePanel, mark, outside, place, showPanel, step, unplace } from './floating.ts';

const ROOT = '[data-combobox-root]';
const ITEM = '[role="option"][data-item]';

interface Combobox {
	readonly root: HTMLElement;
	readonly input: HTMLInputElement;
	readonly control: HTMLElement;
	readonly trigger: HTMLElement | null;
	readonly panel: HTMLElement;
	readonly inline: boolean;
}

function comboboxOf(el: Element | null): Combobox | undefined {
	const root = el?.closest<HTMLElement>(ROOT);
	const input = root?.querySelector<HTMLInputElement>('input[role="combobox"]');
	const panel = input ? document.getElementById(input.getAttribute('aria-controls') ?? '') : null;
	if (!root || !input || !panel) return undefined;
	const control = root.querySelector<HTMLElement>('[data-combobox-control]') ?? input;
	return { root, input, control, trigger: control.querySelector<HTMLElement>('button'), panel, inline: !panel.hasAttribute('popover') };
}

const itemsOf = (c: Combobox) => [...c.panel.querySelectorAll<HTMLElement>(ITEM)];
const labelOf = (item: Element) => (item.querySelector('[id$="-item-label"]') ?? item).textContent ?? '';
const shown = (item: HTMLElement) => item.style.display !== 'none' && enabled(item);
const multiple = (c: Combobox) => c.panel.getAttribute('aria-multiselectable') === 'true';
const isOpen = (c: Combobox) => c.inline || c.root.hasAttribute('data-open');
const entered = new WeakSet<HTMLElement>();
const current = new WeakMap<HTMLElement, Combobox>();

function highlight(c: Combobox, item: HTMLElement | undefined): void {
	for (const i of itemsOf(c)) i.toggleAttribute('data-highlighted', i === item);
	c.input.setAttribute('aria-activedescendant', item && enabled(item) && isOpen(c) ? item.id : '');
}

function setOpen(c: Combobox, on: boolean): void {
	if (c.inline || on === isOpen(c)) return;
	mark([c.root, c.trigger, c.panel], on);
	c.input.setAttribute('aria-expanded', String(on));
	c.trigger?.setAttribute('aria-expanded', String(on));
	c.panel.setAttribute('aria-expanded', String(on));
	if (on) {
		showPanel(c.panel);
		place(c.control, c.panel);
		current.set(c.root, c);
	} else {
		highlight(c, undefined);
		entered.delete(c.panel);
		unplace(c.panel);
		hidePanel(c.panel);
		current.delete(c.root);
	}
}

function filter(c: Combobox): void {
	if (c.root.dataset.mmFilter === 'false') return;
	const text = c.input.value.toLowerCase();
	let any = false;
	for (const item of itemsOf(c)) {
		const match = labelOf(item).toLowerCase().includes(text);
		item.style.display = match ? '' : 'none';
		any ||= match;
	}
	const empty = c.root.querySelector<HTMLElement>('[data-qui-combobox-empty]');
	empty?.toggleAttribute('data-empty', !any);
	if (!any && !empty) setOpen(c, false);
}

function choose(c: Combobox, item: HTMLElement): void {
	if (!enabled(item)) return;
	const many = multiple(c);
	const was = item.getAttribute('aria-selected') === 'true';
	for (const i of itemsOf(c)) {
		const on = i === item ? (many ? !was : true) : many && i.getAttribute('aria-selected') === 'true';
		i.setAttribute('aria-selected', String(on));
		i.toggleAttribute('data-selected', on);
		i.querySelector('[data-item-indicator]')?.toggleAttribute('data-selected', on);
	}
	if (many) c.input.value = '';
	else c.input.value = labelOf(item);
	const native = c.root.querySelector<HTMLSelectElement>('select');
	if (native) {
		const chosen = new Set(itemsOf(c).filter((i) => i.getAttribute('aria-selected') === 'true').map((i) => labelOf(i).trim()));
		for (const option of native.options) option.selected = option.value !== '' && (chosen.has(option.value) || chosen.has(option.text.trim()));
		native.dispatchEvent(new Event('input'));
	}
	if (!many && !c.inline) setOpen(c, false);
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const c = comboboxOf(target);
	if (!c || target !== c.input) return false;
	if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageDown', 'PageUp', 'Enter'].includes(event.key)) event.preventDefault();
	const items = itemsOf(c);
	const at = items.findIndex((i) => i.hasAttribute('data-highlighted'));
	const loop = c.root.dataset.mmLoop !== undefined;
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		if (!isOpen(c)) {
			setOpen(c, true);
			return true;
		}
		const to = at < 0 ? (event.key === 'ArrowDown' ? items.find(shown) : [...items].reverse().find(shown)) : step(items, at, event.key === 'ArrowDown' ? 1 : -1, loop, shown);
		if (to) highlight(c, to);
	} else if ((event.key === 'Home' || event.key === 'End') && isOpen(c)) highlight(c, event.key === 'Home' ? items.find(shown) : [...items].reverse().find(shown));
	else if (event.key === 'Enter' && isOpen(c) && at >= 0) choose(c, items[at]!);
	else if (event.key === 'Escape' || event.key === 'Tab') {
		setOpen(c, false);
		return event.key === 'Escape';
	} else return false;
	return true;
}

export function input(target: Element): boolean {
	const c = comboboxOf(target);
	if (!c || target !== c.input) return false;
	if (!c.inline) highlight(c, undefined);
	if (c.input.value === '' && !multiple(c)) for (const i of itemsOf(c)) {
		i.setAttribute('aria-selected', 'false');
		i.removeAttribute('data-selected');
	}
	filter(c);
	if (c.input.value !== '' || c.inline) setOpen(c, true);
	if (c.inline) highlight(c, itemsOf(c).find(shown));
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const c = comboboxOf(target);
	if (!c || !c.trigger || target.closest('button') !== c.trigger) return false;
	event.preventDefault();
	return true;
}

export function click(target: Element): boolean {
	const c = comboboxOf(target);
	if (!c) return false;
	const item = target.closest<HTMLElement>(ITEM);
	if (item && c.panel.contains(item)) {
		choose(c, item);
		c.input.focus();
		return true;
	}
	if (c.trigger && target.closest('button') === c.trigger) {
		c.input.focus();
		setOpen(c, !isOpen(c));
		return true;
	}
	if (target.closest('label')?.id === c.input.getAttribute('aria-labelledby')) {
		c.input.focus();
		return true;
	}
	return false;
}

export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const c = comboboxOf(item ?? target);
	if (!c) return false;
	if (c.panel.contains(target)) entered.add(c.panel);
	if (!item || !c.panel.contains(item) || !enabled(item) || (!entered.has(c.panel) && !c.inline)) return false;
	highlight(c, item);
	return true;
}

export function focusin(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const c = item ? comboboxOf(item) : undefined;
	if (!c) return false;
	c.input.focus();
	return true;
}

if (typeof window !== 'undefined')
	window.addEventListener('pointerdown', (event) => {
		for (const root of document.querySelectorAll<HTMLElement>(ROOT)) {
			const c = current.get(root);
			if (c && outside(event, [c.panel, c.control])) setOpen(c, false);
		}
	});
