import { focusItem, itemsOf, navigate, typeahead, typing } from './collection.ts';
import { holdPressed, keyboardModality, setModality } from './interactions.ts';
import { closeOverlay, openOverlay, overlayFor, overlayOf, type Overlay } from './overlay.ts';

// React Aria's MenuTrigger and Menu (useMenuTrigger, useMenu, useMenuItem): a mouse press on the trigger opens the menu
// with focus on the menu itself; Enter, Space and ArrowDown open it on the first item, ArrowUp on the last. In the menu,
// hovering an item focuses it (unless the keyboard is in use), releasing a press on one runs it, arrows (wrapping),
// Home/End, PageUp/PageDown and typeahead move focus, Enter and Space run the focused item. Running an item closes the
// menu, except a checkbox item, which toggles in place; a radio item becomes the group's one checked item.
const TRIGGER = '[data-rac][aria-haspopup="true"]:not([role^="menuitem"]), [data-rac][aria-haspopup="menu"]:not([role^="menuitem"])';
const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
// A SubmenuTrigger's item, and a context menu's pressable area (MenuTrigger with trigger="contextMenu").
const SUB = '[role^="menuitem"][aria-haspopup="menu"]';
const ours = (o: Overlay) => o.trigger.matches(`${TRIGGER}, ${SUB}, ${AREA}`);

const menuOf = (o: Overlay) => o.content.querySelector<HTMLElement>('[role="menu"]');
const disabled = (el: Element) => el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled');

function setChecked(item: HTMLElement, on: boolean): void {
	item.setAttribute('aria-checked', String(on));
	if (on) item.setAttribute('data-selected', 'true');
	else item.removeAttribute('data-selected');
	// The check, rendered hidden by the converter in every item that had none (convert's racIndicators).
	for (const icon of item.querySelectorAll<HTMLElement>('[data-mm-indicator]')) icon.toggleAttribute('hidden', !on);
}

/** Runs an item; returns whether the menu closes, as useMenuItem's onClick decides. */
function run(item: HTMLElement, by: 'keyboard-enter' | 'keyboard-space' | 'pointer'): boolean {
	const role = item.getAttribute('role');
	if (role === 'menuitemcheckbox') setChecked(item, item.getAttribute('aria-checked') !== 'true');
	else if (role === 'menuitemradio') {
		const group = item.closest('[role="group"]') ?? item.closest('[role="menu"]')!;
		for (const other of group.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) setChecked(other, other === item);
	}
	item.dispatchEvent(new CustomEvent('mmaction', { bubbles: true }));
	const multiple = item.getAttribute('data-selection-mode') === 'multiple';
	if (by === 'keyboard-enter') return true;
	if (by === 'keyboard-space') return role === 'menuitem';
	return !multiple;
}

function close(o: Overlay, keepFocus = false): void {
	for (const sub of o.content.querySelectorAll<HTMLElement>(`${SUB}[aria-expanded="true"]`)) {
		const open = overlayFor(sub);
		if (open) close(open, true);
	}
	holdPressed(o.trigger, false);
	if (o.trigger.matches(SUB)) o.trigger.removeAttribute('data-open');
	closeOverlay(o, keepFocus);
}

/** Running an item closes every menu up from it (state.closeAll). */
function closeAll(o: Overlay): void {
	let at: Overlay | undefined = o;
	const chain: Overlay[] = [];
	while (at) {
		chain.push(at);
		at = at.trigger.matches(SUB) ? overlayOf(at.trigger) : undefined;
	}
	for (const x of chain) close(x, x !== chain[chain.length - 1]);
}

// useSubmenuTrigger: a hover opens the submenu after 200 ms; a key or a keyboard press opens it on its first item.
const opening = new WeakMap<Element, ReturnType<typeof setTimeout>>();
function openSub(item: HTMLElement, strategy: 'first' | null): void {
	clearTimeout(opening.get(item));
	if (overlayFor(item) || disabled(item)) return;
	const o = openOverlay(item, item.id, { modal: false, dismissable: false, placement: 'end top', offset: 0, crossOffset: -3, onDismiss: (x) => close(x), onReady: (x) => ready(x, strategy) });
	if (!o) return;
	item.setAttribute('data-open', 'true');
	const menu = item.closest<HTMLElement>('[role="menu"]');
	if (menu) safePath(o, menu);
}

// useSafelyMouseToSubmenu: while the pointer heads for the open submenu, its parent menu takes no pointer events.
function safePath(o: Overlay, menu: HTMLElement): void {
	const ALLOWED = 2;
	const PAD = Math.PI / 12;
	let prev: { x: number; y: number } | undefined;
	let side: 'left' | 'right' | undefined;
	let count = ALLOWED;
	let last = 0;
	let blocked = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let autoClose: ReturnType<typeof setTimeout> | undefined;
	const block = (on: boolean) => {
		blocked = on;
		menu.style.pointerEvents = on ? 'none' : '';
	};
	const reset = () => {
		block(false);
		count = ALLOWED;
		prev = undefined;
	};
	const move = (event: PointerEvent) => {
		if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
		if (keyboardModality()) return reset();
		const now = Date.now();
		if (now - last < 50) return;
		clearTimeout(timer);
		clearTimeout(autoClose);
		const { clientX: x, clientY: y } = event;
		if (!prev) {
			prev = { x, y };
			return;
		}
		const r = o.content.getBoundingClientRect();
		side ??= x > r.right ? 'left' : 'right';
		const m = menu.getBoundingClientRect();
		if (x < m.left || x > m.right || y < m.top || y > m.bottom) return reset();
		const toX = side === 'right' ? r.left - prev.x : prev.x - r.right;
		const top = Math.atan2(prev.y - r.top, toX) + PAD;
		const bottom = Math.atan2(prev.y - r.bottom, toX) - PAD;
		const angle = Math.atan2(prev.y - y, side === 'left' ? -(x - prev.x) : x - prev.x);
		const towards = angle < top && angle > bottom;
		count = towards ? Math.min(count + 1, ALLOWED) : Math.max(count - 1, 0);
		block(count >= ALLOWED);
		last = now;
		prev = { x, y };
		if (towards)
			timer = setTimeout(() => {
				reset();
				autoClose = setTimeout(() => {
					const under = document.elementFromPoint(x, y);
					if (under && menu.contains(under)) under.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true }));
				}, 100);
			}, 1000);
	};
	// A press while the menu lets the pointer through would land behind it.
	const down = (event: PointerEvent) => blocked && event.preventDefault();
	window.addEventListener('pointermove', move);
	window.addEventListener('pointerdown', down, true);
	o.cleanup.push(() => {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerdown', down, true);
		clearTimeout(timer);
		clearTimeout(autoClose);
		block(false);
	});
}
function closeSubsOf(menu: Element, except?: Element): void {
	for (const sub of menu.querySelectorAll<HTMLElement>(`${SUB}[aria-expanded="true"]`)) {
		if (sub === except || sub.closest('[role="menu"]') !== menu) continue;
		const open = overlayFor(sub);
		if (open) close(open, true);
	}
}

function openMenu(trigger: HTMLElement, strategy: 'first' | 'last' | null, at?: { x: number; y: number }): boolean {
	if (trigger.hasAttribute('disabled') || trigger.hasAttribute('data-disabled')) return false;
	const anchor = at ? { element: trigger, getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0) } : undefined;
	const o = openOverlay(trigger, trigger.id, { modal: true, placement: 'bottom start', offset: 8, anchor, onDismiss: (x) => close(x), onReady: (x) => ready(x, strategy) });
	if (!o) return false;
	holdPressed(trigger, true);
	return true;
}

function ready(o: Overlay, strategy: 'first' | 'last' | null): void {
	const menu = menuOf(o);
	if (!menu) return;
	const list = itemsOf(menu);
	const target = strategy === 'first' ? list[0] : strategy === 'last' ? list[list.length - 1] : undefined;
	if (target) focusItem(menu, target);
	// A submenu the pointer opened leaves focus on its item until the pointer enters it.
	else if (!o.trigger.matches(SUB)) menu.focus({ preventScroll: true });
	const onUp = (event: PointerEvent) => {
		const item = (event.target as Element | null)?.closest?.<HTMLElement>(ITEM);
		if (!item || !menu.contains(item) || disabled(item)) return;
		if (item.matches(SUB)) return openSub(item, null);
		if (run(item, 'pointer')) closeAll(o);
	};
	document.addEventListener('pointerup', onUp, true);
	o.cleanup.push(() => document.removeEventListener('pointerup', onUp, true));
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || event.button !== 0 || event.pointerType === 'touch') return false;
	event.preventDefault();
	const o = overlayFor(trigger);
	if (o) close(o);
	else openMenu(trigger, null);
	return true;
}

export function click(target: Element, event: MouseEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger) {
		if ((event as PointerEvent).pointerType === 'touch') {
			const o = overlayFor(trigger);
			if (o) close(o);
			else openMenu(trigger, null);
		}
		return true;
	}
	return false;
}

// MenuTrigger with trigger="contextMenu": a right click (or Ctrl+click) on its pressable area opens the menu at the
// pointer; its layer is keyed by the area's id.
const AREA = '[role="button"][data-react-aria-pressable][id]:not([data-rac])';
export function contextmenu(target: Element, event: MouseEvent): boolean {
	const area = target.closest<HTMLElement>(AREA);
	if (!area || !document.querySelector(`[data-mm-layer="${CSS.escape(area.id)}"], template[data-mm-layer-keys~="${CSS.escape(area.id)}"]`)) return false;
	event.preventDefault();
	const o = overlayFor(area);
	if (o) close(o, true);
	openMenu(area, null, { x: event.clientX, y: event.clientY });
	return true;
}

export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const o = item && overlayOf(item);
	if (!item || !o || !ours(o) || disabled(item)) return false;
	const menu = menuOf(o);
	if (menu && !keyboardModality() && document.activeElement !== item) {
		focusItem(menu, item);
		// Focus moving to another item of the parent menu closes its open submenu.
		closeSubsOf(menu, item);
	}
	if (item.matches(SUB) && !overlayFor(item) && !opening.has(item)) {
		opening.set(item, setTimeout(() => {
			opening.delete(item);
			if (item.matches(':hover')) openSub(item, null);
		}, 200));
	}
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger && !overlayFor(trigger)) {
		if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			setModality('keyboard');
			return openMenu(trigger, event.key === 'ArrowUp' ? 'last' : 'first');
		}
		return false;
	}
	const o = overlayOf(target);
	if (!o || !ours(o)) return false;
	const menu = menuOf(o);
	if (!menu || !menu.contains(target)) return false;
	const item = target.closest<HTMLElement>(ITEM) ?? undefined;
	const rtl = getComputedStyle(menu).direction === 'rtl';
	const inward = rtl ? 'ArrowLeft' : 'ArrowRight';
	const outward = rtl ? 'ArrowRight' : 'ArrowLeft';
	if (item?.matches(SUB) && (event.key === inward || event.key === 'Enter' || event.key === ' ')) {
		event.preventDefault();
		openSub(item, 'first');
		const sub = overlayFor(item);
		const subMenu = sub && menuOf(sub);
		if (subMenu) focusItem(subMenu, itemsOf(subMenu)[0]);
		return true;
	}
	// Hovering opened the submenu of the focused item: the outward arrow closes it, focus staying on the item.
	const openSubOf = item?.matches(SUB) ? overlayFor(item) : undefined;
	if (event.key === outward && openSubOf) {
		event.preventDefault();
		close(openSubOf);
		return true;
	}
	if (event.key === outward && o.trigger.matches(SUB)) {
		event.preventDefault();
		close(o);
		return true;
	}
	if (event.key === 'Tab') {
		event.preventDefault();
		return true;
	}
	let to = navigate(menu, event, item);
	// useMenu's shouldFocusWrap: past the last item is the first, before the first the last.
	const list = itemsOf(menu);
	if (item && to === item && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) to = event.key === 'ArrowDown' ? list[0] : list[list.length - 1];
	if (to) {
		event.preventDefault();
		focusItem(menu, to);
		return true;
	}
	if (item && !disabled(item) && (event.key === 'Enter' || (event.key === ' ' && !typing(menu)))) {
		event.preventDefault();
		if (run(item, event.key === 'Enter' ? 'keyboard-enter' : 'keyboard-space')) closeAll(o);
		return true;
	}
	if (!event.ctrlKey && !event.metaKey && !event.altKey) {
		const found = typeahead(menu, event.key, item);
		if (found) {
			event.preventDefault();
			focusItem(menu, found);
			return true;
		}
	}
	return false;
}
