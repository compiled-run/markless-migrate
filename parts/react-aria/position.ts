// React Aria's useOverlayPosition and calculatePosition (react-aria-components 1.20, Apache-2.0, Adobe), quirks
// included: placed in its containing block off its trigger, flipped when the other side has more room, shifted inside
// the viewport less containerPadding, its max-height the room left, and --trigger-anchor-point, --trigger-width and
// data-placement written as RAC's Popover writes them.

type Axis = 'top' | 'left';
type Side = 'top' | 'bottom' | 'left' | 'right';
interface Info {
	readonly placement: Side;
	readonly crossPlacement: string;
	readonly axis: Axis;
	readonly crossAxis: Axis;
	readonly size: 'height' | 'width';
	readonly crossSize: 'height' | 'width';
}
interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}
interface Dimensions {
	readonly width: number;
	readonly height: number;
	readonly totalWidth: number;
	readonly totalHeight: number;
	readonly top: number;
	readonly left: number;
	readonly scroll: { readonly top: number; readonly left: number };
}
type Margins = Record<Side, number>;

const AXIS: Record<Side, Axis> = { top: 'top', bottom: 'top', left: 'left', right: 'left' };
const FLIPPED: Record<string, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const CROSS: Record<Axis, Axis> = { top: 'left', left: 'top' };
const SIZE: Record<Axis, 'height' | 'width'> = { top: 'height', left: 'width' };
const TOTAL = { width: 'totalWidth', height: 'totalHeight' } as const;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const isRoot = (el: Element) => el.tagName === 'BODY' || el.tagName === 'HTML';

/** What an overlay is placed off: its trigger, or a point (a context menu's) on behalf of an element. */
export type Target = Element | { readonly element: Element; getBoundingClientRect(): DOMRect };
const elementOf = (t: Target) => (t instanceof Element ? t : t.element);

function parse(input: string): Info {
	let [placement, crossPlacement = 'center'] = input.split(' ') as [string, string?];
	const axis = AXIS[placement as Side] ?? 'left';
	if (!AXIS[placement as Side]) placement = 'right';
	const crossAxis = CROSS[axis];
	if (!AXIS[crossPlacement as Side]) crossPlacement = 'center';
	return { placement: placement as Side, crossPlacement, axis, crossAxis, size: SIZE[axis], crossSize: SIZE[crossAxis] };
}

// getContainerDimensions: the body or the document as the visual viewport, any other element by its own box.
function dimensions(node: Element): Dimensions {
	const vv = window.visualViewport;
	if (isRoot(node)) {
		const doc = document.documentElement;
		return { width: vv?.width ?? doc.clientWidth, height: vv?.height ?? doc.clientHeight, totalWidth: doc.clientWidth, totalHeight: doc.clientHeight, top: vv?.offsetTop ?? 0, left: vv?.offsetLeft ?? 0, scroll: { top: doc.scrollTop || node.scrollTop, left: doc.scrollLeft || node.scrollLeft } };
	}
	const { width, height, top, left } = offsetOf(node, false);
	return { width, height, totalWidth: width, totalHeight: height, top, left, scroll: { top: node.scrollTop, left: node.scrollLeft } };
}

function rectOf(node: Target, ignoreScale: boolean): Box {
	let { top, left, width, height } = node.getBoundingClientRect();
	if (ignoreScale && node instanceof HTMLElement) {
		width = node.offsetWidth;
		height = node.offsetHeight;
	}
	return { top, left, width, height };
}

function offsetOf(node: Target, ignoreScale: boolean): Box {
	const { top, left, width, height } = rectOf(node, ignoreScale);
	const { scrollTop, scrollLeft, clientTop, clientLeft } = document.documentElement;
	return { top: top + scrollTop - clientTop, left: left + scrollLeft - clientLeft, width, height };
}

// getPosition: an element's box relative to a positioned parent, as position: absolute inside it measures.
function positionIn(node: Target, parent: Element): Box {
	const el = elementOf(node);
	const style = getComputedStyle(el);
	let box: Box;
	if (style.position === 'fixed' && node instanceof Element) box = rectOf(node, false);
	else {
		box = offsetOf(node, false);
		const p = offsetOf(parent, false);
		const ps = getComputedStyle(parent);
		p.top += (parseInt(ps.borderTopWidth, 10) || 0) - parent.scrollTop;
		p.left += (parseInt(ps.borderLeftWidth, 10) || 0) - parent.scrollLeft;
		box.top -= p.top;
		box.left -= p.left;
	}
	box.top -= parseInt(style.marginTop, 10) || 0;
	box.left -= parseInt(style.marginLeft, 10) || 0;
	return box;
}

function isContainingBlock(node: Element): boolean {
	const s = getComputedStyle(node);
	return s.transform !== 'none' || /transform|perspective/.test(s.willChange) || s.filter !== 'none' || s.contain === 'paint' || ('backdropFilter' in s && s.backdropFilter !== 'none');
}

function containingBlock(node: HTMLElement): Element {
	let parent: Element | null = node.offsetParent;
	if (parent && parent === document.body && getComputedStyle(parent).position === 'static' && !isContainingBlock(parent)) parent = document.documentElement;
	if (parent == null) {
		parent = node.parentElement;
		while (parent && !isContainingBlock(parent)) parent = parent.parentElement;
	}
	return parent || document.documentElement;
}

function delta(axis: Axis, offset: number, size: number, boundary: Dimensions, container: Dimensions, padding: number, withBoundary: Box): number {
	const scroll = container.scroll[axis];
	const boundarySize = boundary[SIZE[axis]];
	const start = withBoundary[axis] + boundary.scroll[axis] + padding;
	const end = withBoundary[axis] + boundary.scroll[axis] + boundarySize - padding;
	const startEdge = offset - scroll + boundary.scroll[axis] + withBoundary[axis] - boundary[axis];
	const endEdge = offset - scroll + size + boundary.scroll[axis] + withBoundary[axis] - boundary[axis];
	if (startEdge < start) return start - startEdge;
	if (endEdge > end) return Math.max(end - endEdge, start - startEdge);
	return 0;
}

function compute(child: Box, overlay: Box, info: Info, offset: number, crossOffset: number, positioned: boolean, container: Dimensions, arrowSize = 0): Record<string, number> {
	const { placement, crossPlacement, axis, crossAxis, size, crossSize } = info;
	const position: Record<string, number> = {};
	position[crossAxis] = child[crossAxis];
	if (crossPlacement === 'center') position[crossAxis]! += (child[crossSize] - overlay[crossSize]) / 2;
	else if (crossPlacement !== crossAxis) position[crossAxis]! += child[crossSize] - overlay[crossSize];
	position[crossAxis]! += crossOffset;
	position[crossAxis] = clamp(position[crossAxis]!, child[crossAxis] - overlay[crossSize] + arrowSize, child[crossAxis] + child[crossSize] - arrowSize);
	if (placement === axis) position[FLIPPED[axis]!] = Math.floor((positioned ? container[size] : container[TOTAL[size]]) - child[axis] + offset);
	else position[axis] = Math.floor(child[axis] + child[size] + offset);
	return position;
}

function maxHeightOf(position: Record<string, number>, boundary: Dimensions, withBoundary: Box, margins: Margins, padding: number, height: number, grows: 'top' | 'bottom', container: Dimensions, descendant: boolean): number {
	const vv = window.visualViewport;
	const top = (position.top != null ? position.top : container.totalHeight - (position.bottom ?? 0) - height) - container.scroll.top;
	const shift = descendant ? withBoundary.top : 0;
	const rect = { top: Math.max(boundary.top + shift, (vv?.offsetTop ?? boundary.top) + shift), bottom: Math.min(boundary.top + boundary.height + shift, (vv?.offsetTop ?? 0) + (vv?.height ?? 0)) };
	const room = margins.top + margins.bottom + padding;
	return grows !== 'top' ? Math.max(0, rect.bottom - top - room) : Math.max(0, top + height - rect.top - room);
}

function available(boundary: Dimensions, withBoundary: Box, child: Box, margins: Margins, padding: number, info: Info, container: Dimensions, descendant: boolean): number {
	const { placement, axis, size } = info;
	const shift = descendant ? withBoundary[axis] : 0;
	if (placement === axis) return Math.max(0, child[axis] - container.scroll[axis] - (boundary[axis] + shift) - margins[axis] - margins[FLIPPED[axis]!] - padding);
	return Math.max(0, boundary[size] + boundary[axis] + shift - child[axis] - child[size] + container.scroll[axis] - margins[axis] - margins[FLIPPED[axis]!] - padding);
}

export interface PositionOptions {
	readonly placement: string;
	readonly offset: number;
	readonly crossOffset: number;
	readonly containerPadding?: number;
	readonly shouldFlip?: boolean;
	/** The OverlayArrow's width, which keeps the overlay overlapping its trigger by that much. */
	readonly arrowSize?: number;
}

export interface Placed {
	readonly position: Record<string, number>;
	readonly maxHeight: number;
	readonly placement: Side;
	readonly anchor: { readonly x: number; readonly y: number };
	readonly arrow: { readonly left?: number; readonly top?: number };
}

/** calculatePosition with the body as the boundary, the overlay placed in its containing block as React Aria finds it. */
export function calculate(target: Target, overlay: HTMLElement, options: PositionOptions): Placed {
	const rtl = getComputedStyle(elementOf(target)).direction === 'rtl';
	const input = options.placement.replace('start', rtl ? 'right' : 'left').replace('end', rtl ? 'left' : 'right');
	const padding = options.containerPadding ?? 12;
	const boundaryElement = document.body;
	const containerElement = containingBlock(overlay);
	const viewportContainer = containerElement === document.documentElement;
	const positioned = getComputedStyle(containerElement).position !== 'static';
	const child = viewportContainer ? offsetOf(target, false) : positionIn(target, containerElement);
	if (!viewportContainer) {
		const ts = getComputedStyle(elementOf(target));
		child.top += parseInt(ts.marginTop, 10) || 0;
		child.left += parseInt(ts.marginLeft, 10) || 0;
	}
	const size = offsetOf(overlay, true);
	const cs = getComputedStyle(overlay);
	const margins: Margins = { top: parseInt(cs.marginTop, 10) || 0, bottom: parseInt(cs.marginBottom, 10) || 0, left: parseInt(cs.marginLeft, 10) || 0, right: parseInt(cs.marginRight, 10) || 0 };
	size.width += margins.left + margins.right;
	size.height += margins.top + margins.bottom;
	const boundary = dimensions(boundaryElement);
	const container = dimensions(containerElement);
	let withBoundary: Box;
	if (!viewportContainer) {
		const r = containerElement.getBoundingClientRect();
		withBoundary = { top: -(r.top - boundary.top), left: -(r.left - boundary.left), width: 0, height: 0 };
	} else withBoundary = { top: 0, left: 0, width: 0, height: 0 };
	const descendant = boundaryElement.contains(containerElement);
	const arrowSize = options.arrowSize ?? 0;
	let info = parse(input);
	let position = compute(child, size, info, options.offset, options.crossOffset, positioned, container, arrowSize);
	const space = available(boundary, withBoundary, child, margins, padding + options.offset, info, container, descendant);
	if (options.shouldFlip !== false && size[info.size] > space) {
		const flipped = parse(`${FLIPPED[info.placement]} ${info.crossPlacement}`);
		const flippedSpace = available(boundary, withBoundary, child, margins, padding + options.offset, flipped, container, descendant);
		if (flippedSpace > space) {
			info = flipped;
			position = compute(child, size, info, options.offset, options.crossOffset, positioned, container, arrowSize);
		}
	}
	let grows: 'top' | 'bottom' = 'bottom';
	if (info.axis === 'top') grows = info.placement === 'top' ? 'top' : 'bottom';
	else if (info.crossAxis === 'top') grows = info.crossPlacement === 'bottom' ? 'top' : 'bottom';
	position[info.crossAxis]! += delta(info.crossAxis, position[info.crossAxis]!, size[info.crossSize], boundary, container, padding, withBoundary);
	const maxHeight = maxHeightOf(position, boundary, withBoundary, margins, padding, size.height, grows, container, descendant);
	size.height = Math.min(size.height, maxHeight);
	position = compute(child, size, info, options.offset, options.crossOffset, positioned, container, arrowSize);
	position[info.crossAxis]! += delta(info.crossAxis, position[info.crossAxis]!, size[info.crossSize], boundary, container, padding, withBoundary);
	const cross = info.crossAxis;
	const marginStart = margins[AXIS[cross as Side] === 'left' ? 'left' : 'top'];
	let origin = child[cross] - position[cross]! - marginStart;
	const preferred = origin + 0.5 * child[info.crossSize];
	const overlayMargin = cross === 'left' ? margins.left + margins.right : margins.top + margins.bottom;
	const arrowMin = arrowSize / 2;
	const arrowMax = size[info.crossSize] - overlayMargin - arrowSize / 2;
	const childMin = child[cross] + arrowSize / 2 - (position[cross]! + marginStart);
	const childMax = child[cross] + child[info.crossSize] - arrowSize / 2 - (position[cross]! + marginStart);
	const arrowAt = clamp(clamp(preferred, childMin, childMax), arrowMin, arrowMax);
	if (arrowSize) origin = arrowAt;
	else if (info.crossPlacement === 'right') origin += child[info.crossSize];
	else if (info.crossPlacement === 'center') origin += child[info.crossSize] / 2;
	const crossOrigin = info.placement === 'left' || info.placement === 'top' ? size[info.size] : 0;
	const anchor = { x: info.placement === 'top' || info.placement === 'bottom' ? origin : crossOrigin, y: info.placement === 'left' || info.placement === 'right' ? origin : crossOrigin };
	return { position, maxHeight, placement: info.placement, anchor, arrow: cross === 'left' ? { left: arrowAt } : { top: arrowAt } };
}

/** Places an overlay and keeps it placed as useOverlayPosition does (window and element resizes); returns the stop. */
export function placeOverlay(target: Target, overlay: HTMLElement, options: PositionOptions & { readonly widthVar?: boolean }): () => void {
	const element = elementOf(target);
	const update = () => {
		if (!overlay.isConnected || !element.isConnected) return;
		overlay.style.top = '0px';
		overlay.style.bottom = '';
		overlay.style.maxHeight = `${window.visualViewport?.height ?? window.innerHeight}px`;
		if (options.widthVar !== false && element instanceof HTMLElement) overlay.style.setProperty('--trigger-width', `${element.getBoundingClientRect().width}px`);
		// OverlayArrow: the overlay's own child carrying data-placement; its width is the arrow's size.
		const arrow = [...overlay.children].find((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-rac') && c.hasAttribute('data-placement'));
		const placed = calculate(target, overlay, { ...options, arrowSize: arrow ? arrow.offsetWidth : 0 });
		if (arrow) {
			arrow.setAttribute('data-placement', placed.placement);
			for (const side of ['left', 'top'] as const) {
				const v = placed.arrow[side];
				if (v === undefined) arrow.style.removeProperty(side === 'left' ? 'left' : 'top');
				else arrow.style.setProperty(side, `${v}px`);
			}
		}
		overlay.style.position = 'absolute';
		overlay.style.zIndex = '100000';
		for (const side of ['top', 'bottom', 'left', 'right']) overlay.style.removeProperty(side);
		for (const [side, value] of Object.entries(placed.position)) overlay.style.setProperty(side, `${value}px`);
		overlay.style.maxHeight = `${placed.maxHeight}px`;
		overlay.style.setProperty('--trigger-anchor-point', `${placed.anchor.x}px ${placed.anchor.y}px`);
		overlay.setAttribute('data-placement', placed.placement);
	};
	update();
	window.addEventListener('resize', update);
	const observer = new ResizeObserver(update);
	observer.observe(overlay);
	observer.observe(element);
	return () => {
		window.removeEventListener('resize', update);
		observer.disconnect();
	};
}
