import { autoUpdate, computePosition, flip, limitShift, offset, shift, size, type Middleware, type Placement } from '@floating-ui/dom';

// Base UI's useAnchorPositioning (@base-ui/react 1.6): offset on both axes, shift then flip when centred (flip then
// shift otherwise) with a collision padding biased 1 px away from the preferred side, size writing --available-* and
// --anchor-*, --transform-origin from the rendered side and the side offset, data-side/data-align on positioner and popup.

export interface BaseOptions {
	readonly side: string;
	readonly align: string;
	readonly sideOffset: number;
	readonly alignOffset: number;
	readonly positionMethod: 'absolute' | 'fixed';
	readonly collisionPadding?: number;
}

const PHYSICAL: Record<string, string> = { top: 'top', right: 'right', bottom: 'bottom', left: 'left', 'inline-end': 'right', 'inline-start': 'left' };

export function place(anchor: Element, positioner: HTMLElement, popup: HTMLElement | null, options: BaseOptions): () => void {
	const rtl = getComputedStyle(anchor).direction === 'rtl';
	const side = options.side === 'inline-end' ? (rtl ? 'left' : 'right') : options.side === 'inline-start' ? (rtl ? 'right' : 'left') : (PHYSICAL[options.side] ?? 'bottom');
	const placement = (options.align === 'center' ? side : `${side}-${options.align}`) as Placement;
	const pad = options.collisionPadding ?? 5;
	const padding = { top: pad + (options.side === 'bottom' ? 1 : 0), right: pad + (options.side === 'left' ? 1 : 0), bottom: pad + (options.side === 'top' ? 1 : 0), left: pad + (options.side === 'right' ? 1 : 0) };
	const flipPadding = { top: padding.top + 1, right: padding.right + 1, bottom: padding.bottom + 1, left: padding.left + 1 };
	const shiftMw = shift({ padding, mainAxis: true, crossAxis: false, limiter: limitShift() });
	const flipMw = flip({ padding: flipPadding, mainAxis: true, crossAxis: 'alignment', fallbackAxisSideDirection: 'end' });
	const transformOrigin: Middleware = {
		name: 'transformOrigin',
		fn({ elements, placement: at }) {
			const s = at.split('-')[0]!;
			const o = options.sideOffset;
			const origin = { top: `0px calc(100% + ${o}px)`, bottom: `0px ${-o}px`, left: `calc(100% + ${o}px) 0px`, right: `${-o}px 0px` }[s] ?? '';
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
				transformOrigin,
			],
		}).then(({ x, y, placement: at }) => {
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
