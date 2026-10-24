import { keyboardModality, pointerModality } from './interactions.ts';
import { closeOverlay, openOverlay, overlayFor, overlayOf, type Overlay } from './overlay.ts';

// React Aria's TooltipTrigger and PreviewTrigger (useTooltipTriggerState, useTooltipTrigger, usePreviewTrigger): a
// pointer resting on the trigger shows its tooltip after the delay (shadcn's TooltipTrigger passes 0) and leaving hides
// it after the close delay (500 ms); keyboard focus shows it at once and blur hides it; a press on the trigger and Escape
// hide it; one tooltip shows at a time. A PreviewTrigger shows its popover after 600 ms and keeps it while the pointer
// is over either, hiding it 200 ms after the pointer leaves both. Neither is modal.
const TOOLTIP = { delay: 0, closeDelay: 500 };
const PREVIEW = { delay: 600, closeDelay: 200 };

interface Pending {
	open?: ReturnType<typeof setTimeout>;
	close?: ReturnType<typeof setTimeout>;
}
const timers = new WeakMap<HTMLElement, Pending>();
const shownTips = new Set<Overlay>();

const layerOf = (trigger: HTMLElement) => (trigger.id ? document.querySelector<HTMLElement>(`[data-mm-layer="${CSS.escape(trigger.id)}"]`) : null);
const isPreview = (trigger: HTMLElement) => trigger.getAttribute('aria-haspopup') === 'dialog' && trigger.hasAttribute('aria-expanded');
function triggerOf(target: Element): HTMLElement | null {
	const el = target.closest<HTMLElement>('[data-rac][id]');
	if (!el) return null;
	const layer = layerOf(el) ?? (document.querySelector(`template[data-mm-layer-keys~="${CSS.escape(el.id)}"]`) ? el : null);
	if (!layer) return null;
	return layer === el || layer.matches('[data-trigger="TooltipTrigger"], [data-trigger="PreviewTrigger"]') || layer.querySelector('[data-trigger="TooltipTrigger"], [data-trigger="PreviewTrigger"], [role="tooltip"]') ? el : null;
}
const pending = (trigger: HTMLElement) => timers.get(trigger) ?? (timers.set(trigger, {}), timers.get(trigger)!);

function show(trigger: HTMLElement): void {
	const t = pending(trigger);
	clearTimeout(t.close);
	if (overlayFor(trigger)) return;
	for (const other of [...shownTips]) if (other.trigger !== trigger) hide(other.trigger);
	const o = openOverlay(trigger, trigger.id, {
		modal: false,
		dismissable: false,
		markTrigger: isPreview(trigger),
		placement: isPreview(trigger) ? 'bottom' : 'top',
		offset: isPreview(trigger) ? 8 : 0,
		onDismiss: (x) => hide(x.trigger),
		onReady: (x) => {
			const tip = x.content.matches('[role="tooltip"]') ? x.content : x.content.querySelector<HTMLElement>('[role="tooltip"]');
			if (tip?.id) trigger.setAttribute('aria-describedby', tip.id);
		},
	});
	if (!o) return;
	shownTips.add(o);
}

function hide(trigger: HTMLElement): void {
	const t = pending(trigger);
	clearTimeout(t.open);
	clearTimeout(t.close);
	const o = overlayFor(trigger);
	if (!o) return;
	shownTips.delete(o);
	trigger.removeAttribute('aria-describedby');
	closeOverlay(o, true);
}

function schedule(trigger: HTMLElement, on: boolean): void {
	const t = pending(trigger);
	const { delay, closeDelay } = isPreview(trigger) ? PREVIEW : TOOLTIP;
	if (on) {
		clearTimeout(t.close);
		if (overlayFor(trigger)) return;
		clearTimeout(t.open);
		if (delay <= 0) show(trigger);
		else t.open = setTimeout(() => show(trigger), delay);
	} else {
		clearTimeout(t.open);
		clearTimeout(t.close);
		t.close = setTimeout(() => hide(trigger), closeDelay);
	}
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch') return false;
	const trigger = triggerOf(target);
	// useTooltipTrigger and usePreviewTrigger answer a hover that comes from moving the mouse.
	if (trigger && pointerModality()) {
		schedule(trigger, true);
		return false;
	}
	// A preview stays while the pointer is over it.
	const o = overlayOf(target);
	if (o && shownTips.has(o)) clearTimeout(pending(o.trigger).close);
	return false;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	const trigger = triggerOf(target);
	const o = trigger ? overlayFor(trigger) : overlayOf(target);
	const owner = trigger ?? (o && shownTips.has(o) ? o.trigger : null);
	if (!owner || (to && (owner.contains(to) || (o && o.nodes.some((n) => n.contains(to)) && isPreview(owner))))) return false;
	schedule(owner, false);
	return false;
}

export function focusin(target: Element): boolean {
	const trigger = triggerOf(target);
	if (trigger && keyboardModality()) {
		if (isPreview(trigger)) schedule(trigger, true);
		else show(trigger);
	}
	return false;
}

export function focusout(target: Element, event: FocusEvent): boolean {
	const trigger = triggerOf(target);
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	const o = trigger && overlayFor(trigger);
	if (trigger && o && !(to && o.nodes.some((n) => n.contains(to)))) hide(trigger);
	return false;
}

export function pointerdown(target: Element): boolean {
	const trigger = triggerOf(target);
	if (trigger && !isPreview(trigger)) hide(trigger);
	return false;
}
