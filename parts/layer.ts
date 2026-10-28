import { optionsOf, place, type Anchor } from './popper.ts';
import { leave, stay } from './presence.ts';
import { layersFor, showCompanions } from './reveal.ts';
import { hideOthers } from './aria-hidden.ts';
import { lockScroll } from './remove-scroll.ts';

// What Radix's Portal, DismissableLayer and FocusScope do around a popover, menu, select or tooltip, on the content
// Markless renders at the end of the body: shown on open, Escape and a press outside closing the top layer, focus
// moved in on open and back to the trigger on close, Tab kept inside a modal or looping layer. Radix's focus guard spans
// are not added (the page Markless renders gets no nodes from a part); a modal layer traps Tab itself instead.

export interface Layer {
	readonly key: string;
	readonly trigger: HTMLElement;
	readonly nodes: HTMLElement[];
	readonly content: HTMLElement;
	readonly wrapper: HTMLElement | null;
	readonly modal: boolean;
	stop?: () => void;
	cleanup: (() => void)[];
}

const open: Layer[] = [];
let bodyPointerEvents = '';
let pressedOutside: Layer | undefined;

export const isOpen = (key: string) => open.some((l) => l.key === key);
export const top = () => open[open.length - 1];
export const layerOf = (el: Element) => open.find((l) => l.nodes.some((n) => n.contains(el)));

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const tabbables = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.getClientRects().length > 0);

// Radix FocusScope's candidates (tabIndex >= 0, not disabled or hidden) and its edges: the first and last shown.
function candidates(container: HTMLElement): HTMLElement[] {
	const nodes: HTMLElement[] = [];
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
		acceptNode: (node) => {
			const el = node as HTMLElement & { disabled?: boolean; type?: string };
			if (el.disabled || el.hidden || (el.tagName === 'INPUT' && el.type === 'hidden')) return NodeFilter.FILTER_SKIP;
			return el.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		},
	});
	while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);
	return nodes;
}

function isHidden(node: HTMLElement, upTo: HTMLElement): boolean {
	if (getComputedStyle(node).visibility === 'hidden') return true;
	for (let el: HTMLElement | null = node; el && el !== upTo; el = el.parentElement) if (getComputedStyle(el).display === 'none') return true;
	return false;
}

function focusSelect(el: HTMLElement): void {
	const before = document.activeElement;
	el.focus({ preventScroll: true });
	if (el !== before && el instanceof HTMLInputElement && 'select' in el) el.select();
}

/** FocusScope's mount autofocus: the first candidate that takes focus, links left out, else the container itself. */
export function focusFirst(container: HTMLElement): void {
	const before = document.activeElement;
	for (const el of candidates(container)) {
		if (el.tagName === 'A') continue;
		focusSelect(el);
		if (document.activeElement !== before) return;
	}
	container.focus({ preventScroll: true });
}

// Radix's Portal mounts an opening layer last, over every open one; Markless owns node order, so z-index does it here.
const raised = new WeakMap<Layer, () => void>();
function raise(layer: Layer): void {
	const z = (n: Element) => Number.parseInt(getComputedStyle(n).zIndex, 10) || 0;
	let over = -Infinity;
	for (const other of open) for (const n of other.nodes) if (layer.nodes[0]!.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) over = Math.max(over, z(n));
	const low = layer.nodes.filter((n) => getComputedStyle(n).position !== 'static' && z(n) <= over);
	if (!low.length) return;
	const was = low.map((n) => n.style.zIndex);
	for (const n of low) n.style.zIndex = String(over + 1);
	raised.set(layer, () => low.forEach((n, i) => (n.style.zIndex = was[i]!)));
}

/** Shows a control's content, places it off the trigger, and wires dismissal. Undefined when the page has none for it. */
export function openLayer(trigger: HTMLElement, key: string, options: { readonly modal?: boolean; readonly loop?: boolean; readonly anchor?: Anchor; readonly onDismiss: (layer: Layer, reason: 'escape' | 'outside' | 'focus', event?: Event) => void }): Layer | undefined {
	if (isOpen(key)) return open.find((l) => l.key === key);
	const nodes = layersFor(key);
	if (!nodes.length) return undefined;
	const wrapper = nodes.find((n) => n.hasAttribute('data-radix-popper-content-wrapper')) ?? null;
	// The content: the node with the layer's key for an id, else the one the trigger's aria-controls names (a trigger
	// keyed by its own id), else the wrapper's child.
	const byId = (id: string) => nodes.map((n) => (n.id === id ? n : n.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`))).find(Boolean);
	const controls = trigger.getAttribute('aria-controls');
	const content = (byId(key) ?? (controls ? byId(controls) : undefined) ?? (wrapper?.firstElementChild as HTMLElement | null) ?? nodes[0]!) as HTMLElement;
	stay(content);
	for (const n of nodes) n.hidden = false;
	const layer: Layer = { key, trigger, nodes, content, wrapper, modal: options.modal === true, cleanup: [] };
	if (wrapper) {
		wrapper.style.transform = 'translate(0px, -200%)';
		layer.stop = place(options.anchor ?? trigger, wrapper, optionsOf(wrapper, content));
	}
	content.setAttribute('data-state', 'open');
	raise(layer);
	if (layer.modal) {
		if (!open.some((l) => l.modal)) {
			bodyPointerEvents = document.body.style.pointerEvents;
			document.body.style.pointerEvents = 'none';
		}
		for (const n of nodes) n.style.pointerEvents = 'auto';
		layer.cleanup.push(hideOthers(nodes));
		layer.cleanup.push(lockScroll(nodes));
	} else if (open.some((l) => l.modal)) {
		// A layer over a modal one is outside what it hid: Radix portals it after hideOthers ran, or nests it inside.
		for (const n of nodes) {
			n.style.pointerEvents = 'auto';
			if (n.getAttribute('data-aria-hidden') !== 'true' || n.getAttribute('aria-hidden') !== 'true') continue;
			n.removeAttribute('aria-hidden');
			layer.cleanup.push(() => n.getAttribute('data-aria-hidden') === 'true' && n.setAttribute('aria-hidden', 'true'));
		}
	}
	open.push(layer);
	const onKey = (event: KeyboardEvent) => {
		if (top() !== layer) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			options.onDismiss(layer, 'escape', event);
		} else if (event.key === 'Tab' && options.loop && !event.altKey && !event.ctrlKey && !event.metaKey) {
			// A looping FocusScope, modal or not: Tab off either edge wraps; with nothing to tab to, focus stays on the content.
			const shown = candidates(content).filter((el) => !isHidden(el, content));
			const [first, last] = [shown[0], shown[shown.length - 1]];
			const focused = document.activeElement;
			if (!first || !last) {
				if (focused === content) event.preventDefault();
			} else if (!event.shiftKey && focused === last) {
				event.preventDefault();
				focusSelect(first);
			} else if (event.shiftKey && focused === first) {
				event.preventDefault();
				focusSelect(last);
			}
		} else if (event.key === 'Tab' && layer.modal) {
			const list = tabbables(content);
			if (!list.length) return event.preventDefault();
			const at = list.indexOf(document.activeElement as HTMLElement);
			if (event.shiftKey && at <= 0) {
				event.preventDefault();
				list[list.length - 1]!.focus();
			} else if (!event.shiftKey && at === list.length - 1) {
				event.preventDefault();
				list[0]!.focus();
			}
		}
	};
	const onDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (!target || top() !== layer || layer.nodes.some((n) => n.contains(target)) || trigger.contains(target)) return;
		pressedOutside = layer;
		try {
			options.onDismiss(layer, 'outside', event);
		} finally {
			pressedOutside = undefined;
		}
	};
	const timer = setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
	document.addEventListener('keydown', onKey, true);
	layer.cleanup.push(() => {
		clearTimeout(timer);
		document.removeEventListener('pointerdown', onDown, true);
		document.removeEventListener('keydown', onKey, true);
	});
	showCompanions(key, true);
	return layer;
}

/** Closes a layer: its exit animation runs, then it is hidden; focus goes back to the trigger unless `keepFocus`. */
export function closeLayer(layer: Layer, keepFocus = false): void {
	const at = open.indexOf(layer);
	if (at < 0) return;
	open.splice(at, 1);
	for (const c of layer.cleanup) c();
	showCompanions(layer.key, false);
	if (layer.modal && !open.some((l) => l.modal)) document.body.style.pointerEvents = bodyPointerEvents;
	if (!keepFocus) layer.trigger.focus({ preventScroll: true });
	// The press's own mousedown then blurs to the body; Radix's FocusScope returns focus to the trigger after it (the
	// press may have dismissed a layer above this one, a submenu, that closed it).
	if (!keepFocus && layer.modal && pressedOutside) {
		setTimeout(() => {
			if (!document.activeElement || document.activeElement === document.body) layer.trigger.focus({ preventScroll: true });
		});
	}
	leave(
		layer.content,
		() => layer.content.setAttribute('data-state', 'closed'),
		() => {
			layer.stop?.();
			raised.get(layer)?.();
			raised.delete(layer);
			for (const n of layer.nodes) n.hidden = true;
		},
	);
}
