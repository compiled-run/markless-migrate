// @qwik-ui/headless Tooltip (tooltip/*): pointing at the trigger or focusing it shows the panel at once (a manual popover
// placed on the trigger's top by default) and its data-state goes opening, then open after the delay the old page used
// (data-mm-delay, else at once); leaving or blurring it hides the panel and the state goes closing, then closed.
// Escape closes an open tooltip.
import { hidePanel, place, showPanel, unplace } from './floating.ts';

const TRIGGER = '[aria-describedby][data-state]';
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
let openTrigger: HTMLElement | undefined;

function partsOf(target: Element) {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const id = trigger?.getAttribute('aria-describedby') ?? '';
	const panel = document.getElementById(`${id}-panel`);
	return trigger && panel?.getAttribute('role') === 'tooltip' ? { trigger, panel } : undefined;
}

function state(trigger: HTMLElement, now: string, then: string): void {
	clearTimeout(timers.get(trigger));
	trigger.setAttribute('data-state', now);
	const delay = Number(trigger.dataset.mmDelay ?? 0);
	if (delay > 0) timers.set(trigger, setTimeout(() => trigger.setAttribute('data-state', then), delay));
	else trigger.setAttribute('data-state', then);
}

function show(trigger: HTMLElement, panel: HTMLElement): void {
	showPanel(panel);
	place(trigger, panel, 'top');
	state(trigger, 'opening', 'open');
	openTrigger = trigger;
}

function hideTip(trigger: HTMLElement, panel: HTMLElement): void {
	unplace(panel);
	hidePanel(panel);
	state(trigger, 'closing', 'closed');
	if (openTrigger === trigger) openTrigger = undefined;
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	const p = partsOf(target);
	if (!p) return false;
	if (event.relatedTarget instanceof Node && p.trigger.contains(event.relatedTarget)) return true;
	show(p.trigger, p.panel);
	return true;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	const p = partsOf(target);
	if (!p) return false;
	if (event.relatedTarget instanceof Node && p.trigger.contains(event.relatedTarget)) return true;
	hideTip(p.trigger, p.panel);
	return true;
}

export function focusin(target: Element): boolean {
	const p = partsOf(target);
	if (!p) return false;
	show(p.trigger, p.panel);
	return true;
}

export function focusout(target: Element): boolean {
	const p = partsOf(target);
	if (!p) return false;
	hideTip(p.trigger, p.panel);
	return true;
}

export function shortcut(_target: Element, event: KeyboardEvent): void {
	if (event.key !== 'Escape' || !openTrigger) return;
	const p = partsOf(openTrigger);
	if (!p || p.trigger.getAttribute('data-state') !== 'open') return;
	event.preventDefault();
	hideTip(p.trigger, p.panel);
}
