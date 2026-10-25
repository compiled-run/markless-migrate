import { hideOthers } from '../aria-hidden.ts';
import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { enter, exit } from './transition.ts';
import { closestTrigger, layerKey, layersFor } from '../reveal.ts';

// Base UI Dialog, AlertDialog and Drawer: a press on the trigger opens the popup with its backdrop, focus moves to the
// first tabbable element inside (a drawer's popup itself); a modal one keeps Tab inside, hides the page behind from
// assistive technology and stops it scrolling; Escape, a Close part and (not for an alert dialog) a press on the
// backdrop close it, focus back on the trigger.
const TRIGGER = '[data-base-ui-click-trigger][aria-haspopup="dialog"]';
// A plain button a page opens its dialog from (open state set on click, no ARIA) has the layer under its key.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[data-mm-key]:not([aria-haspopup]):not([data-state])', (slot) => /(dialog|sheet|drawer)-trigger$/.test(slot));
const CLOSE = '[data-slot$="dialog-close"], [data-slot="sheet-close"], [data-slot="drawer-close"], [data-slot$="dialog-cancel"]';
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const undo = new WeakMap<Popup, () => void>();
// Popover.Trigger renders Dialog.Trigger's markup; a popover's portal holds its Positioner (role=presentation, data-side).
const opensPopover = (key: string) => layersFor(key).some((n) => n.hasAttribute('data-base-ui-portal') && n.querySelector(':scope > [role="presentation"][data-side]'));

const tabbables = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => !el.closest('[hidden], [inert]') && !el.hasAttribute('data-base-ui-focus-guard') && el.getClientRects().length > 0);

function close(p: Popup): void {
	undo.get(p)?.();
	const overlay = p.portal.querySelector<HTMLElement>('[data-slot$="overlay"], [data-slot$="backdrop"]');
	if (overlay) exit(overlay, [], () => {});
	closePopup(p);
}

// @base-ui/utils useScrollLock where the browser keeps a stable scrollbar gutter: <html> keeps the gutter (scrollbar-gutter:
// stable, both edges if the page asked for them) and the element that scrolls the page stops scrolling, so nothing moves.
function lockScroll(): () => void {
	const html = document.documentElement;
	const body = document.body;
	const scrolls = (el: Element) => !['visible', 'clip'].includes(getComputedStyle(el).overflowY) || !['visible', 'clip'].includes(getComputedStyle(el).overflowX);
	const locked = scrolls(html) ? html : body;
	const gutter = getComputedStyle(html).scrollbarGutter.includes('both-edges') ? 'stable both-edges' : 'stable';
	const before = { gutter: html.style.scrollbarGutter, overflowY: locked.style.overflowY, overflowX: locked.style.overflowX };
	html.style.scrollbarGutter = gutter;
	locked.style.overflowY = 'hidden';
	locked.style.overflowX = 'hidden';
	return () => {
		html.style.scrollbarGutter = before.gutter;
		locked.style.overflowY = before.overflowY;
		locked.style.overflowX = before.overflowX;
	};
}

function open(trigger: HTMLElement): boolean {
	const p = openPopup(trigger, { popupSelector: '[role="dialog"], [role="alertdialog"]', onDismiss: (x) => close(x), outsidePress: false, anchored: false, key: trigger.id || layerKey(trigger) });
	if (!p) return false;
	const alert = p.popup.getAttribute('role') === 'alertdialog';
	// DialogPortal renders its InternalBackdrop only for modal={true}: the page behind is then inert and does not scroll.
	const modal = Boolean(p.portal.querySelector(':scope > [role="presentation"][data-base-ui-inert]:not([data-slot])'));
	const overlay = p.portal.querySelector<HTMLElement>('[data-slot$="overlay"], [data-slot$="backdrop"]');
	if (overlay) enter(overlay);
	const shown = modal ? hideOthers([p.portal]) : () => {};
	const unlock = modal ? lockScroll() : () => {};
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Tab') return;
		const list = tabbables(p.popup);
		if (!modal) {
			// FloatingPortal's focus guards: out past the last element to what follows the trigger, back past the first to it.
			const at = document.activeElement;
			if (!at || !p.popup.contains(at) || (event.shiftKey ? at !== list[0] && at !== p.popup : list.length && at !== list[list.length - 1])) return;
			event.preventDefault();
			if (event.shiftKey) trigger.focus();
			else (tabbables(document.body).find((el) => !p.portal.contains(el) && Boolean(trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? trigger).focus();
			return;
		}
		if (!list.length) {
			event.preventDefault();
			p.popup.focus({ preventScroll: true });
			return;
		}
		const first = list[0]!;
		const last = list[list.length - 1]!;
		const at = document.activeElement;
		if (event.shiftKey && (at === first || !p.popup.contains(at))) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (at === last || !p.popup.contains(at))) {
			event.preventDefault();
			first.focus();
		}
	};
	// A press on the backdrop closes a dialog; an alert dialog closes only through its own buttons or Escape.
	const onPress = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (alert || !target || p.popup.contains(target) || trigger.contains(target)) return;
		close(p);
	};
	document.addEventListener('keydown', onKey, true);
	const timer = setTimeout(() => document.addEventListener('pointerdown', onPress, true), 0);
	undo.set(p, () => {
		clearTimeout(timer);
		document.removeEventListener('keydown', onKey, true);
		document.removeEventListener('pointerdown', onPress, true);
		shown();
		unlock();
	});
	// DrawerPopup's initialFocus is the popup itself; DialogPopup's is its first tabbable element.
	(p.popup.hasAttribute('data-swipe-direction') ? p.popup : (tabbables(p.popup)[0] ?? p.popup)).focus({ preventScroll: true });
	return true;
}

export function click(target: Element): boolean {
	const trigger = triggerOf(target);
	if (trigger) {
		if (trigger.matches(TRIGGER) && opensPopover(trigger.id || layerKey(trigger))) return false;
		const p = [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);
		// useClick toggles: a press on the trigger of an open dialog (only reachable when it is not modal) closes it.
		if (p) close(p);
		else open(trigger);
		return true;
	}
	const closer = target.closest(CLOSE);
	const p = closer && popupOf(closer);
	if (!p || !undo.has(p)) return false;
	close(p);
	return true;
}
