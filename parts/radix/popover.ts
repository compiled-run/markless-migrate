import { closeLayer, focusFirst, layerOf, openLayer, type Layer } from '../layer.ts';
import { closestTrigger, layerKey } from '../reveal.ts';

// Radix Popover (@radix-ui/react-popover), non-modal as shadcn renders it: the trigger toggles the content, which takes
// focus on open (its first control that is not a link) and loops Tab inside, as its FocusScope does; Escape, a press
// outside or focus leaving closes it, and focus goes back to the trigger unless the press outside landed on something
// that takes focus.

const TRIGGER = '[data-slot="popover-trigger"][aria-haspopup="dialog"][aria-controls]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[aria-haspopup="dialog"][aria-controls]', (slot) => /^popover-trigger$/.test(slot));

function setTrigger(trigger: HTMLElement, open: boolean): void {
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
}

function close(layer: Layer, keepFocus = false): void {
	setTrigger(layer.trigger, false);
	closeLayer(layer, keepFocus);
}

export function click(target: Element): boolean {
	const trigger = triggerOf(target);
	if (trigger) {
		const key = layerKey(trigger);
		const existing = layerOf(document.getElementById(trigger.getAttribute('aria-controls') ?? '') ?? trigger);
		if (trigger.getAttribute('aria-expanded') === 'true' && existing) {
			close(existing);
			return true;
		}
		const layer = openLayer(trigger, key, { loop: true, onDismiss: (l, reason) => close(l, reason === 'outside') });
		if (!layer) return false;
		setTrigger(trigger, true);
		focusFirst(layer.content);
		return true;
	}
	const closer = target.closest<HTMLElement>('[data-slot="popover-close"]');
	const layer = closer && layerOf(closer);
	if (layer) {
		close(layer);
		return true;
	}
	return false;
}
