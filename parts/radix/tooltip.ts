import { closeLayer, openLayer, type Layer } from '../layer.ts';
import { closestTrigger, layerKey } from '../reveal.ts';

// Radix Tooltip under shadcn's TooltipProvider delayDuration={0}: the pointer entering the trigger or keyboard focus
// shows the content at once (data-state "delayed-open", "instant-open" when another tooltip closed within Radix's
// 300 ms skip delay), with aria-describedby naming its hidden role="tooltip" text; leaving, blurring, a press on the
// trigger or Escape hides it. The content never takes focus.
const TRIGGER = '[data-slot="tooltip-trigger"][data-state]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[data-state][data-mm-key], [data-state][aria-controls], [data-state][id]', (slot) => /^tooltip-trigger$/.test(slot));
const SKIP_DELAY = 300;
const shown = new Map<HTMLElement, Layer>();
let lastClosed = 0;

const keyOf = (t: HTMLElement) => layerKey(t);

function show(trigger: HTMLElement): boolean {
	if (shown.has(trigger)) return true;
	const key = keyOf(trigger);
	if (!key) return false;
	const layer = openLayer(trigger, key, { onDismiss: () => hide(trigger) });
	if (!layer) return false;
	const state = Date.now() - lastClosed < SKIP_DELAY ? 'instant-open' : 'delayed-open';
	trigger.setAttribute('data-state', state);
	layer.content.setAttribute('data-state', state);
	const text = layer.content.querySelector('[role="tooltip"]');
	if (text?.id) trigger.setAttribute('aria-describedby', text.id);
	shown.set(trigger, layer);
	return true;
}

function hide(trigger: HTMLElement): void {
	const layer = shown.get(trigger);
	if (!layer) return;
	shown.delete(trigger);
	lastClosed = Date.now();
	trigger.setAttribute('data-state', 'closed');
	trigger.removeAttribute('aria-describedby');
	closeLayer(layer, true);
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || event.pointerType === 'touch') return false;
	return show(trigger);
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || !shown.has(trigger)) return false;
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	if (to && (trigger.contains(to) || shown.get(trigger)!.nodes.some((n) => n.contains(to)))) return true;
	hide(trigger);
	return true;
}

export function pointerdown(target: Element): boolean {
	const trigger = triggerOf(target);
	if (!trigger || !shown.has(trigger)) return false;
	hide(trigger);
	return false;
}

export function focusin(target: Element): boolean {
	const trigger = triggerOf(target);
	return trigger && (target as HTMLElement).matches(':focus-visible') ? show(trigger) : false;
}

export function focusout(target: Element): boolean {
	const trigger = triggerOf(target);
	if (!trigger || !shown.has(trigger)) return false;
	hide(trigger);
	return true;
}
