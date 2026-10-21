import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';

// Base UI Tooltip under shadcn's TooltipProvider delay={0}: hover or keyboard focus on the trigger shows it at once,
// leaving or blurring hides it. The popup is never focused.
const TRIGGER = '[data-slot="tooltip-trigger"]';
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
	const trigger = target.closest<HTMLElement>(TRIGGER);
	return trigger && !trigger.hasAttribute('data-state') ? show(trigger) : false;
}
export function pointerout(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || !shown.has(trigger) || (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget))) return false;
	hide(trigger);
	return true;
}
export function focusin(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	return trigger && !trigger.hasAttribute('data-state') && trigger.matches(':focus-visible') ? show(trigger) : false;
}
export function focusout(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || !shown.has(trigger)) return false;
	hide(trigger);
	return true;
}
void popupOf;
