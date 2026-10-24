import { showCompanions } from '../reveal.ts';

// Radix NavigationMenu: a trigger opens its content in the menu's viewport, on a press or after the pointer rests on it
// (delayDuration 200 ms, none while another is open); leaving the menu closes it after 150 ms, as do Escape and a second
// press. The viewport with each trigger's content is rendered hidden beside the list (convert's companions, keyed by
// the trigger's id); this shows it, sizes the viewport from its content (--radix-navigation-menu-viewport-width and
// -height) and sets data-state, and data-motion on the contents when moving from one trigger to another.

const TRIGGER = '[data-slot="navigation-menu-trigger"][aria-controls]';
const ROOT = '[data-slot="navigation-menu"]';
const opened = new Map<Element, HTMLElement>();
const timers = new WeakMap<Element, number>();

const companionsOf = (trigger: HTMLElement) => [...document.querySelectorAll<HTMLElement>(`[data-mm-shown-with="${CSS.escape(trigger.id)}"]`)];
const triggersOf = (root: Element) => [...root.querySelectorAll<HTMLElement>(TRIGGER)].filter((t) => t.closest(ROOT) === root);

function parts(trigger: HTMLElement): { viewport?: HTMLElement; content?: HTMLElement } {
	for (const c of companionsOf(trigger)) {
		const viewport = c.matches('[data-slot="navigation-menu-viewport"]') ? c : (c.querySelector<HTMLElement>('[data-slot="navigation-menu-viewport"]') ?? undefined);
		const content = c.querySelector<HTMLElement>('[data-slot="navigation-menu-content"]') ?? undefined;
		if (viewport || content) return { viewport, content };
	}
	return {};
}

function setTrigger(trigger: HTMLElement, open: boolean): void {
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
}

function open(trigger: HTMLElement): void {
	const root = trigger.closest(ROOT);
	if (!root || opened.get(root) === trigger) return;
	clearTimeout(timers.get(root));
	const previous = opened.get(root);
	const all = triggersOf(root);
	if (previous) {
		const forward = all.indexOf(trigger) > all.indexOf(previous);
		const before = parts(previous);
		before.content?.setAttribute('data-motion', forward ? 'to-start' : 'to-end');
		setTrigger(previous, false);
		showCompanions(previous.id, false);
		const next = parts(trigger);
		next.content?.setAttribute('data-motion', forward ? 'from-end' : 'from-start');
	}
	opened.set(root, trigger);
	setTrigger(trigger, true);
	showCompanions(trigger.id, true);
	const { viewport, content } = parts(trigger);
	for (const el of [viewport, content]) el?.setAttribute('data-state', 'open');
	if (viewport && content) {
		viewport.style.setProperty('--radix-navigation-menu-viewport-width', `${content.offsetWidth}px`);
		viewport.style.setProperty('--radix-navigation-menu-viewport-height', `${content.offsetHeight}px`);
	}
}

function close(root: Element, focus = false): void {
	const trigger = opened.get(root);
	if (!trigger) return;
	opened.delete(root);
	setTrigger(trigger, false);
	const { viewport, content } = parts(trigger);
	for (const el of [viewport, content]) el?.setAttribute('data-state', 'closed');
	const hide = () => opened.get(root) !== trigger && showCompanions(trigger.id, false);
	const animated = viewport && getComputedStyle(viewport).animationName !== 'none';
	if (animated) viewport!.addEventListener('animationend', hide, { once: true });
	else hide();
	if (focus) trigger.focus();
}

function schedule(root: Element, run: () => void, ms: number): void {
	clearTimeout(timers.get(root));
	timers.set(root, window.setTimeout(run, ms));
}

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const root = trigger?.closest(ROOT);
	if (!trigger || !root) return false;
	if (opened.get(root) === trigger) close(root);
	else open(trigger);
	return true;
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch') return false;
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const root = trigger?.closest(ROOT);
	if (trigger && root) {
		schedule(root, () => open(trigger), opened.has(root) ? 0 : 200);
		return true;
	}
	const inside = [...opened].find(([r, t]) => r.contains(target) || companionsOf(t).some((c) => c.contains(target)));
	if (inside) clearTimeout(timers.get(inside[0]));
	return false;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	for (const [root, trigger] of opened) {
		if (!root.contains(target) && !companionsOf(trigger).some((c) => c.contains(target))) continue;
		const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
		if (to && (root.contains(to) || companionsOf(trigger).some((c) => c.contains(to)))) return false;
		schedule(root, () => close(root), 150);
		return false;
	}
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const root = trigger?.closest(ROOT);
	if (root && !opened.has(root)) clearTimeout(timers.get(root));
	return false;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (event.key !== 'Escape') return false;
	for (const [root, trigger] of opened) {
		if (!root.contains(target) && !companionsOf(trigger).some((c) => c.contains(target))) continue;
		close(root, true);
		return true;
	}
	return false;
}
