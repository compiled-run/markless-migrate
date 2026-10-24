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
	holdPressed(o.trigger, false);
	closeOverlay(o, keepFocus);
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
	else menu.focus({ preventScroll: true });
	const onUp = (event: PointerEvent) => {
		const item = (event.target as Element | null)?.closest?.<HTMLElement>(ITEM);
		if (!item || !menu.contains(item) || disabled(item) || item.hasAttribute('aria-haspopup')) return;
		if (run(item, 'pointer')) close(o);
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
	if (!item || !o || !o.trigger.matches(TRIGGER) || disabled(item)) return false;
	const menu = menuOf(o);
	if (menu && !keyboardModality() && document.activeElement !== item) focusItem(menu, item);
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
	if (!o || !o.trigger.matches(TRIGGER)) return false;
	const menu = menuOf(o);
	if (!menu || !menu.contains(target)) return false;
	const item = target.closest<HTMLElement>(ITEM) ?? undefined;
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
		if (run(item, event.key === 'Enter' ? 'keyboard-enter' : 'keyboard-space')) close(o);
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
