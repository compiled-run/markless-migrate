import { optionsOf, place } from './popper.ts';
import { leave } from './presence.ts';
import { templatesFor } from './reveal.ts';
import { hideOthers } from './aria-hidden.ts';

// What Radix's Portal, DismissableLayer, FocusGuards and FocusScope do around a popover, menu, select or tooltip: the
// content mounted at the end of the body, a focus guard at each end of the body while any layer is open, Escape and a
// press outside closing the top layer, focus moved in on open and back to the trigger on close.

export interface Layer {
	readonly key: string;
	readonly trigger: HTMLElement;
	readonly nodes: Element[];
	readonly content: HTMLElement;
	readonly wrapper: HTMLElement | null;
	readonly modal: boolean;
	stop?: () => void;
	cleanup: (() => void)[];
}

const open: Layer[] = [];
let guards: HTMLSpanElement[] = [];
let bodyPointerEvents = '';

const GUARD = 'outline: none; opacity: 0; position: fixed; pointer-events: none;';

function addGuards(): void {
	if (guards.length) return;
	const make = () => {
		const span = document.createElement('span');
		span.setAttribute('data-radix-focus-guard', '');
		span.tabIndex = 0;
		span.style.cssText = GUARD;
		return span;
	};
	guards = [make(), make()];
	document.body.insertAdjacentElement('afterbegin', guards[0]!);
	document.body.insertAdjacentElement('beforeend', guards[1]!);
}

function removeGuards(): void {
	if (open.length) return;
	for (const g of guards) g.remove();
	guards = [];
}

export const isOpen = (key: string) => open.some((l) => l.key === key);
export const top = () => open[open.length - 1];
export const layerOf = (el: Element) => open.find((l) => l.nodes.some((n) => n.contains(el)));

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusFirst(container: HTMLElement): void {
	const first = [...container.querySelectorAll<HTMLElement>(TABBABLE)].find((el) => el.getClientRects().length > 0);
	(first ?? container).focus({ preventScroll: true });
}

/** Mounts a control's templates, places the content off the trigger, and wires dismissal. Returns the layer, or undefined with nothing to show. */
export function openLayer(trigger: HTMLElement, key: string, options: { readonly modal?: boolean; readonly contentSelector?: string; readonly onDismiss: (layer: Layer, reason: 'escape' | 'outside' | 'focus') => void }): Layer | undefined {
	if (isOpen(key)) return open.find((l) => l.key === key);
	const templates = templatesFor(key).filter((t) => t.dataset.mmInto === 'body');
	if (!templates.length) return undefined;
	const nodes: Element[] = [];
	for (const t of templates) for (const n of t.content.cloneNode(true).childNodes) if (n instanceof Element) nodes.push(n);
	const wrapper = nodes.find((n) => n.hasAttribute('data-radix-popper-content-wrapper')) as HTMLElement | undefined;
	const content = (nodes.map((n) => (n.id === key ? n : n.querySelector(`[id="${CSS.escape(key)}"]`))).find(Boolean) ?? wrapper?.firstElementChild ?? nodes[0]) as HTMLElement;
	addGuards();
	for (const n of nodes) document.body.insertBefore(n, guards[1] ?? null);
	const layer: Layer = { key, trigger, nodes, content, wrapper: wrapper ?? null, modal: options.modal === true, cleanup: [] };
	if (wrapper) {
		wrapper.style.transform = 'translate(0px, -200%)';
		layer.stop = place(trigger, wrapper, optionsOf(templates[0]!, content));
	}
	content.setAttribute('data-state', 'open');
	if (layer.modal) {
		if (!open.some((l) => l.modal)) {
			bodyPointerEvents = document.body.style.pointerEvents;
			document.body.style.pointerEvents = 'none';
		}
		for (const n of nodes) (n as HTMLElement).style.pointerEvents = 'auto';
		layer.cleanup.push(hideOthers(nodes));
	}
	open.push(layer);
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Escape' || top() !== layer) return;
		event.preventDefault();
		options.onDismiss(layer, 'escape');
	};
	const onDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (!target || top() !== layer || layer.nodes.some((n) => n.contains(target)) || trigger.contains(target)) return;
		options.onDismiss(layer, 'outside');
	};
	const timer = setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
	document.addEventListener('keydown', onKey, true);
	layer.cleanup.push(() => {
		clearTimeout(timer);
		document.removeEventListener('pointerdown', onDown, true);
		document.removeEventListener('keydown', onKey, true);
	});
	return layer;
}

/** Closes a layer: its exit animation runs, then it leaves the page; focus goes back to the trigger unless `keepFocus`. */
export function closeLayer(layer: Layer, keepFocus = false): void {
	const at = open.indexOf(layer);
	if (at < 0) return;
	open.splice(at, 1);
	for (const c of layer.cleanup) c();
	if (layer.modal && !open.some((l) => l.modal)) document.body.style.pointerEvents = bodyPointerEvents;
	if (!keepFocus) layer.trigger.focus({ preventScroll: true });
	leave(
		layer.content,
		() => layer.content.setAttribute('data-state', 'closed'),
		() => {
			layer.stop?.();
			for (const n of layer.nodes) n.remove();
			removeGuards();
		},
	);
}
