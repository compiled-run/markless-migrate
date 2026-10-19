import { PARTS } from './registry.ts';

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
}

type Kind = keyof Part;

/** One handler per event type on the body: each part claims the events its own markup receives. */
export function behave(event: Event): void {
	const target = event.target;
	if (!(target instanceof Element)) return;
	const kind = event.type as Kind;
	for (const part of PARTS) {
		const handler = part[kind] as ((target: Element, event: Event) => boolean) | undefined;
		if (handler?.(target, event)) return;
	}
}
