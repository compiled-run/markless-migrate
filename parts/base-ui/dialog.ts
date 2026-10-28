import { hideOthers } from '../aria-hidden.ts';
import { acquireScrollLock, closePopup, isOpen, openPopup, popupOf, setTrigger, top, type Popup } from './popup.ts';
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

// Chrome makes a scroll container with nothing focusable inside a Tab stop, so it can be where Tab leaves the popup.
const scroller = (el: HTMLElement) => {
	const { overflowX, overflowY } = getComputedStyle(el);
	return /auto|scroll/.test(overflowX + overflowY) && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) && !el.querySelector(TABBABLE);
};
const tabbables = (root: HTMLElement, scrollers = true) => [...root.querySelectorAll<HTMLElement>(scrollers ? '*' : TABBABLE)].filter((el) => (el.matches(TABBABLE) || scroller(el)) && !el.closest('[hidden], [inert]') && !el.hasAttribute('data-base-ui-focus-guard') && el.getClientRects().length > 0);

function close(p: Popup, returnFocus = true): void {
	undo.get(p)?.();
	// onOpenChange(false): the page's own state about the dialog (a field it clears) hears it closing.
	p.popup.dispatchEvent(new CustomEvent('mmclose', { bubbles: true }));
	const overlay = p.portal.querySelector<HTMLElement>('[data-slot$="overlay"], [data-slot$="backdrop"]');
	if (overlay) exit(overlay, [], () => {});
	closePopup(p, returnFocus);
}

function open(trigger: HTMLElement, { shown, rendered, key = trigger.id || layerKey(trigger) }: { readonly shown?: HTMLElement; readonly rendered?: HTMLElement; readonly key?: string } = {}): Popup | undefined {
	const p = openPopup(trigger, { popupSelector: '[role="dialog"], [role="alertdialog"]', onDismiss: (x) => close(x), outsidePress: false, anchored: false, key: shown ? `shown:${shown.id || 'dialog'}` : rendered ? `rendered:${rendered.id}` : key, portal: shown ?? rendered, shown: Boolean(shown) });
	if (!p) return undefined;
	const alert = p.popup.getAttribute('role') === 'alertdialog';
	// disablePointerDismissal (convert reads it per instance; always set for an alert dialog): no outside-press or focus-out close.
	const dismissible = !alert && trigger.getAttribute('data-mm-disable-pointer-dismissal') !== 'true';
	// DialogPortal renders its InternalBackdrop only for modal={true}: the page behind is then inert and does not scroll.
	const modal = Boolean(p.portal.querySelector(':scope > [role="presentation"][data-base-ui-inert]:not([data-slot])'));
	const overlay = p.portal.querySelector<HTMLElement>('[data-slot$="overlay"], [data-slot$="backdrop"]');
	if (overlay && !shown) enter(overlay);
	// Open at load, the page came with the marks markOthers left on everything else; they are taken again, so they go on close.
	if (shown) for (const el of document.querySelectorAll('[data-base-ui-inert]')) if (!p.portal.contains(el)) {
		el.removeAttribute('data-base-ui-inert');
		el.removeAttribute('aria-hidden');
		el.removeAttribute('inert');
	}
	const others = modal ? hideOthers([p.portal]) : () => {};
	const unlock = modal ? acquireScrollLock() : () => {};
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Tab') return;
		const list = tabbables(p.popup);
		if (!modal) {
			// FloatingPortal's focus guards: out past the last element to what follows the trigger, back past the first to it.
			const at = document.activeElement;
			if (!at || !p.popup.contains(at) || (event.shiftKey ? at !== list[0] && at !== p.popup : list.length && at !== list[list.length - 1])) return;
			event.preventDefault();
			if (event.shiftKey) trigger.focus();
			else {
				(tabbables(document.body, false).find((el) => !p.portal.contains(el) && Boolean(trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? trigger).focus();
				if (dismissible) close(p, false);
			}
			return;
		}
		if (!list.length) {
			event.preventDefault();
			p.popup.focus({ preventScroll: true });
			return;
		}
		// The guards act only where Tab would leave the popup, and wrap to the tabbable content's ends, never a scroller.
		const content = tabbables(p.popup, false);
		const at = document.activeElement;
		if (event.shiftKey && (at === list[0] || at === p.popup || !p.popup.contains(at))) {
			event.preventDefault();
			(content[content.length - 1] ?? list[list.length - 1]!).focus();
		} else if (!event.shiftKey && (at === list[list.length - 1] || !p.popup.contains(at))) {
			event.preventDefault();
			(content[0] ?? list[0]!).focus();
		}
	};
	// A press on the backdrop, or anywhere outside a non-modal one, closes it.
	const onPress = (event: PointerEvent) => {
		const target = event.target as Node | null;
		// A popup opened on top of it (a select inside a drawer) is part of its floating tree: its own press handling answers.
		if (!dismissible || !target || p.popup.contains(target) || trigger.contains(target) || top() !== p) return;
		close(p);
	};
	document.addEventListener('keydown', onKey, true);
	const timer = setTimeout(() => document.addEventListener('pointerdown', onPress, true), 0);
	undo.set(p, () => {
		clearTimeout(timer);
		document.removeEventListener('keydown', onKey, true);
		document.removeEventListener('pointerdown', onPress, true);
		others();
		unlock();
	});
	if (shown) return p;
	// DrawerPopup's initialFocus is the popup itself; DialogPopup's is its first tabbable element.
	(p.popup.hasAttribute('data-swipe-direction') ? p.popup : (tabbables(p.popup, false)[0] ?? p.popup)).focus({ preventScroll: true });
	return p;
}

export function click(target: Element): boolean {
	const trigger = triggerOf(target);
	if (trigger) {
		if (trigger.matches(TRIGGER) && opensPopover(trigger.id || layerKey(trigger))) return false;
		const p = [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);
		// useClick toggles: a press on the trigger of an open dialog (only reachable when it is not modal) closes it.
		if (p) close(p);
		// A plain button whose layer is no Base UI portal (a Radix dialog's) is another port's.
		else if (!open(trigger) && !trigger.matches(TRIGGER)) return false;
		return true;
	}
	const closer = target.closest(CLOSE);
	if (closer) adoptShown();
	const p = closer && popupOf(closer);
	if (!p || !undo.has(p)) return false;
	close(p);
	return true;
}

/** A dialog a site component renders itself (its portal in the page, hidden until used), opened from `trigger` as a converted one opens. */
export function openRendered(trigger: HTMLElement, portal: HTMLElement): boolean {
	return Boolean(open(trigger, { rendered: portal }));
}

export function closeRendered(portal: HTMLElement): void {
	const p = popupOf(portal);
	if (p && undo.has(p)) close(p);
}

/** A dialog the page shows open when it loads (a welcome dialog its state opened on mount) is taken as open, so its Close, Escape and backdrop close it. */
function adoptShown(): void {
	for (const portal of document.querySelectorAll<HTMLElement>('[data-base-ui-portal]:not([hidden])')) {
		if (popupOf(portal)) continue;
		const popup = portal.querySelector<HTMLElement>('[role="dialog"][data-open], [role="alertdialog"][data-open]');
		if (popup && !popup.closest('[hidden]')) open(document.createElement('button'), { shown: portal });
	}
}

export function idle(): void {
	adoptShown();
}

/**
 * A dialog the page opens itself (its open prop): focus goes back where it was when it closes, as Base UI's
 * FloatingFocusManager returns it; a trigger the page has for it shows it open meanwhile.
 */
export function show(key: string): boolean {
	if (isOpen(key)) return false;
	const at = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
	// Opened from a menu item: the menu closes first and gives focus back to its trigger, where the dialog returns it.
	const before = (at && popupOf(at)?.trigger) || at;
	const stand = document.createElement('button');
	stand.focus = (options?: FocusOptions) => before?.focus(options);
	const p = open(stand, { key });
	if (!p) return false;
	const trigger = document.getElementById(key);
	if (trigger?.matches(TRIGGER)) {
		setTrigger(trigger, true);
		const done = undo.get(p);
		undo.set(p, () => {
			done?.();
			setTrigger(trigger, false);
		});
	}
	return true;
}

/** Closes the dialog of a layer key, as its open prop turning false does. */
export function hide(key: string): boolean {
	const portal = layersFor(key).find((n) => n.hasAttribute('data-base-ui-portal'));
	const p = portal && popupOf(portal);
	if (!p || !undo.has(p)) return false;
	close(p);
	return true;
}

export const shown = (key: string): boolean => isOpen(key);
