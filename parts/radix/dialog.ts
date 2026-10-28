import { installDialog } from './dialog-engine.ts';
import { layersFor, closestTrigger, layerKey, layerSlot } from '../reveal.ts';

// Radix Dialog and AlertDialog, delegated: the trigger's aria-controls names the content captured from the old page. The
// content (and overlay) are mounted from their templates, then dialog-engine.ts (the shared port's engine, which does
// what Radix's Presence, DismissableLayer, FocusScope, FocusGuards, aria-hidden and react-remove-scroll do) is driven by
// their data-state. Closed and its exit animation over, a dialog leaves the page as Radix unmounts it.

const TRIGGER = '[aria-haspopup="dialog"][aria-controls][data-slot$="dialog-trigger"], [aria-haspopup="dialog"][aria-controls][data-slot="sheet-trigger"], [aria-haspopup="dialog"][aria-controls][data-slot="drawer-trigger"]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
// A plain button a page opens its dialog from (open state set on click, no ARIA) has the layer under its key.
// A trigger whose child has a -trigger data-slot of its own (shadcn's AttachmentTrigger) is known by its layer's content.
const isDialogSlot = (slot: string) => /(dialog|sheet|drawer)-trigger$/.test(slot);
function triggerOf(target: Element): HTMLElement | null {
	const trigger = target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[aria-haspopup="dialog"][aria-controls], [data-mm-key]:not([aria-haspopup]):not([data-state])', isDialogSlot);
	if (trigger) return trigger;
	for (let el = target.closest<HTMLElement>('[aria-haspopup="dialog"][aria-controls]'); el; el = el.parentElement?.closest<HTMLElement>('[aria-haspopup="dialog"][aria-controls]') ?? null) if (isDialogSlot(layerSlot(el))) return el;
	return null;
}
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
	if (!trigger.hasAttribute('aria-haspopup')) return;
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

// Dialogs the page showed open at load, opened again where they are.
const adopted = new Map<string, Open>();

function open(trigger: HTMLElement): boolean {
	const key = layerKey(trigger);
	if (opened.has(key)) return true;
	const shown = adopted.get(key);
	if (shown) {
		opened.set(key, shown);
		setTrigger(trigger, true);
		for (const el of [shown.overlay, shown.content]) el?.setAttribute('data-state', 'open');
		return true;
	}
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
		// Radix returns focus on close to its own Trigger only: a page's plain button that opened the dialog gets none.
		installDialog(trigger.hasAttribute('aria-haspopup') ? [trigger] : [], overlay, content, cancel, alert);
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

/**
 * A dialog the page shows open at load (its state opened it on mount, sidebar-13's settings) is taken as open: the
 * marks Radix's effects left in the captured page are cleared, then the engine mounts it as Radix would have.
 */
function adoptShown(): void {
	for (const trigger of document.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"][aria-expanded="true"][aria-controls]')) {
		const key = trigger.getAttribute('aria-controls')!;
		const content = document.getElementById(key);
		if (!content || content.getAttribute('data-state') !== 'open' || content.closest('[hidden]') || opened.has(key)) continue;
		const overlay = [...(content.parentElement?.children ?? [])].find((n): n is HTMLElement => n instanceof HTMLElement && /overlay/.test(n.dataset.slot ?? '') && n.getAttribute('data-state') === 'open');
		for (const el of document.querySelectorAll('[data-aria-hidden]')) {
			el.removeAttribute('aria-hidden');
			el.removeAttribute('data-aria-hidden');
		}
		document.body.style.removeProperty('pointer-events');
		document.body.removeAttribute('data-scroll-locked');
		const alert = content.getAttribute('role') === 'alertdialog';
		installed.add(key);
		installDialog([trigger], overlay, content, alert ? (content.querySelector<HTMLElement>('[data-slot$="dialog-cancel"]') ?? undefined) : undefined, alert);
		content.addEventListener('radixdismiss', () => close(key));
		const d = { trigger, nodes: overlay ? [overlay, content] : [content], content, overlay };
		adopted.set(key, d);
		opened.set(key, d);
	}
}

export function idle(): void {
	adoptShown();
}
