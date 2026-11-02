import { arrow, autoUpdate, computePosition, flip, hide, limitShift, offset, shift, size, type Middleware, type Placement } from '@floating-ui/dom';

// Radix Popper (@radix-ui/react-popper 1.2): content in a fixed `[data-radix-popper-content-wrapper]` placed off its
// anchor by @floating-ui/dom with offset, shift (partial sticky), flip and size middleware, the available and anchor
// sizes in --radix-popper-* properties, the arrow placed, the transform origin from the placed side and the arrow, and
// data-side/data-align on the content.

export interface PlaceOptions {
	readonly side: string;
	readonly align: string;
	readonly sideOffset: number;
	readonly alignOffset: number;
	readonly collisionPadding?: number;
}

// PopperArrow: a positioned span holding the arrow's svg, measured as Radix's useSize measures it.
function arrowOf(content: Element | null): { span: HTMLElement; width: number; height: number } | undefined {
	const span = content ? ([...content.children].find((c) => c.tagName === 'SPAN' && (c as HTMLElement).style.position === 'absolute') as HTMLElement | undefined) : undefined;
	const svg = span?.querySelector('svg');
	if (!span || !svg) return undefined;
	const cs = getComputedStyle(svg);
	return { span, width: parseFloat(cs.width) || 0, height: parseFloat(cs.height) || 0 };
}

// Radix's transformOrigin middleware: the arrow's centre on the cross axis (the alignment when it cannot be centred or
// there is none), and the arrow's height beyond the content's edge on the main axis.
function transformOrigin(arrowSize: { width: number; height: number } | undefined): Middleware {
	return {
		name: 'transformOrigin',
		fn({ placement, rects, middlewareData }) {
			const hidden = middlewareData.arrow?.centerOffset !== 0;
			const w = hidden ? 0 : (arrowSize?.width ?? 0);
			const h = hidden ? 0 : (arrowSize?.height ?? 0);
			const [side, align = 'center'] = placement.split('-') as [string, string?];
			const noArrow = { start: '0%', center: '50%', end: '100%' }[align] ?? '50%';
			const ax = `${(middlewareData.arrow?.x ?? 0) + w / 2}px`;
			const ay = `${(middlewareData.arrow?.y ?? 0) + h / 2}px`;
			const x = side === 'bottom' || side === 'top' ? (hidden ? noArrow : ax) : side === 'right' ? `${-h}px` : `${rects.floating.width + h}px`;
			const y = side === 'bottom' ? `${-h}px` : side === 'top' ? `${rects.floating.height + h}px` : hidden ? noArrow : ay;
			return { data: { x, y } };
		},
	};
}

const placed = new WeakMap<HTMLElement, () => void>();

/** Places a wrapper off its anchor and keeps it placed while it is open; `stop` ends the tracking. */
/** An element, or a point a context menu opens at (Radix's virtual anchor). */
export type Anchor = Element | { getBoundingClientRect(): DOMRect };

export function place(anchor: Anchor, wrapper: HTMLElement, options: PlaceOptions): () => void {
	const content = wrapper.firstElementChild as HTMLElement | null;
	const arrowEl = arrowOf(content);
	const placement = (options.align === 'center' ? options.side : `${options.side}-${options.align}`) as Placement;
	const padding = options.collisionPadding ?? 0;
	const detect = { padding, boundary: [] as Element[], altBoundary: false };
	wrapper.style.position = 'fixed';
	wrapper.style.left = '0px';
	wrapper.style.top = '0px';
	wrapper.style.minWidth = 'max-content';
	// Radix's first frame has none of the placement's variables (the origin is the centre, max-height none) until
	// floating-ui has placed it: what transitions from there on the old page transitions here too.
	for (const p of [...wrapper.style].filter((name) => name.startsWith('--radix-popper-'))) wrapper.style.removeProperty(p);
	if (content) wrapper.style.zIndex = getComputedStyle(content).zIndex;
	const update = () =>
		computePosition(anchor, wrapper, {
			strategy: 'fixed',
			placement,
			middleware: [
				// Radix adds its arrow's height to the side offset (PopperContent's offset middleware).
				offset({ mainAxis: options.sideOffset + (arrowEl?.height ?? 0), alignmentAxis: options.alignOffset }),
				shift({ mainAxis: true, crossAxis: false, limiter: limitShift(), ...detect }),
				flip({ ...detect }),
				size({
					...detect,
					apply({ elements, rects, availableWidth, availableHeight }) {
						const style = elements.floating.style;
						style.setProperty('--radix-popper-available-width', `${availableWidth}px`);
						style.setProperty('--radix-popper-available-height', `${availableHeight}px`);
						style.setProperty('--radix-popper-anchor-width', `${rects.reference.width}px`);
						style.setProperty('--radix-popper-anchor-height', `${rects.reference.height}px`);
					},
				}),
				...(arrowEl ? [arrow({ element: arrowEl.span, padding: 0 })] : []),
				transformOrigin(arrowEl),
				hide({ strategy: 'referenceHidden', ...detect }),
			],
		}).then(({ x, y, placement: at, middlewareData }) => {
			const dpr = window.devicePixelRatio || 1;
			const round = (v: number) => Math.round(v * dpr) / dpr;
			wrapper.style.transform = `translate(${round(x)}px, ${round(y)}px)`;
			const origin = middlewareData.transformOrigin as { x: string; y: string } | undefined;
			if (origin) wrapper.style.setProperty('--radix-popper-transform-origin', `${origin.x} ${origin.y}`);
			const [side, align = 'center'] = at.split('-') as [string, string?];
			const placedArrow = middlewareData.arrow;
			if (arrowEl && placedArrow) {
				arrowEl.span.style.left = placedArrow.x !== undefined ? `${placedArrow.x}px` : '';
				arrowEl.span.style.top = placedArrow.y !== undefined ? `${placedArrow.y}px` : '';
				arrowEl.span.style.visibility = placedArrow.centerOffset !== 0 ? 'hidden' : '';
			}
			content?.setAttribute('data-side', side);
			content?.setAttribute('data-align', align);
		});
	void update();
	const stop = autoUpdate(anchor, wrapper, update);
	placed.set(wrapper, stop);
	return stop;
}

/** The placement a layer asks for: the captured content's own side, alignment and offsets, else the source's offsets. */
export function optionsOf(layer: HTMLElement, content: Element | null): PlaceOptions {
	return {
		// What the source asked for (convert reads it off the instance); data-side is where it went, after any flip.
		side: content?.getAttribute('data-mm-side') ?? content?.getAttribute('data-side') ?? 'bottom',
		align: content?.getAttribute('data-mm-align') ?? content?.getAttribute('data-align') ?? 'center',
		sideOffset: Number(content?.getAttribute('data-mm-side-offset') ?? layer.dataset.mmSideOffset ?? '0'),
		alignOffset: Number(content?.getAttribute('data-mm-align-offset') ?? layer.dataset.mmAlignOffset ?? '0'),
	};
}
