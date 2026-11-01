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

// A switch keeps one popup on screen, as Base UI's single popup does: the new one starts where the old one stood, at its
// size, and moves and resizes to its own place (0.35 s); the old one stays over it with its frame cleared while its
// content leaves through data-ending-style and the new content enters through data-starting-style.
let leaving: (() => void) | undefined;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function morph(from: Popup, to: Popup, origin: string, size: { w: number; h: number }, finish: () => void): void {
	const a = from.positioner;
	const b = to.positioner;
	const reset: HTMLElement[] = [from.popup];
	const done = () => {
		if (leaving !== done) return;
		leaving = undefined;
		observer.disconnect();
		for (const el of reset) for (const prop of ['transition', 'background', 'box-shadow', 'pointer-events']) el.style.removeProperty(prop);
		finish();
	};
	leaving = done;
	// The new positioner starts where the old one stands, before anything is measured; both popups start at the old size
	// in pixels (from auto nothing transitions).
	if (b && origin) b.style.transform = origin;
	for (const popup of [from.popup, to.popup]) {
		popup.style.setProperty('--popup-width', `${size.w}px`);
		popup.style.setProperty('--popup-height', `${size.h}px`);
	}
	Object.assign(from.popup.style, { background: 'transparent', boxShadow: 'none', pointerEvents: 'none' });
	for (const content of from.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]')) content.setAttribute('data-ending-style', '');
	to.popup.removeAttribute('data-starting-style');
	// The opening already styled the content: it takes its starting style at once, and transitions out of it from there.
	for (const content of to.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]')) {
		content.setAttribute('data-starting-style', '');
		content.style.transition = 'none';
		void getComputedStyle(content).opacity;
		content.style.removeProperty('transition');
	}
	// Its natural size, measured without a transition that would start from it.
	to.popup.style.transition = 'none';
	to.popup.style.setProperty('--popup-width', 'auto');
	to.popup.style.setProperty('--popup-height', 'auto');
	const natural = { w: to.popup.offsetWidth, h: to.popup.offsetHeight };
	to.popup.style.setProperty('--popup-width', `${size.w}px`);
	to.popup.style.setProperty('--popup-height', `${size.h}px`);
	void to.popup.offsetWidth;
	to.popup.style.removeProperty('transition');
	// After the frame the popup opened in, once its own transitions are back (transition.ts enter).
	requestAnimationFrame(() => {
		for (const popup of [to.popup, from.popup]) {
			popup.style.setProperty('--popup-width', `${natural.w}px`);
			popup.style.setProperty('--popup-height', `${natural.h}px`);
		}
		for (const content of to.popup.querySelectorAll('[data-slot="navigation-menu-content"]')) content.removeAttribute('data-starting-style');
	});
	// The positioner's transition on its place: the old one follows the new one there.
	for (const el of [a, b]) {
		if (!el) continue;
		el.style.transition = `transform 0.35s ${EASE}`;
		reset.push(el);
	}
	const follow = () => {
		if (a && b && b.style.transform !== origin) a.style.transform = b.style.transform;
	};
	const observer = new MutationObserver(follow);
	if (b) observer.observe(b, { attributes: true, attributeFilter: ['style'] });
	follow();
	setTimeout(done, 350);
}

function show(trigger: HTMLElement): void {
	if (current?.trigger === trigger) return;
	const prev = current;
	const from = prev?.trigger;
	const origin = prev?.positioner?.style.transform ?? '';
	const size = prev ? { w: prev.popup.offsetWidth, h: prev.popup.offsetHeight } : { w: 0, h: 0 };
	let finish: (() => void) | undefined;
	leaving?.();
	if (prev) hide(true, (f) => (finish = f));
	pressed = false;
	const p = openPopup(trigger, { popupSelector: ':scope > [role="presentation"] > nav', key: keyOf(trigger), sideOffset: 8, fallbackAxisSide: 'none', onDismiss: () => dismiss() });
	if (!p) {
		finish?.();
		return;
	}
	current = p;
	markTrigger(trigger, true);
	if (p.popup.id) trigger.setAttribute('aria-controls', p.popup.id);
	mark(trigger, true);
	const all = triggersOf(trigger);
	const direction = from && (all.indexOf(trigger) > all.indexOf(from) ? 'right' : 'left');
	for (const content of [...p.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]'), ...(prev ? prev.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]') : [])]) {
		if (direction) content.setAttribute('data-activation-direction', direction);
		else content.removeAttribute('data-activation-direction');
	}
	for (const content of p.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]')) {
		content.setAttribute('data-open', '');
		content.removeAttribute('data-closed');
	}
	if (prev && finish) morph(prev, p, origin, size, finish);
}

function hide(switching: boolean, handoff?: (finish: () => void) => void): void {
	const p = current;
	if (!p) return;
	if (!switching) leaving?.();
	current = undefined;
	markTrigger(p.trigger, false);
	if (!switching) mark(p.trigger, false);
	for (const content of p.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]')) {
		content.removeAttribute('data-open');
		content.setAttribute('data-closed', '');
	}
	closePopup(p, false, false, {}, handoff);
	if (switching && !handoff) p.portal.hidden = true;
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
