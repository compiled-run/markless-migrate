import { closeLayer, focusFirst, layerOf, openLayer, type Layer } from '../layer.ts';

// Radix Popover (@radix-ui/react-popover), non-modal as shadcn renders it: the trigger toggles the content, which takes
// focus on open; Escape, a press outside or focus leaving closes it, and focus goes back to the trigger unless the press
// outside landed on something that takes focus.

const TRIGGER = '[data-slot="popover-trigger"][aria-haspopup="dialog"][aria-controls]';

function setTrigger(trigger: HTMLElement, open: boolean): void {
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
}

function close(layer: Layer, keepFocus = false): void {
	setTrigger(layer.trigger, false);
	closeLayer(layer, keepFocus);
}

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger) {
		const key = trigger.getAttribute('aria-controls')!;
		const existing = layerOf(document.getElementById(key) ?? trigger);
		if (trigger.getAttribute('aria-expanded') === 'true' && existing) {
			close(existing);
			return true;
		}
		const layer = openLayer(trigger, key, { onDismiss: (l, reason) => close(l, reason === 'outside') });
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
