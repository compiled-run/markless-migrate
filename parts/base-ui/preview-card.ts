import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { closestTrigger } from '../reveal.ts';

// Base UI PreviewCard (shadcn's hover card on Base UI): the pointer resting on the trigger or its focus opens the card
// after the open delay, leaving trigger and card closes it after the close delay (data-mm-delay and
// data-mm-close-delay when the source gives them; Base UI's defaults are 600 and 300 ms). The card never takes focus.
const TRIGGER = ':is([data-slot="hover-card-trigger"], [data-mm-part="preview-card-trigger"]):not([data-state])';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[data-mm-key]:not([data-state]), [id]:not([data-state])', (slot) => /^hover-card-trigger$/.test(slot));
const shown = new Map<HTMLElement, Popup>();
const timers = new Map<HTMLElement, number>();
const delay = (t: HTMLElement, name: 'mmDelay' | 'mmCloseDelay', fallback: number) => (t.dataset[name] !== undefined && Number.isFinite(Number(t.dataset[name])) ? Number(t.dataset[name]) : fallback);

function show(trigger: HTMLElement): void {
	if (shown.has(trigger)) return;
	const p = openPopup(trigger, { popupSelector: '[data-slot="hover-card-content"]', onDismiss: (x) => hide(x.trigger), outsidePress: true });
	if (!p) return;
	trigger.removeAttribute('aria-expanded');
	shown.set(trigger, p);
}
function hide(trigger: HTMLElement): void {
	const p = shown.get(trigger);
	if (!p) return;
	shown.delete(trigger);
	closePopup(p, false);
	trigger.removeAttribute('aria-expanded');
}
function schedule(trigger: HTMLElement, opening: boolean): void {
	clearTimeout(timers.get(trigger));
	timers.set(trigger, window.setTimeout(() => (opening ? show(trigger) : hide(trigger)), opening ? delay(trigger, 'mmDelay', 600) : delay(trigger, 'mmCloseDelay', 300)));
}
const ownerOf = (el: Element) => {
	const p = popupOf(el);
	return p && shown.get(p.trigger) === p ? p.trigger : undefined;
};

export function pointerover(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch') return false;
	const trigger = triggerOf(target) ?? ownerOf(target);
	if (!trigger) return false;
	if (shown.has(trigger)) clearTimeout(timers.get(trigger));
	else schedule(trigger, true);
	return true;
}
export function pointerout(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target) ?? ownerOf(target);
	if (!trigger || event.pointerType === 'touch') return false;
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	const p = shown.get(trigger);
	if (to && (trigger.contains(to) || p?.portal.contains(to))) return true;
	schedule(trigger, false);
	return true;
}
export function focusin(target: Element): boolean {
	const trigger = triggerOf(target);
	if (!trigger) return false;
	schedule(trigger, true);
	return true;
}
export function focusout(target: Element): boolean {
	const trigger = triggerOf(target);
	if (!trigger) return false;
	schedule(trigger, false);
	return true;
}
