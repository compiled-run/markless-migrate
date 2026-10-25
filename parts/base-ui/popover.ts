import { closePopup, openPopup, popupOf } from './popup.ts';
import { layerKey, layersFor } from '../reveal.ts';

// Base UI Popover: a press on the trigger toggles the popup, focus moving to its first tabbable element; Escape, a press
// outside, Tab out of it or a Close part closes it and focus returns to the trigger. Its trigger renders Dialog.Trigger's markup: what
// tells them apart is the Positioner (data-side) its portal holds.
const TRIGGER = '[data-base-ui-click-trigger][aria-haspopup="dialog"]';
const keyOf = (trigger: HTMLElement) => trigger.id || layerKey(trigger);
const positioned = (key: string) => layersFor(key).some((n) => n.hasAttribute('data-base-ui-portal') && n.querySelector(':scope > [role="presentation"][data-side]'));
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
// PopoverPopup's default initialFocus is its first tabbable element, else the popup.
const tabbablesIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.tabIndex >= 0 && !el.hasAttribute('data-base-ui-focus-guard') && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0);

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger && positioned(keyOf(trigger))) {
		if (trigger.hasAttribute('data-popup-open')) {
			const p = [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);
			if (p) closePopup(p);
			return true;
		}
		const p = openPopup(trigger, { popupSelector: '[role="dialog"]', key: keyOf(trigger), onDismiss: (x) => closePopup(x) });
		if (!p) return false;
		(tabbablesIn(p.popup)[0] ?? p.popup).focus({ preventScroll: true });
		// The popup's focus guards (previousFocusableElement, nextFocusableElement): Tab past its last element closes it
		// (closeOnFocusOut) with focus on what follows the trigger; Shift+Tab past its first goes back to the trigger.
		const onKey = (event: KeyboardEvent) => {
			const at = document.activeElement;
			if (event.key !== 'Tab' || !at || !p.popup.contains(at)) return;
			const inside = tabbablesIn(p.popup);
			if (event.shiftKey ? at !== inside[0] && at !== p.popup : inside.length && at !== inside[inside.length - 1]) return;
			event.preventDefault();
			if (event.shiftKey) {
				trigger.focus();
				return;
			}
			const next = tabbablesIn(document.body).find((el) => !p.portal.contains(el) && Boolean(trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
			closePopup(p, false);
			(next ?? trigger).focus();
		};
		document.addEventListener('keydown', onKey, true);
		p.cleanup.push(() => document.removeEventListener('keydown', onKey, true));
		return true;
	}
	const close = target.closest('[data-slot="popover-close"]');
	const p = close && popupOf(close);
	if (!p) return false;
	closePopup(p);
	return true;
}
