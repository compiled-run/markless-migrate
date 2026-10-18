// Alpine.js's Anchor plugin, x-anchor (MIT, Caleb Porzio), on the same Floating UI library.
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';

const POSITIONS = ['top', 'top-start', 'top-end', 'right', 'right-start', 'right-end', 'bottom', 'bottom-start', 'bottom-end', 'left', 'left-start', 'left-end'];

/** x-anchor="reference": positions the element by the reference; onMove receives $anchor's x and y. */
export function anchor(el: HTMLElement | undefined, reference: Element | null | undefined, modifiers: readonly string[], onMove?: (x: number, y: number) => void): void {
	if (!el || !reference) return;
	const placement = POSITIONS.find((p) => modifiers.includes(p)) as Placement | undefined;
	const at = modifiers.indexOf('offset');
	const offsetValue = at !== -1 && modifiers[at + 1] !== undefined ? Number(modifiers[at + 1]) : 0;
	const unstyled = modifiers.includes('no-style');
	const allowFlip = !modifiers.includes('noflip');
	const strategy = modifiers.includes('fixed') ? 'fixed' : 'absolute';
	let previous = '';
	let release = () => {};
	const compute = () => {
		if (!el.isConnected) return release();
		void computePosition(reference, el, { placement, strategy, middleware: [allowFlip && flip(), shift({ padding: 5 }), offset(offsetValue)] }).then(({ x, y }) => {
			if (!unstyled) Object.assign(el.style, { left: `${x}px`, top: `${y}px`, position: strategy });
			if (JSON.stringify({ x, y }) !== previous) onMove?.(x, y);
			previous = JSON.stringify({ x, y });
		});
	};
	release = autoUpdate(reference, el, compute);
}
