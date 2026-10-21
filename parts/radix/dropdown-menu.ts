import { closeLayer, layerOf, openLayer, type Layer } from '../layer.ts';

// Radix DropdownMenu (@radix-ui/react-dropdown-menu), modal as by default: pressing the trigger (or Enter, Space or
// ArrowDown on it) opens the menu with outside pointer events off; the content takes focus (the first item from the
// keyboard); arrows, Home and End move a roving highlight; choosing an item or Escape closes it and focus returns.

// Radix Menubar's triggers are menu buttons too: with one menu open, the pointer on another opens it, and the arrows
// across an open menu move to the neighbouring menu of the bar.
const TRIGGER = '[aria-haspopup="menu"][data-slot$="menu-trigger"], [aria-haspopup="menu"][data-slot="menubar-trigger"]';
const BAR = '[role="menubar"]';
const barTriggers = (trigger: HTMLElement) => [...(trigger.closest(BAR)?.querySelectorAll<HTMLElement>('[data-slot="menubar-trigger"]') ?? [])];
const openOf = (trigger: HTMLElement) => layerOf(document.getElementById(trigger.getAttribute('aria-controls') ?? '') ?? trigger);
const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const keyOf = (trigger: HTMLElement) => trigger.getAttribute('aria-controls') || trigger.id;

function setTrigger(trigger: HTMLElement, open: boolean, layer?: Layer): void {
	// A context menu's trigger area (opened by the context-menu port) is not a menu button.
	if (!trigger.hasAttribute('aria-haspopup')) return;
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
	if (open && layer?.content.id) trigger.setAttribute('aria-controls', layer.content.id);
	else if (!open) trigger.removeAttribute('aria-controls');
}

const items = (layer: Layer) => [...layer.content.querySelectorAll<HTMLElement>(ITEM)].filter((i) => !i.hasAttribute('data-disabled'));

function highlight(item: HTMLElement | undefined, layer: Layer): void {
	for (const other of items(layer)) other.removeAttribute('data-highlighted');
	if (!item) return;
	item.setAttribute('data-highlighted', '');
	item.focus({ preventScroll: true });
}

function close(layer: Layer, keepFocus = false): void {
	setTrigger(layer.trigger, false);
	closeLayer(layer, keepFocus);
}

function openMenu(trigger: HTMLElement, first: boolean): boolean {
	let layer: Layer | undefined;
	layer = openLayer(trigger, keyOf(trigger), { modal: true, onDismiss: (l) => close(l) });
	if (!layer) return false;
	setTrigger(trigger, true, layer);
	if (first) highlight(items(layer)[0], layer);
	else layer.content.focus({ preventScroll: true });
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || event.button !== 0 || event.ctrlKey || trigger.hasAttribute('disabled')) return false;
	const layer = layerOf(document.getElementById(trigger.getAttribute('aria-controls') ?? '') ?? trigger);
	if (trigger.getAttribute('aria-expanded') === 'true' && layer) close(layer);
	else if (openMenu(trigger, false)) event.preventDefault();
	return true;
}

export function click(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const layer = item && layerOf(item);
	if (!item || !layer || item.hasAttribute('data-disabled')) return false;
	if (item.getAttribute('aria-haspopup') === 'menu') return true;
	close(layer);
	return true;
}

function switchTo(from: HTMLElement, to: HTMLElement | undefined, first: boolean): boolean {
	const open = openOf(from);
	if (!to || to === from) return false;
	if (open) close(open, true);
	openMenu(to, first);
	to.focus({ preventScroll: true });
	if (first) {
		const layer = openOf(to);
		if (layer) highlight(items(layer)[0], layer);
	}
	return true;
}

export function pointerover(target: Element): boolean {
	const bar = target.closest<HTMLElement>('[data-slot="menubar-trigger"]');
	if (bar) {
		const open = barTriggers(bar).find((t) => t !== bar && t.getAttribute('aria-expanded') === 'true');
		return open ? switchTo(open, bar, false) : false;
	}
	const item = target.closest<HTMLElement>(ITEM);
	const layer = item && layerOf(item);
	if (!item || !layer) return false;
	highlight(item, layer);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger && ['Enter', ' ', 'ArrowDown'].includes(event.key) && trigger.getAttribute('aria-expanded') !== 'true') {
		event.preventDefault();
		return openMenu(trigger, true);
	}
	const layer = layerOf(target);
	if (!layer || !layer.content.contains(target) || !layer.content.matches('[role="menu"]')) return false;
	if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && layer.trigger.matches('[data-slot="menubar-trigger"]') && !target.closest('[aria-haspopup="menu"]')) {
		const all = barTriggers(layer.trigger);
		const rtl = getComputedStyle(layer.trigger).direction === 'rtl';
		const step = (event.key === 'ArrowRight') !== rtl ? 1 : -1;
		event.preventDefault();
		return switchTo(layer.trigger, all[(all.indexOf(layer.trigger) + step + all.length) % all.length], true);
	}
	const list = items(layer);
	const at = list.indexOf(target.closest<HTMLElement>(ITEM)!);
	const to = { ArrowDown: list[Math.min(list.length - 1, at + 1)] ?? list[0], ArrowUp: at <= 0 ? list[0] : list[at - 1], Home: list[0], End: list[list.length - 1] }[event.key];
	if (to) {
		event.preventDefault();
		highlight(to, layer);
		return true;
	}
	if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
		event.preventDefault();
		list[at]!.click();
		return true;
	}
	if (event.key === 'Tab') {
		event.preventDefault();
		return true;
	}
	if (event.key.length === 1 && /\S/.test(event.key)) {
		const from = at + 1;
		const match = [...list.slice(from), ...list.slice(0, from)].find((i) => (i.textContent ?? '').trim().toLowerCase().startsWith(event.key.toLowerCase()));
		if (match) highlight(match, layer);
		return true;
	}
	return false;
}
