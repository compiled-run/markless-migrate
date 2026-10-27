// @qwik-ui/headless Dropdown (dropdown/*): the trigger's click toggles the menu, a manual popover placed by floating-ui;
// Down, Up, Enter and Space open it (never close it) and focus moves to the highlighted item, else the first enabled one.
// In the menu: Up and Down move the highlight and focus (wrapping only with data-mm-loop), Home and End go to the ends,
// Enter, Space or a click activates the item: a checkbox item toggles, a radio item becomes its group's value, and a
// plain item (close on select) closes the menu and returns focus to the trigger. Escape closes it and returns focus,
// Tab closes it. A pointer over an item highlights it; a press outside the menu and the trigger closes it.
import { enabled, hidePanel, mark, outside, place, showPanel, step, unplace } from './floating.ts';

const ROOT = '[data-qui-dropdown]';
const ITEM = '[data-menu-item]';

interface Dropdown {
	readonly root: HTMLElement;
	readonly trigger: HTMLElement;
	readonly panel: HTMLElement;
}

function dropdownOf(el: Element | null): Dropdown | undefined {
	const root = el?.closest<HTMLElement>(ROOT);
	const trigger = root?.querySelector<HTMLElement>('[data-trigger]');
	const panel = trigger ? document.getElementById(trigger.id.replace(/-trigger$/, '-panel')) : null;
	return root && trigger && panel ? { root, trigger, panel } : undefined;
}

const itemsOf = (d: Dropdown) => [...d.panel.querySelectorAll<HTMLElement>(ITEM)];
const isOpen = (d: Dropdown) => d.root.hasAttribute('data-open');
const loop = (d: Dropdown) => d.root.dataset.mmLoop !== undefined;
const current = new WeakMap<HTMLElement, Dropdown>();

function highlight(d: Dropdown, item: HTMLElement | undefined): void {
	for (const i of itemsOf(d)) i.toggleAttribute('data-highlighted', i === item);
	d.root.setAttribute('aria-activedescendant', item?.id ?? '');
	item?.focus();
}

function setOpen(d: Dropdown, on: boolean): void {
	if (on === isOpen(d)) return;
	mark([d.root, d.trigger, d.panel], on);
	for (const el of [d.root, d.trigger, d.panel]) el.setAttribute('aria-expanded', String(on));
	if (on) {
		showPanel(d.panel);
		place(d.trigger, d.panel);
		current.set(d.root, d);
	} else {
		unplace(d.panel);
		hidePanel(d.panel);
		current.delete(d.root);
	}
}

function openWithHighlight(d: Dropdown): void {
	setOpen(d, true);
	const items = itemsOf(d);
	highlight(d, items.find((i) => i.hasAttribute('data-highlighted')) ?? items.find(enabled));
}

function setChecked(item: HTMLElement, on: boolean): void {
	item.setAttribute('aria-checked', String(on));
	item.toggleAttribute('data-checked', on);
	item.querySelector('[role="checkbox"]')?.setAttribute('aria-checked', String(on));
	item.querySelector('[data-qds-indicator]')?.toggleAttribute('data-hidden', !on);
}

function activate(d: Dropdown, item: HTMLElement): void {
	if (!enabled(item)) return;
	const radio = item.getAttribute('role') === 'menuitemradio';
	const checkbox = item.querySelector('[role="checkbox"]') !== null;
	if (radio) for (const r of item.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []) setChecked(r, r === item);
	else if (checkbox) setChecked(item, item.getAttribute('aria-checked') !== 'true');
	const closes = item.hasAttribute('data-close-on-select') || (!radio && !checkbox && item.dataset.mmCloseOnSelect !== 'false');
	if (closes) {
		setOpen(d, false);
		d.trigger.focus();
	}
}

export function click(target: Element, event: MouseEvent): boolean {
	const d = dropdownOf(target);
	if (!d) return false;
	const item = target.closest<HTMLElement>(ITEM);
	if (item && d.panel.contains(item)) {
		event.preventDefault();
		activate(d, item);
		return true;
	}
	if (target.closest('[data-trigger]') !== d.trigger) return false;
	event.preventDefault();
	if (isOpen(d)) setOpen(d, false);
	else openWithHighlight(d);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const d = dropdownOf(target);
	if (!d) return false;
	const item = target.closest<HTMLElement>(ITEM);
	if (target.closest('[data-trigger]') === d.trigger) {
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' '].includes(event.key)) event.preventDefault();
		if (event.key === 'Tab' || event.key === 'Escape') setOpen(d, false);
		else if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) openWithHighlight(d);
		else return false;
		return event.key !== 'Tab';
	}
	if (!item || !d.panel.contains(item)) return false;
	if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(event.key)) event.preventDefault();
	const items = itemsOf(d);
	const at = items.indexOf(item);
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		const to = step(items, at, event.key === 'ArrowDown' ? 1 : -1, loop(d));
		if (to) highlight(d, to);
	} else if (event.key === 'Home') highlight(d, items.find(enabled));
	else if (event.key === 'End') highlight(d, [...items].reverse().find(enabled));
	else if (event.key === 'Enter' || event.key === ' ') activate(d, item);
	else if (event.key === 'Escape') {
		setOpen(d, false);
		d.trigger.focus();
	} else if (event.key === 'Tab') {
		setOpen(d, false);
		return false;
	} else return false;
	return true;
}

export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const d = item ? dropdownOf(item) : undefined;
	if (!d || !item || !enabled(item) || !d.panel.contains(item)) return false;
	highlight(d, item);
	return true;
}

if (typeof window !== 'undefined')
	window.addEventListener('pointerdown', (event) => {
		for (const root of document.querySelectorAll<HTMLElement>(ROOT)) {
			const d = current.get(root);
			if (d && outside(event, [d.panel, d.trigger])) setOpen(d, false);
		}
	});
