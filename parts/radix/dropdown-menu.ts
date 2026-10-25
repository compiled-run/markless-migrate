import { closeLayer, layerOf, openLayer, type Layer } from '../layer.ts';
import { closestTrigger, layerKey } from '../reveal.ts';

// Radix DropdownMenu (@radix-ui/react-dropdown-menu), modal as by default: pressing the trigger (or Enter, Space or
// ArrowDown on it) opens the menu with outside pointer events off; the content takes focus (the first item from the
// keyboard); arrows, Home and End move focus between the items; choosing an item or Escape closes it and focus returns.
// An item is highlighted (data-highlighted) while it has focus: the mouse moving onto it focuses it, leaving it (or
// moving onto a disabled one) focuses the content.

// Radix Menubar's triggers are menu buttons too, their menus not modal: the arrows rove focus between the triggers
// (a RovingFocusGroup, looping), the focused one highlighted; with one open, the pointer on another trigger opens that
// one, and the side arrows in an open menu open the neighbouring menu of the bar with its content focused.
const TRIGGER = '[aria-haspopup="menu"][data-slot$="menu-trigger"], [aria-haspopup="menu"][data-slot="menubar-trigger"][data-state]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[aria-haspopup="menu"][data-state]', (slot) => /menu-trigger$/.test(slot));
const BAR = '[role="menubar"]';
const BAR_TRIGGER = '[role="menuitem"]';
const barTriggers = (bar: Element) => [...bar.querySelectorAll<HTMLElement>(BAR_TRIGGER)].filter((t) => t.closest(BAR) === bar);
const barOf = (trigger: Element) => (trigger.matches(BAR_TRIGGER) ? trigger.closest<HTMLElement>(BAR) : null);
const openOf = (trigger: HTMLElement) => layerOf(document.getElementById(trigger.getAttribute('aria-controls') ?? '') ?? trigger);
const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const keyOf = (trigger: HTMLElement) => layerKey(trigger);
const disabled = (el: Element) => el.hasAttribute('data-disabled') || el.hasAttribute('disabled');
const rtl = (el: Element) => getComputedStyle(el).direction === 'rtl';

function setTrigger(trigger: HTMLElement, open: boolean, layer?: Layer): void {
	// A context menu's trigger area (opened by the context-menu port) is not a menu button.
	if (!trigger.hasAttribute('aria-haspopup')) return;
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
	if (open && layer?.content.id) trigger.setAttribute('aria-controls', layer.content.id);
	else if (!open) trigger.removeAttribute('aria-controls');
}

const items = (layer: Layer) => [...layer.content.querySelectorAll<HTMLElement>(ITEM)].filter((i) => !disabled(i));

const marked = new WeakSet<HTMLElement>();
function mark(el: HTMLElement): void {
	el.setAttribute('data-highlighted', '');
	if (marked.has(el)) return;
	marked.add(el);
	el.addEventListener('blur', () => {
		marked.delete(el);
		el.removeAttribute('data-highlighted');
	}, { once: true });
}

/** Clears what a menu marked: Radix unmounts the content on close, so it opens again with nothing highlighted. */
export function clearHighlight(layer: Layer): void {
	for (const el of layer.content.querySelectorAll('[data-highlighted]')) el.removeAttribute('data-highlighted');
}

function highlight(item: HTMLElement | undefined): void {
	if (!item) return;
	item.focus({ preventScroll: true });
	if (document.activeElement === item) mark(item);
}

function close(layer: Layer, keepFocus = false): void {
	setTrigger(layer.trigger, false);
	clearHighlight(layer);
	closeLayer(layer, keepFocus);
}

function openMenu(trigger: HTMLElement, first: boolean): boolean {
	const layer = openLayer(trigger, keyOf(trigger), { modal: !barOf(trigger), onDismiss: (l) => close(l) });
	if (!layer) return false;
	setTrigger(trigger, true, layer);
	clearHighlight(layer);
	if (barOf(trigger)) setTabStop(trigger);
	if (first) highlight(items(layer)[0]);
	else layer.content.focus({ preventScroll: true });
	return true;
}

// Menubar's RovingFocusGroup: the trigger last focused is the bar's tab stop.
function setTabStop(trigger: HTMLElement): void {
	const bar = barOf(trigger);
	if (bar) for (const t of barTriggers(bar)) t.setAttribute('tabindex', t === trigger ? '0' : '-1');
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || event.button !== 0 || event.ctrlKey || trigger.hasAttribute('disabled')) return false;
	const layer = layerOf(document.getElementById(trigger.getAttribute('aria-controls') ?? '') ?? trigger);
	if (trigger.getAttribute('aria-expanded') === 'true' && layer) close(layer);
	else if (openMenu(trigger, false)) event.preventDefault();
	return true;
}

export function click(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const layer = item && layerOf(item);
	if (!item || !layer || disabled(item)) return false;
	if (item.getAttribute('aria-haspopup') === 'menu') return true;
	close(layer);
	return true;
}

function switchTo(from: HTMLElement, to: HTMLElement | undefined, first: boolean): boolean {
	const open = openOf(from);
	if (!to || to === from) return false;
	if (open) close(open, true);
	return openMenu(to, first);
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	const bar = target.closest<HTMLElement>('[data-slot="menubar-trigger"][data-state]');
	if (bar) {
		const open = barTriggers(bar.closest(BAR) ?? bar).find((t) => t !== bar && t.getAttribute('aria-expanded') === 'true');
		return open ? switchTo(open, bar, false) : false;
	}
	const item = target.closest<HTMLElement>(ITEM);
	const layer = item && layerOf(item);
	if (!item || !layer || event.pointerType !== 'mouse') return false;
	if (disabled(item)) layer.content.focus({ preventScroll: true });
	else highlight(item);
	return true;
}

// MenuItem's onPointerLeave: the content takes focus back from the item.
export function pointerout(target: Element, event: PointerEvent): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const layer = item && layerOf(item);
	if (!item || !layer || event.pointerType !== 'mouse') return false;
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	if (to && item.contains(to)) return true;
	if (item.contains(document.activeElement)) layer.content.focus({ preventScroll: true });
	return true;
}

export function focusin(target: Element, event: FocusEvent): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.matches(BAR)) {
		// RovingFocusGroup's entry focus: a keyboard focus on the bar itself moves on to its tab stop.
		const from = event.relatedTarget instanceof Node ? event.relatedTarget : null;
		if ((from && target.contains(from)) || !target.matches(':focus-visible')) return false;
		const list = barTriggers(target).filter((t) => !disabled(t));
		(list.find((t) => t.getAttribute('tabindex') === '0') ?? list[0])?.focus();
		return true;
	}
	const bar = barOf(target);
	if (bar) {
		setTabStop(target);
		mark(target);
	} else if (target.matches(ITEM) && layerOf(target)) mark(target);
	return false;
}

function rove(trigger: HTMLElement, event: KeyboardEvent): boolean {
	const bar = barOf(trigger)!;
	const key = rtl(bar) ? ({ ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' } as Record<string, string>)[event.key] ?? event.key : event.key;
	const intent = ({ ArrowLeft: 'prev', ArrowRight: 'next', Home: 'first', PageUp: 'first', End: 'last', PageDown: 'last' } as Record<string, string>)[key];
	if (!intent) return false;
	if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return true;
	event.preventDefault();
	const list = barTriggers(bar).filter((t) => !disabled(t));
	const at = list.indexOf(trigger);
	const to = intent === 'first' ? list[0] : intent === 'last' ? list[list.length - 1] : list[(at + (intent === 'next' ? 1 : -1) + list.length) % list.length];
	setTimeout(() => to?.focus());
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = triggerOf(target);
	if (trigger && ['Enter', ' ', 'ArrowDown'].includes(event.key) && trigger.getAttribute('aria-expanded') !== 'true') {
		event.preventDefault();
		return openMenu(trigger, true);
	}
	if (trigger === target && barOf(trigger) && rove(trigger, event)) return true;
	if (target instanceof HTMLElement && target.matches(BAR_TRIGGER) && barOf(target) && event.key === 'Tab' && event.shiftKey) {
		// Shift+Tab from a trigger leaves the bar rather than landing on its own tab stop.
		const bar = barOf(target)!;
		bar.setAttribute('tabindex', '-1');
		setTimeout(() => bar.setAttribute('tabindex', '0'));
		return false;
	}
	const layer = layerOf(target);
	if (!layer || !layer.content.contains(target) || !layer.content.matches('[role="menu"]')) return false;
	if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && barOf(layer.trigger) && !target.closest('[aria-haspopup="menu"]')) {
		const all = barTriggers(barOf(layer.trigger)!).filter((t) => !disabled(t));
		const step = (event.key === 'ArrowRight') !== rtl(layer.trigger) ? 1 : -1;
		event.preventDefault();
		return switchTo(layer.trigger, all[(all.indexOf(layer.trigger) + step + all.length) % all.length], false);
	}
	const list = items(layer);
	const at = list.indexOf(target.closest<HTMLElement>(ITEM)!);
	// From the content itself the first keys focus the first item and the last keys the last (MenuContent's onKeyDown).
	const first = list[0];
	const last = list[list.length - 1];
	const to = (
		target === layer.content
			? { ArrowDown: first, PageUp: first, Home: first, ArrowUp: last, PageDown: last, End: last }
			: { ArrowDown: list[at + 1], ArrowUp: list[at - 1], Home: first, PageUp: first, End: last, PageDown: last }
	)[event.key];
	if (to || ['ArrowDown', 'ArrowUp'].includes(event.key)) {
		event.preventDefault();
		highlight(to);
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
		highlight(match);
		return true;
	}
	return false;
}
