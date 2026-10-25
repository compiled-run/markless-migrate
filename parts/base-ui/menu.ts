import { closePopup, endTyping, newTyping, openPopup, popupOf, typeahead, type Popup, type Typing } from './popup.ts';

// Base UI Menu: a press on the trigger opens the menu focused (keyboard: Enter, Space, ArrowDown highlight the first
// enabled item, ArrowUp the last); arrows loop over every item, disabled ones too, Home and End go to the ends, typing
// moves to the next item starting with what was typed; choosing an item or Escape closes it, focus back on the trigger.
// In a menubar, with one menu open the pointer on another trigger opens that one, and the side arrows move between menus.
// Radix's triggers carry data-state and React Aria's data-rac; Base UI's neither (generated ids are renamed, so they tell nothing).
const OPENER = '[aria-haspopup="menu"]:not([data-state]):not([data-rac])';
const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
// A submenu's trigger is an item of the menu it sits in; a menubar's triggers are menuitems too, outside any menu.
const triggerOf = (target: Element) => {
	const t = target.closest<HTMLElement>(OPENER);
	return t && !t.closest('[role="menu"]') ? t : null;
};

const typing = new WeakMap<Popup, Typing>();
// Base UI highlights on mousemove: a pointerover with no move since the menu opened (Chrome's, as content appears under
// a still pointer) is answered by the next move.
let lastMove = -1;
let deferred = false;
let keysMoved = false;
let watching = false;
function watchMoves(): void {
	if (watching) return;
	watching = true;
	document.addEventListener(
		'pointermove',
		(event) => {
			lastMove = event.timeStamp;
			keysMoved = false;
			if (!deferred) return;
			deferred = false;
			if (event.target instanceof Element) pointerover(event.target);
		},
		true,
	);
}
const visible = (el: Element) => el.getClientRects().length > 0;
const items = (p: Popup) => [...p.popup.querySelectorAll<HTMLElement>(ITEM)];
const enabled = (i: HTMLElement) => !i.hasAttribute('disabled') && i.getAttribute('aria-disabled') !== 'true';
const highlightedIn = (p: Popup) => items(p).findIndex((i) => i.hasAttribute('data-highlighted'));
// `keyboard`: useListNavigation scrolls the item into view when the keys, not the pointer, moved to it.
function highlight(p: Popup, item: HTMLElement | undefined, keyboard = false): void {
	for (const i of items(p)) i.removeAttribute('data-highlighted');
	if (!item) return;
	item.setAttribute('data-highlighted', '');
	item.focus({ preventScroll: true });
	if (keyboard) item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
// useListNavigation's ends: navigation skips only hidden items (Menu passes no disabledIndices); opening also skips disabled ones.
const first = (list: readonly HTMLElement[], skip = (_: HTMLElement) => false) => list.find((i) => visible(i) && !skip(i));
const last = (list: readonly HTMLElement[], skip = (_: HTMLElement) => false) => list.findLast((i) => visible(i) && !skip(i));

function openMenu(trigger: HTMLElement, focus: 'first' | 'last' | 'popup'): boolean {
	const p = openPopup(trigger, { popupSelector: '[role="menu"]', tabOut: true, onDismiss: (x) => close(x) });
	if (!p) return false;
	typing.set(p, newTyping());
	highlight(p, undefined);
	const list = items(p);
	const to = focus === 'first' ? first(list, (i) => !enabled(i)) : focus === 'last' ? last(list, (i) => !enabled(i)) : undefined;
	// useListNavigation's first focus waits a frame, for the popup's placement.
	if (to) {
		highlight(p, to);
		requestAnimationFrame(() => to.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
	} else p.popup.focus({ preventScroll: true });
	return true;
}
function close(p: Popup, returnFocus = true): void {
	const t = typing.get(p);
	if (t) endTyping(t);
	highlight(p, undefined);
	closePopup(p, returnFocus);
}
const popupFor = (trigger: HTMLElement) => [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);
const barTriggers = (trigger: HTMLElement) => [...(trigger.closest('[role="menubar"]')?.querySelectorAll<HTMLElement>(OPENER) ?? [])].filter((t) => t.closest('[role="menubar"]') === trigger.closest('[role="menubar"]') && !popupOf(t));

function switchTo(p: Popup, to: HTMLElement | undefined, focus: 'popup'): boolean {
	if (!to || to === p.trigger) return false;
	close(p, false);
	const bar = to.closest('[role="menubar"]');
	if (bar) for (const t of bar.querySelectorAll<HTMLElement>(OPENER)) if (t.closest('[role="menubar"]') === bar) t.tabIndex = t === to ? 0 : -1;
	return openMenu(to, focus);
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || event.button !== 0) return false;
	// The press's own focus would land on the trigger after the menu took it.
	event.preventDefault();
	const p = popupFor(trigger);
	if (p) close(p);
	else openMenu(trigger, 'popup');
	return true;
}
export function click(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const p = item && popupOf(item);
	if (!item || !p) return Boolean(triggerOf(target));
	if (!enabled(item) || item.hasAttribute('data-disabled') || item.matches(OPENER)) return true;
	close(p);
	return true;
}
export function pointerover(target: Element): boolean {
	const bar = triggerOf(target);
	if (bar?.closest('[role="menubar"]') && !popupFor(bar)) {
		const open = barTriggers(bar).map((t) => popupFor(t)).find(Boolean);
		return open ? switchTo(open, bar, 'popup') : false;
	}
	const p = popupOf(target);
	if (!p || !p.popup.matches('[role="menu"]')) return false;
	watchMoves();
	if (lastMove <= p.openedAt) {
		deferred = true;
		return true;
	}
	const item = target.closest<HTMLElement>(ITEM);
	if (!item || !p.popup.contains(item)) return false;
	highlight(p, item);
	return true;
}
// useListNavigation's onPointerLeave: the pointer leaving an item for no other item unhighlights it and focuses the menu,
// unless the keys moved last.
export function pointerout(target: Element, event: PointerEvent): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const p = item && popupOf(item);
	if (!item || !p || !p.popup.matches('[role="menu"]') || event.pointerType === 'touch' || keysMoved) return false;
	const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest(ITEM) : null;
	if ((to && p.popup.contains(to)) || !item.hasAttribute('data-highlighted')) return false;
	highlight(p, undefined);
	if (p.popup.contains(document.activeElement)) p.popup.focus({ preventScroll: true });
	return true;
}
// Menubar's CompositeRoot: one Tab stop, the arrows (looping) and Home and End move it between the triggers.
function rove(bar: Element, to: HTMLElement): void {
	for (const t of bar.querySelectorAll<HTMLElement>(OPENER)) if (t.closest('[role="menubar"]') === bar) t.tabIndex = t === to ? 0 : -1;
	to.focus();
}
export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = triggerOf(target);
	const bar = trigger?.closest('[role="menubar"]');
	if (trigger && bar && !popupFor(trigger) && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
		const all = [...bar.querySelectorAll<HTMLElement>(OPENER)].filter((t) => t.closest('[role="menubar"]') === bar && enabled(t));
		const step = (event.key === 'ArrowRight') !== (getComputedStyle(bar).direction === 'rtl') ? 1 : -1;
		const at = all.indexOf(trigger);
		const to = event.key === 'Home' ? all[0] : event.key === 'End' ? all[all.length - 1] : all[(at + step + all.length) % all.length];
		if (!to) return false;
		event.preventDefault();
		rove(bar, to);
		return true;
	}
	if (trigger && !popupFor(trigger)) {
		const focus = ({ Enter: 'first', ' ': 'first', ArrowDown: 'first', ArrowUp: 'last' } as const)[event.key as 'Enter'];
		if (!focus || (event.key === 'ArrowUp' && trigger.closest('[role="menubar"]'))) return false;
		event.preventDefault();
		return openMenu(trigger, focus);
	}
	const p = popupOf(target);
	if (!p || !p.popup.matches('[role="menu"]')) return false;
	if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && p.trigger.closest('[role="menubar"]') && !target.closest(OPENER)) {
		const all = barTriggers(p.trigger);
		const step = (event.key === 'ArrowRight') !== (getComputedStyle(p.trigger).direction === 'rtl') ? 1 : -1;
		event.preventDefault();
		// Base UI's menubar opens the next menu with the menu itself focused, nothing highlighted.
		return switchTo(p, all[(all.indexOf(p.trigger) + step + all.length) % all.length], 'popup');
	}
	const list = items(p);
	const at = list.indexOf(target.closest<HTMLElement>(ITEM)!);
	const t = typing.get(p) ?? newTyping();
	typing.set(p, t);
	const typed = typeahead(t, event, list, highlightedIn(p), (i) => !visible(list[i]!));
	if (typed !== undefined) {
		highlight(p, list[typed], true);
		keysMoved = true;
		watchMoves();
		return true;
	}
	if (event.defaultPrevented) return true;
	const lo = first(list);
	const hi = last(list);
	const next = (from: number, step: 1 | -1) => {
		for (let i = from + step; i >= 0 && i < list.length; i += step) if (visible(list[i]!)) return list[i];
		return undefined;
	};
	let to: HTMLElement | undefined;
	if (event.key === 'Home') to = lo;
	else if (event.key === 'End') to = hi;
	else if (event.key === 'ArrowDown') to = at < 0 ? lo : list[at] === hi ? lo : next(at, 1);
	else if (event.key === 'ArrowUp') to = at < 0 ? hi : list[at] === lo ? hi : next(at, -1);
	if (to) {
		event.preventDefault();
		highlight(p, to, true);
		keysMoved = true;
		watchMoves();
		return true;
	}
	if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
		event.preventDefault();
		list[at]!.click();
		return true;
	}
	return false;
}
