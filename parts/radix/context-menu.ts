import { closeLayer, layerOf, openLayer, type Layer } from '../layer.ts';
import { layersFor, closestTrigger, layerKey } from '../reveal.ts';
import { clearHighlight, closeSubs, menuRoot, trackMenu } from './dropdown-menu.ts';

// Radix ContextMenu: a right press (or a long touch) on the trigger area opens the menu at the pointer, modal, with
// its content focused; the dropdown-menu port's item rules (arrows, typeahead, choosing closes) apply to it as to any
// Radix menu. The trigger area carries data-state.
const TRIGGER = ':is([data-slot="context-menu-trigger"], [data-mm-part="context-menu-trigger"])[data-state]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[data-state][data-mm-key], [data-state][id]', (slot) => /^context-menu-trigger$/.test(slot));
const keyOf = (t: HTMLElement) => layerKey(t);
const open = new Map<HTMLElement, Layer>();

function close(trigger: HTMLElement, layer: Layer): void {
	open.delete(trigger);
	closeSubs(layer);
	trigger.setAttribute('data-state', 'closed');
	clearHighlight(layer);
	closeLayer(layer, true);
}

export function contextmenu(target: Element, event: MouseEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger) return false;
	event.preventDefault();
	const was = open.get(trigger);
	if (was) close(trigger, was);
	const x = event.clientX;
	const y = event.clientY;
	const anchor = { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) };
	const key = keyOf(trigger);
	// ContextMenu's content sits 2 px off the pointer (Radix passes sideOffset 2 itself).
	if (key) for (const n of layersFor(key)) if (n.hasAttribute('data-radix-popper-content-wrapper') && n.dataset.mmSideOffset === undefined) n.dataset.mmSideOffset = '2';
	const layer = key ? openLayer(trigger, key, { modal: true, anchor, onDismiss: (l) => close(trigger, l) }) : undefined;
	if (!layer) return false;
	open.set(trigger, layer);
	trackMenu(layer, () => close(trigger, layer));
	trigger.setAttribute('data-state', 'open');
	clearHighlight(layer);
	layer.content.focus({ preventScroll: true });
	return true;
}

export function click(target: Element): boolean {
	const item = target.closest<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]');
	const layer = item && layerOf(item);
	if (!item || !layer || item.hasAttribute('data-disabled') || item.getAttribute('aria-haspopup') === 'menu') return false;
	const root = menuRoot(layer);
	for (const [trigger, l] of open) if (l === root) {
		close(trigger, l);
		return true;
	}
	return false;
}
