import { closePopup, openPopup, popupOf } from './popup.ts';

// Base UI Popover: a press on the trigger toggles the popup, which takes focus; Escape, a press outside or a Close
// part closes it and focus returns to the trigger.
const TRIGGER = '[data-slot="popover-trigger"][data-base-ui-click-trigger]';

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger) {
		if (trigger.hasAttribute('data-popup-open')) {
			const p = [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);
			if (p) closePopup(p);
			return true;
		}
		const p = openPopup(trigger, { popupSelector: '[role="dialog"]', onDismiss: (x) => closePopup(x) });
		if (!p) return false;
		p.popup.focus({ preventScroll: true });
		return true;
	}
	const close = target.closest('[data-slot="popover-close"]');
	const p = close && popupOf(close);
	if (!p) return false;
	closePopup(p);
	return true;
}
