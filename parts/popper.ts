import { autoUpdate, computePosition, flip, hide, limitShift, offset, shift, size, type Middleware, type Placement } from '@floating-ui/dom';

// Radix Popper (@radix-ui/react-popper 1.2): content in a fixed `[data-radix-popper-content-wrapper]` placed off its
// anchor by @floating-ui/dom with offset, shift (partial sticky), flip and size middleware, the available and anchor
// sizes in --radix-popper-* properties, the transform origin from the placed side, and data-side/data-align on the content.

export interface PlaceOptions {
	readonly side: string;
	readonly align: string;
	readonly sideOffset: number;
	readonly alignOffset: number;
	readonly collisionPadding?: number;
}

const transformOrigin: Middleware = {
	name: 'transformOrigin',
	fn({ placement, rects }) {
		const [side, align = 'center'] = placement.split('-') as [string, string?];
		const noArrow = { start: '0%', center: '50%', end: '100%' }[align] ?? '50%';
		const x = side === 'bottom' || side === 'top' ? noArrow : side === 'right' ? '0px' : `${rects.floating.width}px`;
		const y = side === 'bottom' ? '0px' : side === 'top' ? `${rects.floating.height}px` : noArrow;
		return { data: { x, y } };
	},
};

// PopperArrow: a positioned span holding the arrow's svg, measured as Radix's useSize measures it.
function arrowHeight(content: Element | null): number {
	const svg = content ? [...content.children].find((c) => c.tagName === 'SPAN' && (c as HTMLElement).style.position === 'absolute')?.querySelector('svg') : null;
	return svg ? parseFloat(getComputedStyle(svg).height) || 0 : 0;
}

const placed = new WeakMap<HTMLElement, () => void>();

/** Places a wrapper off its anchor and keeps it placed while it is open; `stop` ends the tracking. */
export function place(anchor: Element, wrapper: HTMLElement, options: PlaceOptions): () => void {
	const content = wrapper.firstElementChild as HTMLElement | null;
	const placement = (options.align === 'center' ? options.side : `${options.side}-${options.align}`) as Placement;
	const padding = options.collisionPadding ?? 0;
	const detect = { padding, boundary: [] as Element[], altBoundary: false };
	wrapper.style.position = 'fixed';
	wrapper.style.left = '0px';
	wrapper.style.top = '0px';
	wrapper.style.minWidth = 'max-content';
	if (content) wrapper.style.zIndex = getComputedStyle(content).zIndex;
	const update = () =>
		computePosition(anchor, wrapper, {
			strategy: 'fixed',
			placement,
			middleware: [
				// Radix adds its arrow's height to the side offset (PopperContent's offset middleware).
				offset({ mainAxis: options.sideOffset + arrowHeight(content), alignmentAxis: options.alignOffset }),
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
				transformOrigin,
				hide({ strategy: 'referenceHidden', ...detect }),
			],
		}).then(({ x, y, placement: at, middlewareData }) => {
			const dpr = window.devicePixelRatio || 1;
			const round = (v: number) => Math.round(v * dpr) / dpr;
			wrapper.style.transform = `translate(${round(x)}px, ${round(y)}px)`;
			const origin = middlewareData.transformOrigin as { x: string; y: string } | undefined;
			if (origin) wrapper.style.setProperty('--radix-popper-transform-origin', `${origin.x} ${origin.y}`);
			const [side, align = 'center'] = at.split('-') as [string, string?];
			content?.setAttribute('data-side', side);
			content?.setAttribute('data-align', align);
		});
	void update();
	const stop = autoUpdate(anchor, wrapper, update);
	placed.set(wrapper, stop);
	return stop;
}

/** The placement a layer asks for: the captured content's own side and alignment, and the source's offsets. */
export function optionsOf(layer: HTMLElement, content: Element | null): PlaceOptions {
	return {
		side: content?.getAttribute('data-side') ?? 'bottom',
		align: content?.getAttribute('data-align') ?? 'center',
		sideOffset: Number(layer.dataset.mmSideOffset ?? '0'),
		alignOffset: Number(layer.dataset.mmAlignOffset ?? '0'),
	};
}
