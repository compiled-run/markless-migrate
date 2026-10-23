import { installDialog } from './dialog-engine.ts';
import { layersFor, closestTrigger, layerKey } from '../reveal.ts';

// Radix Dialog and AlertDialog, delegated: the trigger's aria-controls names the content captured from the old page. The
// content (and overlay) are mounted from their templates, then dialog-engine.ts (the shared port's engine, which does
// what Radix's Presence, DismissableLayer, FocusScope, FocusGuards, aria-hidden and react-remove-scroll do) is driven by
// their data-state. Closed and its exit animation over, a dialog leaves the page as Radix unmounts it.

const TRIGGER = '[aria-haspopup="dialog"][aria-controls][data-slot$="dialog-trigger"], [aria-haspopup="dialog"][aria-controls][data-slot="sheet-trigger"], [aria-haspopup="dialog"][aria-controls][data-slot="drawer-trigger"]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[aria-haspopup="dialog"][aria-controls]', (slot) => /(dialog|sheet|drawer)-trigger$/.test(slot));
const CLOSE = '[data-slot$="dialog-close"], [data-slot="sheet-close"], [data-slot$="dialog-cancel"], [data-slot$="dialog-action"]';

interface Open {
	readonly trigger: HTMLElement;
	readonly nodes: HTMLElement[];
	readonly content: HTMLElement;
	readonly overlay: HTMLElement | undefined;
}

const opened = new Map<string, Open>();
const installed = new Set<string>();

function setTrigger(trigger: HTMLElement, open: boolean): void {
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
}

function close(key: string): void {
	const d = opened.get(key);
	if (!d) return;
	opened.delete(key);
	setTrigger(d.trigger, false);
	// dialog-engine.ts hides each part once its exit animation ends.
	for (const el of [d.overlay, d.content]) el?.setAttribute('data-state', 'closed');
}

function open(trigger: HTMLElement): boolean {
	const key = layerKey(trigger);
	if (opened.has(key)) return true;
	const nodes = layersFor(key);
	if (!nodes.length) return false;
	const content = nodes.find((n) => n.id === key) ?? nodes.find((n) => n.querySelector(`[id="${CSS.escape(key)}"]`))?.querySelector<HTMLElement>(`[id="${CSS.escape(key)}"]`) ?? nodes.find((n) => /dialog|sheet|drawer/.test(n.getAttribute('role') ?? '') || /content/.test(n.dataset.slot ?? ''));
	if (!content) return false;
	const overlay = nodes.find((n) => /overlay/.test(n.dataset.slot ?? ''));
	// The layer nodes other than the overlay and content (a wrapper) are shown; the engine shows and hides those two.
	for (const n of nodes) if (n !== overlay && n !== content && !n.contains(content)) n.hidden = false;
	const alert = content.getAttribute('role') === 'alertdialog';
	const cancel = alert ? (content.querySelector<HTMLElement>('[data-slot$="dialog-cancel"]') ?? undefined) : undefined;
	if (!installed.has(key)) {
		installed.add(key);
		installDialog([trigger], overlay, content, cancel, alert);
		content.addEventListener('radixdismiss', () => close(key));
	}
	opened.set(key, { trigger, nodes, content, overlay });
	setTrigger(trigger, true);
	for (const el of [overlay, content]) el?.setAttribute('data-state', 'open');
	return true;
}

export function click(target: Element): boolean {
	const trigger = triggerOf(target);
	if (trigger) return open(trigger);
	const closer = target.closest<HTMLElement>(CLOSE);
	if (!closer) return false;
	for (const [key, d] of opened) {
		if (!d.content.contains(closer)) continue;
		close(key);
		return true;
	}
	return false;
}

/** Opens or closes the dialog a trigger controls, for a page's own shortcut (a command menu on ⌘K). */
export function toggle(trigger: HTMLElement): void {
	const key = layerKey(trigger);
	if (!key) return;
	if (opened.has(key)) close(key);
	else open(trigger);
}

export function closeContaining(el: Element): boolean {
	for (const [key, d] of opened) if (d.content.contains(el)) {
		close(key);
		return true;
	}
	return false;
}
