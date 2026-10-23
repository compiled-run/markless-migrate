import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { closestTrigger } from '../reveal.ts';

// Base UI Tooltip under shadcn's TooltipProvider delay={0}: hover or keyboard focus on the trigger shows it at once,
// leaving or blurring hides it. The popup is never focused.
const TRIGGER = '[data-slot="tooltip-trigger"]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[data-mm-key]:not([data-state]), [id]:not([data-state])', (slot) => /^tooltip-trigger$/.test(slot));
const shown = new Map<HTMLElement, Popup>();

function show(trigger: HTMLElement): boolean {
	if (shown.has(trigger)) return true;
	const p = openPopup(trigger, { popupSelector: '[data-slot="tooltip-content"]', onDismiss: (x) => hide(x.trigger) });
	if (!p) return false;
	trigger.removeAttribute('aria-expanded');
	shown.set(trigger, p);
	return true;
}
function hide(trigger: HTMLElement): void {
	const p = shown.get(trigger);
	if (!p) return;
	shown.delete(trigger);
	closePopup(p, false);
	trigger.removeAttribute('aria-expanded');
}
export function pointerover(target: Element): boolean {
	const trigger = triggerOf(target);
	return trigger && !trigger.hasAttribute('data-state') ? show(trigger) : false;
}
export function pointerout(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || !shown.has(trigger) || (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget))) return false;
	hide(trigger);
	return true;
}
export function focusin(target: Element): boolean {
	const trigger = triggerOf(target);
	return trigger && !trigger.hasAttribute('data-state') && trigger.matches(':focus-visible') ? show(trigger) : false;
}
export function focusout(target: Element): boolean {
	const trigger = triggerOf(target);
	if (!trigger || !shown.has(trigger)) return false;
	hide(trigger);
	return true;
}
void popupOf;
