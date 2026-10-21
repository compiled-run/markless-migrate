import { hideOthers } from '../aria-hidden.ts';
import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { enter, exit } from './transition.ts';

// Base UI Dialog, AlertDialog and Drawer (modal): a press on the trigger opens the popup with its backdrop, focus moves
// to the first tabbable element inside and Tab stays inside, the page behind is hidden from assistive technology and
// does not scroll; Escape, a Close part and (not for an alert dialog) a press on the backdrop close it, focus back on
// the trigger.
const TRIGGER = '[data-base-ui-click-trigger][aria-haspopup="dialog"]';
const CLOSE = '[data-slot$="dialog-close"], [data-slot="sheet-close"], [data-slot="drawer-close"], [data-slot$="dialog-cancel"]';
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const undo = new WeakMap<Popup, () => void>();

const tabbables = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => !el.closest('[hidden], [inert]') && !el.hasAttribute('data-base-ui-focus-guard') && el.getClientRects().length > 0);

function close(p: Popup): void {
	undo.get(p)?.();
	const overlay = p.portal.querySelector<HTMLElement>('[data-slot$="overlay"], [data-slot$="backdrop"]');
	if (overlay) exit(overlay, [], () => {});
	closePopup(p);
}

function open(trigger: HTMLElement): boolean {
	const p = openPopup(trigger, { popupSelector: '[role="dialog"], [role="alertdialog"]', onDismiss: (x) => close(x), outsidePress: false, anchored: false });
	if (!p) return false;
	const alert = p.popup.getAttribute('role') === 'alertdialog';
	const overlay = p.portal.querySelector<HTMLElement>('[data-slot$="overlay"], [data-slot$="backdrop"]');
	if (overlay) enter(overlay);
	const shown = hideOthers([p.portal]);
	const root = document.documentElement;
	const gap = window.innerWidth - root.clientWidth;
	const before = { overflow: root.style.overflow, padding: root.style.paddingRight };
	root.style.overflow = 'hidden';
	if (gap > 0) root.style.paddingRight = `${gap}px`;
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Tab') return;
		const list = tabbables(p.popup);
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
		root.style.overflow = before.overflow;
		root.style.paddingRight = before.padding;
	});
	(tabbables(p.popup)[0] ?? p.popup).focus({ preventScroll: true });
	return true;
}

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger) {
		const p = [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);
		if (p) return true;
		return open(trigger);
	}
	const closer = target.closest(CLOSE);
	const p = closer && popupOf(closer);
	if (!p || !undo.has(p)) return false;
	close(p);
	return true;
}
