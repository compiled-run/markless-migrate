import { PARTS } from './registry.ts';
import { layersPending, loadLayers, swap } from './reveal.ts';

export interface Part {
	readonly click?: (target: Element, event: MouseEvent) => boolean;
	readonly keydown?: (target: Element, event: KeyboardEvent) => boolean;
	readonly pointerover?: (target: Element, event: PointerEvent) => boolean;
	readonly pointerout?: (target: Element, event: PointerEvent) => boolean;
	readonly pointerdown?: (target: Element, event: PointerEvent) => boolean;
	readonly focusin?: (target: Element, event: FocusEvent) => boolean;
	readonly focusout?: (target: Element, event: FocusEvent) => boolean;
	readonly contextmenu?: (target: Element, event: MouseEvent) => boolean;
	readonly input?: (target: Element, event: Event) => boolean;
	readonly submit?: (target: Element, event: SubmitEvent) => boolean;
	/** Starts what a part does to an element for as long as the page shows it (a scroll position kept, a size watched). */
	readonly mount?: (el: Element) => void;
	/** Runs once the page is idle: what the old page's code did on load wherever the page was scrolled (an Autoplay timer). */
	readonly idle?: () => void;
}

type Kind = keyof Part;

const handled = new WeakSet<Event>();
const EVENTS: readonly Kind[] = ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout', 'contextmenu', 'input', 'submit'];
let listening = false;

/** One handler per event type: each part claims the events its own markup receives. Each event is handled once. */
export function behave(event: Event): void {
	const target = event.target;
	if (!(target instanceof Element) || handled.has(event)) return;
	handled.add(event);
	const kind = event.type as Kind;
	// The document listeners also cover what the first interaction opens at the end of the body.
	listen();
	// A control that takes itself away swaps its container's content; a part may still port the rest of its handler.
	if (kind === 'click') {
		const control = target.closest('[data-mm-replace]');
		if (control) swap(control);
	}
	if (run(kind, target, event)) return;
	// A use no part answered may need a served layer not mounted yet: a crossing fetches it, a press is answered once it is in.
	if (kind === 'pointerout' || kind === 'focusout' || !layersPending()) return;
	const loaded = loadLayers();
	if (kind === 'click' || kind === 'keydown' || kind === 'contextmenu') void loaded.then(() => run(kind, target, event));
}

function run(kind: Kind, target: Element, event: Event): boolean {
	for (const part of PARTS) {
		const handler = part[kind] as ((target: Element, event: Event) => boolean) | undefined;
		if (handler?.(target, event)) return true;
	}
	return false;
}

/**
 * Listens on the document too, once the page is idle: content a part mounts at the end of the body (a dialog, a menu)
 * is outside the page's root, and a shortcut pressed with nothing focused reaches only the document.
 */
export function listen(): void {
	void loadLayers();
	if (listening) return;
	listening = true;
	for (const type of EVENTS) document.addEventListener(type, behave);
	for (const part of PARTS) part.idle?.();
}

/** Runs every part's mount for the elements carrying `attribute`, once each; the converter calls it when they become visible. */
const mounted = new WeakSet<Element>();
export function mount(attribute: string): void {
	for (const el of document.querySelectorAll(`[${attribute}]`)) {
		if (mounted.has(el)) continue;
		mounted.add(el);
		for (const part of PARTS) part.mount?.(el);
	}
}
