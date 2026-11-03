import { layersFor } from '../reveal.ts';
import { markOthers } from './mark-others.ts';
import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { closesOnClick } from './menu.ts';

// Base UI ContextMenu: a right press on the trigger area opens the menu at the pointer, focused; the menu port's item
// rules (highlight, arrows, choosing closes) apply, and Escape or a press outside closes it.
const TRIGGER = ':is([data-slot="context-menu-trigger"], [data-mm-part="context-menu-trigger"]):not([data-state])';
let current: Popup | undefined;
let unmark: (() => void) | undefined;

// The menu and every submenu layer it can open: its modal FloatingFocusManager keeps the floating tree's portals outside markOthers.
function tree(portal: HTMLElement): HTMLElement[] {
	const out = [portal];
	for (let i = 0; i < out.length; i++) for (const sub of out[i]!.querySelectorAll<HTMLElement>('[aria-haspopup="menu"][data-mm-key]')) for (const n of layersFor(sub.dataset.mmKey!)) if (!out.includes(n)) out.push(n);
	return out;
}

const keyOf = (t: HTMLElement) => t.dataset.mmKey || t.id;

export function contextmenu(target: Element, event: MouseEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger) return false;
	event.preventDefault();
	if (current) close(current);
	const x = event.clientX;
	const y = event.clientY;
	const anchor = { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) };
	current = openPopup(trigger, { key: keyOf(trigger), anchor, popupSelector: '[role="menu"]', fallbackAxisSide: 'none', triggerOutside: true, onDismiss: (p) => close(p) });
	// Base UI's trigger area stays data-pressed and data-popup-open while the menu it opened is open.
	if (current) {
		trigger.setAttribute('data-pressed', '');
		trigger.setAttribute('data-popup-open', '');
		unmark = markOthers(tree(current.portal));
	}
	current?.popup.focus({ preventScroll: true });
	return Boolean(current);
}

function close(p: Popup): void {
	if (current === p) current = undefined;
	unmark?.();
	unmark = undefined;
	p.trigger.removeAttribute('data-pressed');
	p.trigger.removeAttribute('data-popup-open');
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
