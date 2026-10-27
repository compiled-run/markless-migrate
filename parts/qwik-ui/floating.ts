// What @qwik-ui/headless's popover parts share (popover/floating.tsx, popover-panel-impl.tsx, select/use-select.tsx):
// the native popover shown and hidden by id, data-open/data-closed following it, floating-ui placement with the
// middleware in Qwik UI's order, the next enabled item with optional looping, typeahead and the outside press.
import { autoUpdate, computePosition, flip, hide, offset, shift, type Placement } from '@floating-ui/dom';

const stops = new WeakMap<HTMLElement, () => void>();

export const open = (el: Element | null | undefined) => el?.hasAttribute('data-open') === true;

/** data-open / data-closed: exactly one of them, bare. */
export function mark(els: readonly (Element | null | undefined)[], on: boolean): void {
	for (const el of els) {
		if (!el) continue;
		el.toggleAttribute('data-open', on);
		el.toggleAttribute('data-closed', !on);
	}
}

/** The gutter convert measured on the old page (data-mm-gutter), as Qwik UI's `gutter` prop passed to offset(). */
const gutterOf = (panel: HTMLElement) => Number(panel.dataset.mmGutter ?? 0);

/** Placement: the panel's `floating` prop is in no markup, so convert writes the side the old page placed it on (data-mm-placement). */
const placementOf = (panel: HTMLElement, fallback: Placement) => (panel.dataset.mmPlacement as Placement | undefined) ?? fallback;

/**
 * Shows a floating panel the way Qwik UI's FloatingPopover does: `hidden` off first, then computePosition with
 * offset(gutter), hide, flip (shift only where convert saw the old page shift it), written as left/top, kept up to date.
 */
export function place(anchor: HTMLElement, panel: HTMLElement, fallback: Placement = 'bottom'): void {
	panel.hidden = false;
	stops.get(panel)?.();
	const strategy = panel.getAttribute('data-floating') === 'fixed' ? 'fixed' : 'absolute';
	const update = () => {
		void computePosition(anchor, panel, {
			placement: placementOf(panel, fallback),
			strategy,
			middleware: [offset(gutterOf(panel)), hide({ strategy: 'referenceHidden' }), ...(panel.dataset.mmFlip === 'false' ? [] : [flip()]), ...(panel.dataset.mmShift === 'true' ? [shift()] : [])],
		}).then(({ x, y }) => {
			if (document.documentElement.dir === 'rtl') panel.style.right = `${document.body.clientWidth - Math.max(x, 0) - panel.offsetWidth}px`;
			else panel.style.left = `${x}px`;
			panel.style.top = `${y}px`;
		});
	};
	stops.set(panel, autoUpdate(anchor, panel, update, { ancestorScroll: true, ancestorResize: true, elementResize: true, animationFrame: false }));
}

export function unplace(panel: HTMLElement): void {
	stops.get(panel)?.();
	stops.delete(panel);
}

export function showPanel(panel: HTMLElement): void {
	if (panel.isConnected && !panel.matches(':popover-open')) panel.showPopover();
}

export function hidePanel(panel: HTMLElement): void {
	if (panel.isConnected && panel.matches(':popover-open')) panel.hidePopover();
}

export const enabled = (el: Element) => el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('data-disabled') && !el.hasAttribute('disabled');

/** The next enabled item from `at` in `dir`, wrapping only with loop (Qwik UI's getNextEnabledItemIndex). */
export function step<T extends Element>(items: readonly T[], at: number, dir: 1 | -1, loop: boolean, usable: (el: T) => boolean = enabled): T | undefined {
	for (let i = 1; i <= items.length; i++) {
		let n = at + dir * i;
		if (loop) n = ((n % items.length) + items.length) % items.length;
		else if (n < 0 || n >= items.length) return undefined;
		if (usable(items[n]!)) return items[n];
	}
	return undefined;
}

export interface Typing {
	text: string;
	last: string;
	timer: ReturnType<typeof setTimeout> | undefined;
	repeat: number;
}

export const newTyping = (): Typing => ({ text: '', last: '', timer: undefined, repeat: 0 });

/**
 * Qwik UI's useTypeahead: one character jumps to the first item whose text starts with it, the same character again to
 * the next one; characters typed within a second match the typed prefix.
 */
export function typeahead<T extends Element>(typing: Typing, key: string, items: readonly T[], label: (el: T) => string, usable: (el: T) => boolean = enabled): T | undefined {
	if (key.length !== 1) return undefined;
	const char = key.toLowerCase();
	clearTimeout(typing.timer);
	typing.timer = setTimeout(() => {
		typing.text = '';
		typing.repeat = 0;
	}, 1000);
	const candidates = items.filter(usable);
	if (typing.text === '' || (typing.text.length === 1 && typing.text === char)) {
		typing.repeat = typing.text === char ? typing.repeat + 1 : 0;
		typing.text = char;
		const matches = candidates.filter((el) => label(el).trim().toLowerCase().startsWith(char));
		return matches.length ? matches[typing.repeat % matches.length] : undefined;
	}
	typing.text += char;
	return candidates.find((el) => label(el).trim().toLowerCase().startsWith(typing.text));
}

/** Whether a press lands outside every one of the boxes (Qwik UI compares the panel's and the trigger's rectangles). */
export function outside(event: PointerEvent, els: readonly (Element | null | undefined)[]): boolean {
	return els.every((el) => {
		if (!el) return true;
		const r = el.getBoundingClientRect();
		return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
	});
}
