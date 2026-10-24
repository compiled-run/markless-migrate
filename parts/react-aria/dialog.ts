import { layersFor } from '../reveal.ts';
import { holdPressed } from './interactions.ts';
import { closeOverlay, openOverlay, overlayFor, overlayOf, type Overlay } from './overlay.ts';

// React Aria's DialogTrigger with a Popover or a Modal (useOverlayTrigger, usePopover, useModalOverlay, useDialog): a
// press on the trigger toggles it, the trigger held pressed while it is open; the dialog takes focus and keeps Tab
// inside (FocusScope contain); Escape closes it, and so does a press outside it when it is dismissable (React Aria
// renders its visually hidden Dismiss button only then); a button in it with slot="close" closes it.
const TRIGGER = '[data-rac][aria-expanded]:not([aria-haspopup]):not([role])';
// A Modal's trigger React Aria leaves unmarked (no aria-expanded, never held pressed): its layer must be a modal's.
const PLAIN = 'button[data-rac]:not([aria-expanded]):not([aria-haspopup]):not([role])';
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const hasOverlay = (trigger: HTMLElement) => trigger.id !== '' && layersFor(trigger.id).some((n) => n.matches('[data-trigger], [data-slot$="-overlay"]') || n.querySelector('[data-trigger="DialogTrigger"], [data-slot$="-overlay"]'));
const modalLayer = (trigger: HTMLElement) => trigger.id !== '' && layersFor(trigger.id).some((n) => n.matches('[data-slot$="-overlay"]') || n.querySelector('[data-trigger="DialogTrigger"], [data-slot$="-overlay"]'));
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? (() => {
	const plain = target.closest<HTMLElement>(PLAIN);
	return plain && modalLayer(plain) ? plain : null;
})();
const dialogOf = (o: Overlay) => (o.surface.matches('[role="dialog"], [role="alertdialog"]') ? o.surface : o.surface.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]')) ?? o.surface;
const tabbables = (root: Element) => [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest('[style*="clip"]'));

function close(o: Overlay): void {
	holdPressed(o.trigger, false);
	closeOverlay(o);
}

function openDialog(trigger: HTMLElement): boolean {
	const nodes = layersFor(trigger.id);
	const surface = nodes.map((n) => (n.matches('[data-trigger], [data-slot$="-overlay"]') ? n : n.querySelector<HTMLElement>('[data-trigger], [data-slot$="-overlay"]'))).find(Boolean);
	const dismissable = !!surface?.querySelector('button[aria-label="Dismiss"][tabindex="-1"]');
	const marked = trigger.matches(TRIGGER);
	// The dialog takes focus, unless a search field in it does (a command palette's input, autoFocus in the source).
	const onReady = (x: Overlay) => (dialogOf(x).querySelector<HTMLElement>('input[data-rac][aria-autocomplete="list"]') ?? dialogOf(x)).focus({ preventScroll: true });
	const o = openOverlay(trigger, trigger.id, { modal: true, placement: 'bottom', offset: 8, dismissable, markTrigger: marked, onDismiss: (x) => close(x), onReady });
	if (!o) return false;
	if (marked) holdPressed(trigger, true);
	return true;
}

export function click(target: Element): boolean {
	const closer = target.closest<HTMLElement>('[slot="close"]');
	const within = closer && overlayOf(closer);
	if (closer && within && !closer.hasAttribute('disabled')) {
		close(within);
		return true;
	}
	const trigger = triggerOf(target);
	if (!trigger || trigger.hasAttribute('disabled') || !hasOverlay(trigger)) return false;
	const o = overlayFor(trigger);
	if (o) close(o);
	else openDialog(trigger);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (event.key !== 'Tab') return false;
	const o = overlayOf(target);
	if (!o || !(o.trigger.matches(TRIGGER) || (o.trigger.matches(PLAIN) && modalLayer(o.trigger)))) return false;
	const scope = dialogOf(o);
	const list = tabbables(scope);
	if (!list.length) {
		event.preventDefault();
		return true;
	}
	const at = list.indexOf(document.activeElement as HTMLElement);
	const next = event.shiftKey ? (at <= 0 ? list[list.length - 1] : list[at - 1]) : at < 0 || at === list.length - 1 ? list[0] : list[at + 1];
	event.preventDefault();
	next!.focus();
	return true;
}
