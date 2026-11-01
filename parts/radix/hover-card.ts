import { closeLayer, openLayer, type Layer } from '../layer.ts';
import { closestTrigger, layerKey } from '../reveal.ts';

// Radix HoverCard: the pointer resting on the trigger (or focus) opens the content after openDelay; leaving both the
// trigger and the content closes it after closeDelay (the delays the source gives HoverCard, written by the converter as
// data-mm-open-delay and data-mm-close-delay; Radix's defaults are 700 and 300 ms). A touch never opens it.
const TRIGGER = ':is([data-slot="hover-card-trigger"], [data-mm-part="hover-card-trigger"])[data-state]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[data-state][data-mm-key], [data-state][aria-controls], [data-state][id]', (slot) => /^hover-card-trigger$/.test(slot));
const open = new Map<HTMLElement, Layer>();
const timers = new Map<HTMLElement, number>();
const listening = new WeakSet<Element>();

const keyOf = (t: HTMLElement) => layerKey(t);
const delay = (t: HTMLElement, name: 'mmOpenDelay' | 'mmCloseDelay', fallback: number) => {
	const v = Number(t.dataset[name]);
	return Number.isFinite(v) && t.dataset[name] !== undefined ? v : fallback;
};

function setState(trigger: HTMLElement, layer: Layer | undefined, state: 'open' | 'closed'): void {
	trigger.setAttribute('data-state', state);
	layer?.content.setAttribute('data-state', state);
}

function show(trigger: HTMLElement): void {
	if (open.has(trigger)) return;
	const key = keyOf(trigger);
	const layer = key ? openLayer(trigger, key, { onDismiss: () => hide(trigger) }) : undefined;
	if (!layer) return;
	open.set(trigger, layer);
	setState(trigger, layer, 'open');
	const content = layer.content;
	if (listening.has(content)) return;
	listening.add(content);
	content.addEventListener('pointerenter', () => clearTimeout(timers.get(trigger)));
	content.addEventListener('pointerleave', (e) => {
		if (e.pointerType !== 'touch') schedule(trigger, false);
	});
}

function hide(trigger: HTMLElement): void {
	const layer = open.get(trigger);
	if (!layer) return;
	open.delete(trigger);
	setState(trigger, layer, 'closed');
	closeLayer(layer, true);
}

function schedule(trigger: HTMLElement, opening: boolean): void {
	clearTimeout(timers.get(trigger));
	timers.set(trigger, window.setTimeout(() => (opening ? show(trigger) : hide(trigger)), opening ? delay(trigger, 'mmOpenDelay', 700) : delay(trigger, 'mmCloseDelay', 300)));
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || event.pointerType === 'touch') return false;
	if (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget)) return true;
	schedule(trigger, true);
	return true;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || event.pointerType === 'touch' || (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget))) return false;
	const layer = open.get(trigger);
	if (layer && event.relatedTarget instanceof Node && layer.nodes.some((n) => n.contains(event.relatedTarget as Node))) return true;
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
