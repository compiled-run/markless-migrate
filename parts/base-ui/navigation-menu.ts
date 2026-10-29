import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';

// Base UI NavigationMenu: the pointer on a trigger opens its content after 50 ms, leaving trigger and content closes it
// after 50 ms; a press opens it, or closes what an earlier press opened; the pointer on another trigger switches to it.
// The open menu marks its root, list and content data-open, the content data-activation-direction on a switch, and its
// trigger aria-expanded, data-popup-open and data-pressed. From the keyboard (NavigationMenuTrigger, its focus guards and
// the CompositeRoots of the list and the content): Enter, Space or ArrowDown opens the content with focus at its start,
// Tab from the open trigger enters it, Tab past its last link goes on after the trigger, Shift+Tab from its first goes
// back to the trigger, Escape closes it with focus back on the trigger; the side arrows move between the list's items
// (no wrap) and every arrow between the content's links (wrapping).
const TRIGGER = '[data-base-ui-navigation-menu-trigger]';
const LIST_ITEMS = `${TRIGGER}, a[data-slot="navigation-menu-link"]`;
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DELAY = 50;
let current: Popup | undefined;
let timer: number | undefined;
let pressed = false;

const keyOf = (t: HTMLElement) => t.getAttribute('data-mm-key') ?? t.id;
const triggersOf = (t: HTMLElement) => [...(t.closest('[data-slot="navigation-menu"]')?.querySelectorAll<HTMLElement>(TRIGGER) ?? [])];

function mark(trigger: HTMLElement, on: boolean): void {
	const root = trigger.closest<HTMLElement>('[data-slot="navigation-menu"]');
	for (const el of [root, root?.querySelector<HTMLElement>(':scope > [data-slot="navigation-menu-list"]')]) el?.toggleAttribute('data-open', on);
}

// The trigger's own open state (pressableTriggerOpenStateMapping, aria-expanded): popup.ts leaves a trigger without aria-haspopup.
function markTrigger(trigger: HTMLElement, on: boolean): void {
	trigger.setAttribute('aria-expanded', String(on));
	trigger.toggleAttribute('data-popup-open', on);
	trigger.toggleAttribute('data-pressed', on);
	if (!on) trigger.removeAttribute('aria-controls');
}

const tabbablesIn = (root: Element) => [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => !el.hasAttribute('data-base-ui-focus-guard') && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0);
const rtl = (el: Element) => getComputedStyle(el).direction === 'rtl';

function show(trigger: HTMLElement): void {
	if (current?.trigger === trigger) return;
	const from = current?.trigger;
	if (current) hide(true);
	pressed = false;
	const p = openPopup(trigger, { popupSelector: ':scope > [role="presentation"] > nav', key: keyOf(trigger), sideOffset: 8, fallbackAxisSide: 'none', onDismiss: () => dismiss() });
	if (!p) return;
	current = p;
	markTrigger(trigger, true);
	if (p.popup.id) trigger.setAttribute('aria-controls', p.popup.id);
	mark(trigger, true);
	for (const content of p.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]')) {
		content.setAttribute('data-open', '');
		content.removeAttribute('data-closed');
		if (from) {
			const all = triggersOf(trigger);
			content.setAttribute('data-activation-direction', all.indexOf(trigger) > all.indexOf(from) ? 'right' : 'left');
		} else content.removeAttribute('data-activation-direction');
	}
}

function hide(switching: boolean): void {
	const p = current;
	if (!p) return;
	current = undefined;
	markTrigger(p.trigger, false);
	if (!switching) mark(p.trigger, false);
	for (const content of p.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]')) {
		content.removeAttribute('data-open');
		content.setAttribute('data-closed', '');
	}
	closePopup(p, false);
	if (switching) p.portal.hidden = true;
}

// Escape: the unmount returns focus to the trigger when it was in the popup or nowhere (handleUnmount).
function dismiss(): void {
	const p = current;
	hide(false);
	const at = document.activeElement;
	if (p && (!at || at === document.body || p.portal.contains(at))) p.trigger.focus({ preventScroll: true });
}

// Focus at the content's start: the trigger's focus guard hands it to the viewport's, which moves on to the first link.
function enter(p: Popup): void {
	(tabbablesIn(p.popup)[0] ?? p.popup).focus({ preventScroll: true });
}

function schedule(next: () => void): void {
	clearTimeout(timer);
	timer = window.setTimeout(next, DELAY);
}

const inside = (node: Node | null, trigger: HTMLElement) => Boolean(node && (trigger.contains(node) || current?.portal.contains(node)));

export function pointerover(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch') return false;
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger) {
		if (current?.trigger === trigger) clearTimeout(timer);
		else schedule(() => show(trigger));
		return true;
	}
	if (current && popupOf(target) === current) {
		clearTimeout(timer);
		return true;
	}
	return false;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch' || !current) return false;
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger !== current.trigger && popupOf(target) !== current) return false;
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	if (inside(to, current.trigger)) return true;
	if (to instanceof Element && to.closest(TRIGGER)) return true;
	schedule(() => hide(false));
	return true;
}

export function click(target: Element, event: MouseEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger) return false;
	clearTimeout(timer);
	if (current?.trigger === trigger && pressed) hide(false);
	else {
		show(trigger);
		pressed = true;
		// The click Enter or Space makes (detail 0) moves focus in, as a key on the trigger allows (allowFocusRef).
		if (event.detail === 0 && current?.trigger === trigger) enter(current);
	}
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (event.ctrlKey || event.altKey || event.metaKey) return false;
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const list = (trigger ?? target).closest('[data-slot="navigation-menu-list"]');
	if (trigger && list) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			clearTimeout(timer);
			if (current?.trigger !== trigger) show(trigger);
			if (current?.trigger === trigger) enter(current);
			return true;
		}
		if (event.key === 'Tab' && !event.shiftKey && current?.trigger === trigger) {
			event.preventDefault();
			enter(current);
			return true;
		}
	}
	if (list && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
		const items = [...list.querySelectorAll<HTMLElement>(LIST_ITEMS)];
		const at = items.indexOf(target.closest<HTMLElement>(LIST_ITEMS)!);
		if (at < 0) return false;
		const next = items[at + ((event.key === 'ArrowRight') !== rtl(list) ? 1 : -1)];
		event.preventDefault();
		next?.focus();
		return true;
	}
	const p = current;
	if (!p || !p.popup.contains(target)) return false;
	const links = tabbablesIn(p.popup);
	const at = links.indexOf(target as HTMLElement);
	if (event.key === 'Tab') {
		if (event.shiftKey ? at > 0 : at < links.length - 1) return false;
		event.preventDefault();
		if (event.shiftKey) {
			p.trigger.focus({ preventScroll: true });
			return true;
		}
		// The trigger's after-focus guard: on to what follows the trigger, closing once focus leaves the menu.
		const root = p.trigger.closest('[data-slot="navigation-menu"]');
		const next = tabbablesIn(document.body).find((el) => !p.portal.contains(el) && Boolean(p.trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
		if (!next || !root?.contains(next)) hide(false);
		(next ?? p.trigger).focus();
		return true;
	}
	if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key) || at < 0) return false;
	const forward = event.key === 'ArrowDown' || event.key === (rtl(p.popup) ? 'ArrowLeft' : 'ArrowRight');
	event.preventDefault();
	links[(at + (forward ? 1 : -1) + links.length) % links.length]?.focus();
	return true;
}
