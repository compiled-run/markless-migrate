import { optionsOf, place } from './popper.ts';
import { leave, stay } from './presence.ts';
import { layersFor } from './reveal.ts';
import { hideOthers } from './aria-hidden.ts';

// What Radix's Portal, DismissableLayer and FocusScope do around a popover, menu, select or tooltip, on the content
// Markless renders at the end of the body: shown on open, Escape and a press outside closing the top layer, focus
// moved in on open and back to the trigger on close, Tab kept inside a modal layer. Radix's focus guard spans are not
// added (the page Markless renders gets no nodes from a part); a modal layer traps Tab itself instead.

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

export const isOpen = (key: string) => open.some((l) => l.key === key);
export const top = () => open[open.length - 1];
export const layerOf = (el: Element) => open.find((l) => l.nodes.some((n) => n.contains(el)));

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const tabbables = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.getClientRects().length > 0);

export function focusFirst(container: HTMLElement): void {
	(tabbables(container)[0] ?? container).focus({ preventScroll: true });
}

/** Shows a control's content, places it off the trigger, and wires dismissal. Undefined when the page has none for it. */
export function openLayer(trigger: HTMLElement, key: string, options: { readonly modal?: boolean; readonly onDismiss: (layer: Layer, reason: 'escape' | 'outside' | 'focus') => void }): Layer | undefined {
	if (isOpen(key)) return open.find((l) => l.key === key);
	const nodes = layersFor(key);
	if (!nodes.length) return undefined;
	const wrapper = nodes.find((n) => n.hasAttribute('data-radix-popper-content-wrapper')) ?? null;
	const content = (nodes.map((n) => (n.id === key ? n : n.querySelector<HTMLElement>(`[id="${CSS.escape(key)}"]`))).find(Boolean) ?? (wrapper?.firstElementChild as HTMLElement | null) ?? nodes[0]!) as HTMLElement;
	stay(content);
	for (const n of nodes) n.hidden = false;
	const layer: Layer = { key, trigger, nodes, content, wrapper, modal: options.modal === true, cleanup: [] };
	if (wrapper) {
		wrapper.style.transform = 'translate(0px, -200%)';
		layer.stop = place(trigger, wrapper, optionsOf(wrapper, content));
	}
	content.setAttribute('data-state', 'open');
	if (layer.modal) {
		if (!open.some((l) => l.modal)) {
			bodyPointerEvents = document.body.style.pointerEvents;
			document.body.style.pointerEvents = 'none';
		}
		for (const n of nodes) n.style.pointerEvents = 'auto';
		layer.cleanup.push(hideOthers(nodes));
	}
	open.push(layer);
	const onKey = (event: KeyboardEvent) => {
		if (top() !== layer) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			options.onDismiss(layer, 'escape');
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

/** Closes a layer: its exit animation runs, then it is hidden; focus goes back to the trigger unless `keepFocus`. */
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
			for (const n of layer.nodes) n.hidden = true;
		},
	);
}
