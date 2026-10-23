import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';

// Base UI NavigationMenu: the pointer on a trigger opens its content after 50 ms, leaving trigger and content closes it
// after 50 ms; a press opens it, or closes what an earlier press opened; the pointer on another trigger switches to it.
// The open menu marks its root, list and content data-open, the content data-activation-direction on a switch.
const TRIGGER = '[data-base-ui-navigation-menu-trigger]';
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

function show(trigger: HTMLElement): void {
	if (current?.trigger === trigger) return;
	const from = current?.trigger;
	if (current) hide(true);
	pressed = false;
	const p = openPopup(trigger, { popupSelector: ':scope > [role="presentation"] > nav', key: keyOf(trigger), sideOffset: 8, onDismiss: () => hide(false) });
	if (!p) return;
	current = p;
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
	if (!switching) mark(p.trigger, false);
	for (const content of p.popup.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-content"]')) {
		content.removeAttribute('data-open');
		content.setAttribute('data-closed', '');
	}
	closePopup(p, false);
	if (switching) p.portal.hidden = true;
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

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger) return false;
	clearTimeout(timer);
	if (current?.trigger === trigger && pressed) hide(false);
	else {
		show(trigger);
		pressed = true;
	}
	return true;
}
