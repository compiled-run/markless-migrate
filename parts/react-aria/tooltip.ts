import { keyboardModality, onFocusVisibleChange, pointerModality } from './interactions.ts';
import { closeOverlay, openOverlay, overlayFor, overlayOf, type Overlay } from './overlay.ts';

// React Aria's TooltipTrigger and PreviewTrigger (useTooltipTriggerState, useTooltipTrigger, usePreviewTrigger): a
// pointer resting on the trigger shows its tooltip after the delay and leaving hides it after the close delay; keyboard
// focus shows a tooltip at once and a preview after its delay; a press on a tooltip's trigger and Escape hide it; one
// shows at a time, and while one is shown or within the cooldown after it closed the next shows without waiting. The
// delays are the trigger's own (data-mm-delay, data-mm-close-delay), or shadcn's TooltipTrigger's (0, and React Aria's
// 500 ms) and PreviewTrigger's (600 and 200 ms). Neither is modal.
const TOOLTIP = { delay: 0, closeDelay: 500 };
const PREVIEW = { delay: 600, closeDelay: 200 };
const COOLDOWN = 500;

interface Pending {
	close?: ReturnType<typeof setTimeout>;
}
const timers = new WeakMap<HTMLElement, Pending>();
const shownTips = new Set<Overlay>();
// useTooltipTriggerState's module state, shared by every tooltip and preview.
let warmedUp = false;
let warming: { trigger: HTMLElement; timer: ReturnType<typeof setTimeout> } | undefined;
let cooldown: ReturnType<typeof setTimeout> | undefined;

const TIP = '[data-trigger="TooltipTrigger"], [data-trigger="PreviewTrigger"], [role="tooltip"]';
// A trigger's layers include the focus scope's sentinels beside its content.
const layersOf = (trigger: HTMLElement) => (trigger.id ? [...document.querySelectorAll<HTMLElement>(`[data-mm-layer="${CSS.escape(trigger.id)}"]`)] : []);
const isPreview = (trigger: HTMLElement) => trigger.getAttribute('aria-haspopup') === 'dialog' && trigger.hasAttribute('aria-expanded');
function triggerOf(target: Element): HTMLElement | null {
	const el = target.closest<HTMLElement>('[data-rac][id]');
	if (!el) return null;
	const layers = layersOf(el);
	if (!layers.length) return document.querySelector(`template[data-mm-layer-keys~="${CSS.escape(el.id)}"]`) ? el : null;
	return layers.some((layer) => layer.matches(TIP) || layer.querySelector(TIP)) ? el : null;
}
const pending = (trigger: HTMLElement) => timers.get(trigger) ?? (timers.set(trigger, {}), timers.get(trigger)!);
function delaysOf(trigger: HTMLElement): { delay: number; closeDelay: number } {
	const own = (name: 'mmDelay' | 'mmCloseDelay', fallback: number) => (trigger.dataset[name] && Number.isFinite(Number(trigger.dataset[name])) ? Number(trigger.dataset[name]) : fallback);
	const defaults = isPreview(trigger) ? PREVIEW : TOOLTIP;
	return { delay: own('mmDelay', defaults.delay), closeDelay: own('mmCloseDelay', defaults.closeDelay) };
}

function show(trigger: HTMLElement): void {
	if (overlayFor(trigger)) return;
	const o = openOverlay(trigger, trigger.id, {
		modal: false,
		dismissable: false,
		markTrigger: isPreview(trigger),
		placement: isPreview(trigger) ? 'bottom' : 'top',
		offset: isPreview(trigger) ? 8 : 0,
		onDismiss: (x) => close(x.trigger, true),
		onReady: (x) => {
			const tip = x.content.matches('[role="tooltip"]') ? x.content : x.content.querySelector<HTMLElement>('[role="tooltip"]');
			if (tip?.id) trigger.setAttribute('aria-describedby', tip.id);
		},
	});
	if (o) shownTips.add(o);
}

function hide(trigger: HTMLElement): void {
	const t = pending(trigger);
	clearTimeout(t.close);
	t.close = undefined;
	const o = overlayFor(trigger);
	if (!o) return;
	shownTips.delete(o);
	trigger.removeAttribute('aria-describedby');
	closeOverlay(o, true);
}

/** closeOpenTooltips: the others close at once, as this one replaces them. */
function hideOthers(trigger: HTMLElement): void {
	for (const other of [...shownTips]) if (other.trigger !== trigger) hide(other.trigger);
	if (warming && warming.trigger !== trigger) {
		clearTimeout(warming.timer);
		warming = undefined;
	}
}

function showNow(trigger: HTMLElement): void {
	const t = pending(trigger);
	clearTimeout(t.close);
	t.close = undefined;
	hideOthers(trigger);
	warmedUp = true;
	clearTimeout(warming?.timer);
	warming = undefined;
	clearTimeout(cooldown);
	cooldown = undefined;
	show(trigger);
}

/** useTooltipTriggerState's open: after the delay unless one is already shown or cooling down. */
function open(trigger: HTMLElement, immediate = false): void {
	const { delay } = delaysOf(trigger);
	if (immediate || delay <= 0 || pending(trigger).close) return showNow(trigger);
	hideOthers(trigger);
	if (overlayFor(trigger)) return;
	if (warmedUp) return showNow(trigger);
	clearTimeout(warming?.timer);
	warming = { trigger, timer: setTimeout(() => ((warming = undefined), showNow(trigger)), delay) };
}

function close(trigger: HTMLElement, immediate = false): void {
	const { closeDelay } = delaysOf(trigger);
	const t = pending(trigger);
	if (immediate || closeDelay <= 0) hide(trigger);
	else t.close ??= setTimeout(() => hide(trigger), closeDelay);
	if (warming) {
		clearTimeout(warming.timer);
		warming = undefined;
	}
	if (!warmedUp) return;
	clearTimeout(cooldown);
	cooldown = setTimeout(() => ((cooldown = undefined), (warmedUp = false)), Math.max(COOLDOWN, closeDelay));
}

// usePreviewTrigger follows focus visibility through useFocusVisibleListener, which starts out false.
let previewFocusVisible = false;
onFocusVisibleChange((visible) => (previewFocusVisible = visible));

const inside = (trigger: HTMLElement, node: Node | null) => !!node && (trigger.contains(node) || !!overlayFor(trigger)?.nodes.some((n) => n.contains(node)));
// usePreviewTrigger's checkClose: kept while the pointer is over trigger or card, or visible focus is in either.
let pointerAt: Node | null = null;
function checkClose(trigger: HTMLElement, focusAt: Node | null = document.activeElement): void {
	if (inside(trigger, pointerAt)) return;
	if (previewFocusVisible && inside(trigger, focusAt)) return;
	close(trigger);
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch') return false;
	pointerAt = target;
	const trigger = triggerOf(target);
	const from = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	if (trigger) {
		// useHover's hover start, on entering the trigger; it counts only when the mouse moved there.
		if (from && trigger.contains(from)) return false;
		if (pointerModality()) open(trigger, !isPreview(trigger) && document.activeElement === trigger && keyboardModality());
		return false;
	}
	const o = overlayOf(target);
	if (o && shownTips.has(o) && isPreview(o.trigger)) showNow(o.trigger);
	return false;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	pointerAt = to;
	const trigger = triggerOf(target);
	const o = trigger ? overlayFor(trigger) : overlayOf(target);
	const owner = trigger ?? (o && shownTips.has(o) ? o.trigger : null);
	if (!owner) return false;
	if (!isPreview(owner)) {
		if (trigger && !(to && trigger.contains(to))) close(owner);
		return false;
	}
	if (overlayFor(owner)) checkClose(owner);
	else if (!(to && owner.contains(to))) close(owner);
	return false;
}

export function focusin(target: Element): boolean {
	const trigger = triggerOf(target);
	if (!trigger || target !== trigger) return false;
	if (isPreview(trigger)) {
		if (previewFocusVisible) open(trigger);
	} else if (keyboardModality()) open(trigger, true);
	return false;
}

export function focusout(target: Element, event: FocusEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || target !== trigger) {
		// The card's blur within.
		const o = overlayOf(target);
		const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
		if (o && shownTips.has(o) && isPreview(o.trigger)) checkClose(o.trigger, to);
		return false;
	}
	if (!isPreview(trigger)) close(trigger, true);
	else checkClose(trigger, event.relatedTarget instanceof Node ? event.relatedTarget : null);
	return false;
}

export function pointerdown(target: Element): boolean {
	const trigger = triggerOf(target);
	if (trigger && !isPreview(trigger)) close(trigger, true);
	return false;
}
