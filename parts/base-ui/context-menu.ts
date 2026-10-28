import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { closesOnClick } from './menu.ts';

// Base UI ContextMenu: a right press on the trigger area opens the menu at the pointer, focused; the menu port's item
// rules (highlight, arrows, choosing closes) apply, and Escape or a press outside closes it.
const TRIGGER = '[data-slot="context-menu-trigger"]:not([data-state])';
let current: Popup | undefined;

const keyOf = (t: HTMLElement) => t.dataset.mmKey || t.id;

export function contextmenu(target: Element, event: MouseEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger) return false;
	event.preventDefault();
	if (current) closePopup(current, false);
	const x = event.clientX;
	const y = event.clientY;
	const anchor = { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) };
	current = openPopup(trigger, { key: keyOf(trigger), anchor, popupSelector: '[role="menu"]', fallbackAxisSide: 'none', onDismiss: (p) => close(p) });
	// Base UI's trigger area stays data-pressed while the menu it opened is open.
	if (current) trigger.setAttribute('data-pressed', '');
	current?.popup.focus({ preventScroll: true });
	return Boolean(current);
}

function close(p: Popup): void {
	if (current === p) current = undefined;
	p.trigger.removeAttribute('data-pressed');
	closePopup(p, false);
}

export function click(target: Element): boolean {
	const item = target.closest('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]');
	const p = item && popupOf(item);
	// A submenu's trigger opens its submenu (the menu port) instead of choosing.
	if (!item || !p || p !== current || item.hasAttribute('data-disabled') || item.matches('[aria-haspopup="menu"]')) return false;
	if (closesOnClick(item)) close(p);
	return true;
}
