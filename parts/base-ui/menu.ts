import { closePopup, endTyping, newTyping, openPopup, popupOf, typeahead, type Dismissal, type Popup, type Typing } from './popup.ts';

// Base UI Menu: a press on the trigger opens the menu focused (keyboard: Enter, Space, ArrowDown highlight the first
// enabled item, ArrowUp the last); arrows loop over every item, disabled ones too, Home and End go to the ends, typing
// moves to the next item starting with what was typed; choosing an item or Escape closes it, focus back on the trigger.
// A submenu opens from a 100 ms rest of the pointer on its trigger, or from the keys, on its first item.
// In a menubar, with one menu open the pointer on another trigger opens that one, and the side arrows move between menus.
// Radix's triggers carry data-state and React Aria's data-rac; Base UI's neither (generated ids are renamed, so they tell nothing).
const OPENER = '[aria-haspopup="menu"]:not([data-state]):not([data-rac])';
const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
// A submenu's trigger is an item of the menu it sits in; a menubar's triggers are menuitems too, outside any menu.
const triggerOf = (target: Element) => {
	const t = target.closest<HTMLElement>(OPENER);
	return t && !t.closest('[role="menu"]') ? t : null;
};

const subTriggerOf = (target: Element) => {
	const t = target.closest<HTMLElement>(OPENER);
	return t?.closest('[role="menu"]') ? t : null;
};
const parentOf = new WeakMap<Popup, Popup>();
const childOf = new WeakMap<Popup, Popup>();
const unblock = new WeakMap<Popup, () => void>();
const hovered = new WeakMap<Popup, HTMLElement>();
let pending: { readonly trigger: HTMLElement; readonly timer: ReturnType<typeof setTimeout> } | undefined;
const cancelPending = () => {
	clearTimeout(pending?.timer);
	pending = undefined;
};
const typing = new WeakMap<Popup, Typing>();
// Base UI highlights on mousemove: a pointerover with no move since the menu opened (Chrome's, as content appears under
// a still pointer) is answered by the next move.
let lastMove = -1;
// When a submenu the pointer left closed: what lies under the pointer then is not hovered either.
let quietSince = -1;
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
	// Focus leaving a submenu's trigger for its submenu unhighlights it.
	const parent = parentOf.get(p);
	if (parent) for (const i of items(parent)) i.removeAttribute('data-highlighted');
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
	const child = childOf.get(p);
	if (child) closeSub(child, false);
	const t = typing.get(p);
	if (t) endTyping(t);
	highlight(p, undefined);
	closePopup(p, returnFocus);
}
// The root closes as its own part closes it (a context menu's, say).
function closeTree(p: Popup, reason: Dismissal): void {
	let root = p;
	for (let up = parentOf.get(root); up; up = parentOf.get(root)) root = up;
	if (root === p) close(p);
	else root.dismiss(reason);
}
// A press in a menu the submenu opened from dismisses only the submenu.
const inTree = (sub: Popup, target: EventTarget | null | undefined) => {
	for (let up = parentOf.get(sub); up; up = parentOf.get(up)) if (target instanceof Node && (up.positioner ?? up.popup).contains(target)) return true;
	return false;
};
function closeSub(sub: Popup, onTrigger: boolean): void {
	const parent = parentOf.get(sub);
	if (!parent || childOf.get(parent) !== sub) return;
	childOf.delete(parent);
	unblock.get(sub)?.();
	const had = sub.portal.contains(document.activeElement);
	close(sub, false);
	if (onTrigger) highlight(parent, sub.trigger);
	else if (had) parent.popup.focus({ preventScroll: true });
}

// safePolygon with blockPointerEvents: in the menu only the trigger takes the pointer; leaving it away from the submenu closes it.
function blockPointer(parent: Popup, sub: Popup): void {
	// The scope is the menu the trigger is in (its [data-rootownerid] popup), not the page.
	const scope = parent.popup;
	const boxes = [sub.trigger, sub.positioner ?? sub.popup];
	for (const el of boxes) el.style.pointerEvents = 'auto';
	scope.style.pointerEvents = 'none';
	const at = sub.trigger.getBoundingClientRect();
	let exit = { x: at.left + at.width / 2, y: at.top + at.height / 2 };
	let onTrigger = true;
	const inside = (t: EventTarget | null) => t instanceof Node && (sub.trigger.contains(t) || sub.portal.contains(t));
	const towards = (x: number, y: number) => {
		const r = (sub.positioner ?? sub.popup).getBoundingClientRect();
		const near = r.left >= exit.x ? r.left : r.right;
		const [a, b, c] = [exit, { x: near, y: r.top }, { x: near, y: r.bottom }];
		const side = (p: { x: number; y: number }, q: { x: number; y: number }) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
		const [d1, d2, d3] = [side(a, b), side(b, c), side(c, a)];
		return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
	};
	const away = (event: MouseEvent, target: EventTarget | null) => {
		if (inside(target) || towards(event.clientX, event.clientY)) return;
		closeSub(sub, false);
		quietSince = event.timeStamp;
	};
	// The trigger's own leave, as Base UI's onMouseLeave starts safePolygon: it reaches the trigger whatever else takes the move.
	const onLeave = (event: MouseEvent) => {
		const r = sub.trigger.getBoundingClientRect();
		// Chrome's own boundary events as the menu's pointer-events change leave the pointer where it was.
		if (!onTrigger || (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom)) return;
		onTrigger = false;
		leaveItem(parent);
		away(event, event.relatedTarget);
	};
	const onMove = (event: PointerEvent) => {
		if (sub.trigger.contains(event.target as Node)) {
			onTrigger = true;
			exit = { x: event.clientX, y: event.clientY };
			return;
		}
		if (onTrigger) onLeave(event);
		else away(event, event.target);
	};
	sub.trigger.addEventListener('mouseout', onLeave);
	document.addEventListener('pointermove', onMove, true);
	unblock.set(sub, () => {
		unblock.delete(sub);
		document.removeEventListener('pointermove', onMove, true);
		sub.trigger.removeEventListener('mouseout', onLeave);
		for (const el of [scope, ...boxes]) el.style.removeProperty('pointer-events');
	});
}
// useListNavigation's pointer leaving an item for no other: nothing highlighted, the menu focused if it had focus.
function leaveItem(p: Popup): void {
	hovered.delete(p);
	highlight(p, undefined);
	if (p.popup.contains(document.activeElement)) p.popup.focus({ preventScroll: true });
}

function openSub(parent: Popup, trigger: HTMLElement, via: 'pointer' | 'keyboard'): boolean {
	cancelPending();
	const open = childOf.get(parent);
	if (open?.trigger === trigger) {
		if (via === 'keyboard') highlight(open, first(items(open)));
		return true;
	}
	if (open) closeSub(open, false);
	const key = trigger.dataset.mmKey;
	if (!key || !enabled(trigger)) return false;
	const sub = openPopup(trigger, { key, popupSelector: '[role="menu"]', pressable: false, lockScroll: false, onDismiss: (x, reason, event) => (reason === 'escape' ? closeSub(x, true) : reason === 'outside' && inTree(x, event?.target) ? closeSub(x, false) : closeTree(x, reason)) });
	if (!sub) return false;
	parentOf.set(sub, parent);
	childOf.set(parent, sub);
	parent.cleanup.push(() => closeSub(sub, false));
	typing.set(sub, newTyping());
	highlight(sub, undefined);
	if (via === 'keyboard') highlight(sub, first(items(sub), (i) => !enabled(i)));
	else blockPointer(parent, sub);
	return true;
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
export function click(target: Element, event?: MouseEvent): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const p = item && popupOf(item);
	if (!item || !p) return Boolean(triggerOf(target));
	if (!enabled(item) || item.hasAttribute('data-disabled')) return true;
	if (item.matches(OPENER)) {
		// useClick with ignoreMouse (openOnHover): a mouse or pen press leaves opening to the hover rest.
		const pointer = event instanceof PointerEvent ? event.pointerType : undefined;
		if (pointer !== 'mouse' && pointer !== 'pen') openSub(p, item, 'pointer');
		return true;
	}
	if (closesOnClick(item)) closeTree(p, 'item');
	return true;
}

/** An item's closeOnClick: its instance's (convert writes it), else Menu.Item's true and Menu.CheckboxItem's and Menu.RadioItem's false. */
export function closesOnClick(item: Element): boolean {
	const own = item.getAttribute('data-mm-close-on-click');
	return own === null || own === '' ? !item.matches('[role="menuitemradio"], [role="menuitemcheckbox"]') : own !== 'false';
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
	if (lastMove <= Math.max(p.openedAt, quietSince)) {
		deferred = true;
		return true;
	}
	const item = target.closest<HTMLElement>(ITEM);
	if (!item || !p.popup.contains(item)) return false;
	hovered.set(p, item);
	highlight(p, item);
	const open = childOf.get(p);
	if (open && open.trigger !== item) closeSub(open, false);
	if (item.matches(OPENER) && open?.trigger !== item && pending?.trigger !== item) {
		cancelPending();
		pending = { trigger: item, timer: setTimeout(() => hovered.get(p) === item && openSub(p, item, 'pointer'), 100) };
	} else if (!item.matches(OPENER)) cancelPending();
	return true;
}
// useListNavigation's onPointerLeave: the pointer leaving an item for no other item unhighlights it and focuses the menu,
// unless the keys moved last.
export function pointerout(target: Element, event: PointerEvent): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const p = item && popupOf(item);
	if (!item || !p || !p.popup.matches('[role="menu"]') || event.pointerType === 'touch' || keysMoved) return false;
	const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
	const to = related?.closest(ITEM);
	if (to && p.popup.contains(to)) return false;
	// A popup that opened under the still pointer (a submenu, before its placement lands) is not where it went.
	const under = related && popupOf(related);
	if (under && under !== p && lastMove <= under.openedAt) return false;
	if (pending?.trigger === item) cancelPending();
	if (!item.hasAttribute('data-highlighted')) return false;
	leaveItem(p);
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
	const rtl = getComputedStyle(p.popup).direction === 'rtl';
	const sub = subTriggerOf(target);
	if (sub && p.popup.contains(sub) && [rtl ? 'ArrowLeft' : 'ArrowRight', 'Enter', ' '].includes(event.key) && !(event.key === ' ' && typing.get(p)?.typing)) {
		event.preventDefault();
		openSub(p, sub, 'keyboard');
		return true;
	}
	if (parentOf.has(p) && (event.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || event.key === 'Tab')) {
		event.preventDefault();
		closeSub(p, true);
		return true;
	}
	// A context menu's root is nested in its trigger area: useListNavigation's close key closes it too.
	if (!parentOf.has(p) && !p.trigger.matches(OPENER) && event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) {
		event.preventDefault();
		highlight(p, undefined);
		p.dismiss('escape');
		return true;
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
