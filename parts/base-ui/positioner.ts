import { arrow, autoUpdate, computePosition, flip, limitShift, offset, shift, size, type Middleware, type Placement } from '@floating-ui/dom';

// Base UI's useAnchorPositioning (@base-ui/react 1.6): offset on both axes, shift then flip when centred (flip then
// shift otherwise) with a collision padding biased 1 px away from the preferred side, size writing --available-* and
// --anchor-*, the arrow placed (a stand-in centred on the anchor when the popup has none), --transform-origin from the
// arrow's centre, the rendered side and the side offset, data-side/data-align on positioner and popup.

export interface BaseOptions {
	readonly side: string;
	readonly align: string;
	readonly sideOffset: number;
	readonly alignOffset: number;
	readonly positionMethod: 'absolute' | 'fixed';
	readonly collisionPadding?: number;
	/** collisionAvoidance.fallbackAxisSide: 'none' for a dropdown (Menu, Select, Combobox), 'end' for a popover. */
	readonly fallbackAxisSide?: 'end' | 'none';
}

const PHYSICAL: Record<string, string> = { top: 'top', right: 'right', bottom: 'bottom', left: 'left', 'inline-end': 'right', 'inline-start': 'left' };

export function place(anchor: Element | { getBoundingClientRect(): DOMRect }, positioner: HTMLElement, popup: HTMLElement | null, options: BaseOptions): () => void {
	// A point (a context menu's pointer) has no direction of its own: the popup's is the one its DirectionProvider gave.
	const directed = anchor instanceof Element ? anchor : popup;
	const rtl = Boolean(directed) && getComputedStyle(directed!).direction === 'rtl';
	const side = options.side === 'inline-end' ? (rtl ? 'left' : 'right') : options.side === 'inline-start' ? (rtl ? 'right' : 'left') : (PHYSICAL[options.side] ?? 'bottom');
	const placement = (options.align === 'center' ? side : `${side}-${options.align}`) as Placement;
	const pad = options.collisionPadding ?? 5;
	const padding = { top: pad + (options.side === 'bottom' ? 1 : 0), right: pad + (options.side === 'left' ? 1 : 0), bottom: pad + (options.side === 'top' ? 1 : 0), left: pad + (options.side === 'right' ? 1 : 0) };
	const flipPadding = { top: padding.top + 1, right: padding.right + 1, bottom: padding.bottom + 1, left: padding.left + 1 };
	// Placed at the pointer (a context menu, Base UI's shiftCrossAxis): never flipped off its side nor held to a 0x0 point,
	// shifted on both axes within the layout viewport.
	const atPoint = !(anchor instanceof Element);
	const html = document.documentElement;
	const shiftMw = atPoint ? shift({ padding, mainAxis: true, crossAxis: true, rootBoundary: { x: 0, y: 0, width: html.clientWidth, height: html.clientHeight } }) : shift({ padding, mainAxis: true, crossAxis: false, limiter: limitShift() });
	const flipMw = flip({ padding: flipPadding, mainAxis: !atPoint, crossAxis: 'alignment', fallbackAxisSideDirection: atPoint ? 'none' : (options.fallbackAxisSide ?? 'end') });
	// Tooltip.Arrow and the like: the popup's own absolutely placed, aria-hidden child.
	const arrowEl = popup ? [...popup.children].find((c): c is HTMLElement => c instanceof HTMLElement && c.getAttribute('aria-hidden') === 'true' && getComputedStyle(c).position === 'absolute') : undefined;
	const stand = document.createElement('div');
	const transformOrigin: Middleware = {
		name: 'transformOrigin',
		fn({ elements, middlewareData, placement: at }) {
			const s = at.split('-')[0]!;
			const o = options.sideOffset;
			const x = (middlewareData.arrow?.x ?? 0) + (arrowEl?.clientWidth ?? 0) / 2;
			const y = (middlewareData.arrow?.y ?? 0) + (arrowEl?.clientHeight ?? 0) / 2;
			const origin = { top: `${x}px calc(100% + ${o}px)`, bottom: `${x}px ${-o}px`, left: `calc(100% + ${o}px) ${y}px`, right: `${-o}px ${y}px` }[s] ?? '';
			elements.floating.style.setProperty('--transform-origin', origin);
			return {};
		},
	};
	positioner.style.position = 'fixed';
	positioner.style.left = '0px';
	positioner.style.top = '0px';
	positioner.style.opacity = '0';
	const update = () =>
		computePosition(anchor, positioner, {
			strategy: options.positionMethod,
			placement,
			middleware: [
				offset({ mainAxis: options.sideOffset, crossAxis: options.alignOffset, alignmentAxis: options.alignOffset }),
				...(options.align === 'center' ? [shiftMw, flipMw] : [flipMw, shiftMw]),
				size({
					padding,
					apply({ elements, availableWidth, availableHeight, rects }) {
						const st = elements.floating.style;
						st.setProperty('--available-width', `${availableWidth}px`);
						st.setProperty('--available-height', `${availableHeight}px`);
						const dpr = window.devicePixelRatio || 1;
						const { x, y, width, height } = rects.reference;
						st.setProperty('--anchor-width', `${(Math.round((x + width) * dpr) - Math.round(x * dpr)) / dpr}px`);
						st.setProperty('--anchor-height', `${(Math.round((y + height) * dpr) - Math.round(y * dpr)) / dpr}px`);
					},
				}),
				// A context menu's arrow padding is 0 (Base UI's MenuPositioner): 5 pushes the popup off a 0x0 point.
				arrow({ element: arrowEl ?? stand, padding: atPoint ? 0 : 5 }),
				transformOrigin,
			],
		}).then(({ x, y, placement: at, middlewareData }) => {
			const placed = middlewareData.arrow;
			if (arrowEl && placed) {
				if (placed.x !== undefined) arrowEl.style.left = `${placed.x}px`;
				if (placed.y !== undefined) arrowEl.style.top = `${placed.y}px`;
			}
			positioner.style.position = options.positionMethod;
			positioner.style.opacity = '';
			positioner.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
			const [s, a = 'center'] = at.split('-') as [string, string?];
			const logical = options.side.startsWith('inline') ? options.side : s;
			for (const el of [positioner, popup]) {
				el?.setAttribute('data-side', logical);
				el?.setAttribute('data-align', a);
			}
		});
	void update();
	return autoUpdate(anchor, positioner, update, { elementResize: true, layoutShift: true });
}
