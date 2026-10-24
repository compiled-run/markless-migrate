import { layersFor, loadLayers } from '../reveal.ts';
import { placeOverlay, type Target } from './position.ts';

// What React Aria does around a Popover or Modal it portals to the body, on the content Markless renders hidden at the
// end of the page: shown on open with data-entering until its entry animation ends, data-exiting and then hidden on
// close; everything else in the body made inert (ariaHideOutside with shouldUseInert) and the document's scroll
// prevented (usePreventScroll); Escape and a press that ends outside closing the top overlay (useOverlay); focus moved
// in on open and back to the trigger on close (FocusScope restoreFocus); the trigger marked open.

export interface Overlay {
	readonly key: string;
	readonly trigger: HTMLElement;
	readonly nodes: HTMLElement[];
	/** The Popover, or the ModalOverlay of a Modal. */
	readonly content: HTMLElement;
	/** What a press must land outside of to dismiss: the Popover, or the Modal inside its ModalOverlay. */
	readonly surface: HTMLElement;
	readonly modal: boolean;
	readonly marked: boolean;
	readonly onDismiss: (o: Overlay, reason: 'escape' | 'outside') => void;
	cleanup: (() => void)[];
}

const open: Overlay[] = [];
export const top = () => open[open.length - 1];
export const overlayOf = (el: Element | null) => (el ? open.find((o) => o.nodes.some((n) => n.contains(el))) : undefined);
export const overlayFor = (trigger: Element) => open.find((o) => o.trigger === trigger);

const inerted = new Map<HTMLElement, number>();
function hideOutside(keep: readonly HTMLElement[]): () => void {
	const hidden: HTMLElement[] = [];
	const keeps = (el: Element) => keep.some((k) => el.contains(k) || k.contains(el)) || el.matches('[data-live-announcer], [data-react-aria-top-layer]');
	const walk = (parent: Element) => {
		for (const child of parent.children) {
			if (!(child instanceof HTMLElement)) continue;
			if (keep.some((k) => k === child || k.contains(child))) continue;
			if (keeps(child)) {
				walk(child);
				continue;
			}
			const count = inerted.get(child) ?? 0;
			if (count === 0 && child.inert) continue;
			if (count === 0) child.inert = true;
			inerted.set(child, count + 1);
			hidden.push(child);
		}
	};
	walk(document.body);
	return () => {
		for (const el of hidden) {
			const count = inerted.get(el) ?? 1;
			if (count === 1) {
				el.inert = false;
				inerted.delete(el);
			} else inerted.set(el, count - 1);
		}
	};
}

let scrollLocks = 0;
let restoreScroll: (() => void) | undefined;
function preventScroll(): () => void {
	if (scrollLocks++ === 0) {
		const root = document.documentElement;
		const gutter = window.innerWidth - root.clientWidth;
		const before = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
		if (gutter > 0) root.style.scrollbarGutter = 'stable';
		root.style.overflow = 'hidden';
		restoreScroll = () => {
			root.style.overflow = before.overflow;
			root.style.scrollbarGutter = before.gutter;
			if (!root.getAttribute('style')) root.removeAttribute('style');
		};
	}
	return () => {
		if (--scrollLocks === 0) restoreScroll?.();
	};
}

/**
 * RAC's useEnterAnimation and useExitAnimation: the state attribute is set, styles are read at once (so a transition
 * from the entering style runs when it is removed), a transition the entering state itself started is cancelled, and
 * the attribute holds until every animation then running has finished.
 */
function animate(el: HTMLElement, attribute: 'data-entering' | 'data-exiting', done?: () => void): void {
	el.setAttribute(attribute, 'true');
	let running = el.getAnimations();
	if (attribute === 'data-entering') {
		for (const a of running) if (a instanceof CSSTransition) a.cancel();
		running = el.getAnimations();
	}
	const end = () => {
		el.removeAttribute(attribute);
		done?.();
	};
	if (!running.length) end();
	else void Promise.allSettled(running.map((a) => a.finished)).then(end);
}

export interface OpenOptions {
	readonly modal?: boolean;
	readonly placement?: string;
	/** Where it is placed off, when not its trigger (the point a context menu opened at). */
	readonly anchor?: Target;
	readonly offset?: number;
	readonly crossOffset?: number;
	/** Whether a press outside closes it (a Modal only when isDismissable). */
	readonly dismissable?: boolean;
	readonly onDismiss: (o: Overlay, reason: 'escape' | 'outside') => void;
	/** Whether the trigger is marked aria-expanded and aria-controls (a tooltip's is not). */
	readonly markTrigger?: boolean;
	/** Runs once the overlay's content is in: at once, or when a served layer's file has filled its shell. */
	readonly onReady?: (o: Overlay) => void;
}

const num = (v: string | undefined, fallback: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback);

/** Shows a trigger's captured overlay; undefined when the page has none for it. */
export function openOverlay(trigger: HTMLElement, key: string, options: OpenOptions): Overlay | undefined {
	const existing = open.find((o) => o.key === key);
	if (existing) return existing;
	const nodes = layersFor(key);
	if (!nodes.length) return undefined;
	const CONTENT = '[data-trigger], [role="tooltip"][data-rac], [data-slot$="-overlay"]';
	const content = nodes.map((n) => (n.matches(CONTENT) ? n : n.querySelector<HTMLElement>(CONTENT))).find(Boolean) ?? nodes[0]!;
	for (const n of nodes) n.hidden = false;
	content.removeAttribute('data-exiting');
	const positioned = content.hasAttribute('data-trigger') || content.matches('[role="tooltip"]');
	const surface = positioned ? content : ([...content.children].find((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-rac')) ?? content);
	const o: Overlay = { key, trigger, nodes, content, surface, modal: options.modal !== false, marked: options.markTrigger !== false, onDismiss: options.onDismiss, cleanup: [] };
	const ready = () => {
		if (!open.includes(o)) return;
		if (positioned) {
			// The converter writes the source's placement and offsets on the layer (convert's racPlacement).
			const from = nodes.find((n) => n.dataset.mmPlacement !== undefined)?.dataset ?? content.dataset;
			const placement = from.mmPlacement ?? options.placement ?? content.getAttribute('data-placement') ?? 'bottom';
			o.cleanup.push(placeOverlay(options.anchor ?? trigger, content, { placement, offset: num(from.mmOffset, options.offset ?? 8), crossOffset: num(from.mmCrossOffset, options.crossOffset ?? 0) }));
		}
		for (const el of new Set([content, surface])) animate(el, 'data-entering');
		options.onReady?.(o);
	};
	const controls = content.id || content.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')?.id;
	if (options.markTrigger !== false) {
		trigger.setAttribute('aria-expanded', 'true');
		if (controls) trigger.setAttribute('aria-controls', controls);
	}
	if (o.modal) {
		o.cleanup.push(hideOutside(nodes));
		o.cleanup.push(preventScroll());
	}
	open.push(o);
	if (nodes.some((n) => n.matches('[data-mm-layer-fill]') || n.querySelector('[data-mm-layer-fill]'))) void loadLayers().then(ready);
	else ready();
	// Its own onReady may have closed it (a ComboBox with nothing matching).
	if (!open.includes(o)) return o;
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Escape' || top() !== o) return;
		event.preventDefault();
		event.stopPropagation();
		o.onDismiss(o, 'escape');
	};
	let downOutside = false;
	const outside = (target: EventTarget | null) => target instanceof Node && !o.surface.contains(target) && !(o.surface === o.content && o.nodes.some((n) => n.contains(target)));
	const onDown = (event: PointerEvent) => {
		downOutside = top() === o && outside(event.target) && event.button === 0;
		if (downOutside) event.preventDefault();
	};
	const onUp = (event: PointerEvent) => {
		if (!downOutside || top() !== o || !outside(event.target)) return;
		downOutside = false;
		o.onDismiss(o, 'outside');
	};
	document.addEventListener('keydown', onKey, true);
	if (options.dismissable !== false) {
		document.addEventListener('pointerdown', onDown, true);
		document.addEventListener('pointerup', onUp, true);
	}
	o.cleanup.push(() => {
		document.removeEventListener('keydown', onKey, true);
		document.removeEventListener('pointerdown', onDown, true);
		document.removeEventListener('pointerup', onUp, true);
	});
	return o;
}

/** Closes an overlay: its exit animation runs, then it is hidden; focus goes back to the trigger unless `keepFocus`. */
export function closeOverlay(o: Overlay, keepFocus = false): void {
	const at = open.indexOf(o);
	if (at < 0) return;
	open.splice(at, 1);
	for (const c of o.cleanup.splice(0)) c();
	if (o.marked) {
		o.trigger.setAttribute('aria-expanded', 'false');
		o.trigger.removeAttribute('aria-controls');
	}
	if (!keepFocus) o.trigger.focus({ preventScroll: true });
	const parts = [...new Set([o.content, o.surface])];
	let left = parts.length;
	for (const el of parts) {
		el.removeAttribute('data-entering');
		animate(el, 'data-exiting', () => {
			if (--left || open.includes(o)) return;
			for (const n of o.nodes) n.hidden = true;
		});
	}
}

