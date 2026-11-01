// Base UI 1.6's ScrollArea (Root, Viewport, Scrollbar, Thumb): the thumb is sized to the share of the content in view
// (--scroll-area-thumb-height or -width on its scrollbar, at least 16 px) and moved with the scroll (translate3d); the
// root, viewport and scrollbars carry data-has-overflow-*, data-overflow-*-start/end and the viewport the
// --scroll-area-overflow-* lengths; a scrollbar is data-hovering while the pointer is in the root and data-scrolling for
// 500 ms after its axis scrolls. A press on the track scrolls the thumb's centre to it, a drag of the thumb or from the
// track scrolls with the pointer, and the wheel over a scrollbar scrolls its axis.

const ROOT = '[data-slot="scroll-area"]';
const VIEWPORT = '[data-slot="scroll-area-viewport"]';
const BAR = '[data-slot="scroll-area-scrollbar"]';
const THUMB = '[data-slot="scroll-area-thumb"]';
const SCROLL_TIMEOUT = 500;
const MIN_THUMB_SIZE = 16;

interface Area {
	readonly root: HTMLElement;
	readonly viewport: HTMLElement;
	last: { x: number; y: number };
	timers: { x?: number; y?: number };
}
const areas = new WeakMap<Element, Area>();

const barsOf = (a: Area) => [...a.root.querySelectorAll<HTMLElement>(BAR)].filter((b) => b.closest(ROOT) === a.root);
const barOf = (a: Area, axis: 'x' | 'y') => barsOf(a).find((b) => (b.getAttribute('data-orientation') === 'horizontal') === (axis === 'x'));
const thumbOf = (bar: HTMLElement | undefined) => bar?.querySelector<HTMLElement>(THUMB) ?? undefined;
const rtl = (a: Area) => getComputedStyle(a.viewport).direction === 'rtl';
const toggle = (el: Element, name: string, on: boolean) => (on ? el.setAttribute(name, '') : el.removeAttribute(name));

function offset(el: Element | undefined, prop: 'padding' | 'margin', axis: 'x' | 'y'): number {
	if (!el) return 0;
	const css = getComputedStyle(el);
	if (axis === 'x' && prop === 'margin') return parseFloat(css.marginInlineStart) * 2;
	const side = axis === 'x' ? 'Inline' : 'Block';
	return parseFloat(css[`${prop}${side}Start` as 'paddingBlockStart']) + parseFloat(css[`${prop}${side}End` as 'paddingBlockEnd']);
}

// computeThumbPosition.
function measure(a: Area): void {
	const v = a.viewport;
	const [height, width, viewH, viewW] = [v.scrollHeight, v.scrollWidth, v.clientHeight, v.clientWidth];
	if (!height || !width) return;
	const hiddenY = height <= viewH;
	const hiddenX = width <= viewW;
	const maxLeft = Math.max(0, width - viewW);
	const maxTop = Math.max(0, height - viewH);
	const fromStartX = hiddenX ? 0 : Math.min(maxLeft, Math.max(0, rtl(a) ? -v.scrollLeft : v.scrollLeft));
	const fromStartY = hiddenY ? 0 : Math.min(maxTop, Math.max(0, v.scrollTop));
	const edges = { 'x-start': fromStartX > 0, 'x-end': !hiddenX && maxLeft - fromStartX > 0, 'y-start': fromStartY > 0, 'y-end': !hiddenY && maxTop - fromStartY > 0 };
	const barY = barOf(a, 'y');
	const barX = barOf(a, 'x');
	const thumbY = thumbOf(barY);
	const thumbX = thumbOf(barX);
	const idealH = (hiddenY ? 0 : viewH) - offset(barY, 'padding', 'y') - offset(thumbY, 'margin', 'y');
	const idealW = (hiddenX ? 0 : viewW) - offset(barX, 'padding', 'x') - offset(thumbX, 'margin', 'x');
	const sizeH = Math.max(MIN_THUMB_SIZE, (barY ? Math.min(barY.offsetHeight, idealH) : idealH) * (viewH / height));
	const sizeW = Math.max(MIN_THUMB_SIZE, (barX ? Math.min(barX.offsetWidth, idealW) : idealW) * (viewW / width));
	if (barY && thumbY) {
		barY.style.setProperty('--scroll-area-thumb-height', `${sizeH}px`);
		const max = barY.offsetHeight - sizeH - offset(barY, 'padding', 'y') - offset(thumbY, 'margin', 'y');
		const range = height - viewH;
		thumbY.style.transform = `translate3d(0,${Math.min(max, Math.max(0, (range ? v.scrollTop / range : 0) * max))}px,0)`;
	}
	if (barX && thumbX) {
		barX.style.setProperty('--scroll-area-thumb-width', `${sizeW}px`);
		const max = barX.offsetWidth - sizeW - offset(barX, 'padding', 'x') - offset(thumbX, 'margin', 'x');
		const range = width - viewW;
		const at = (range ? v.scrollLeft / range : 0) * max;
		thumbX.style.transform = `translate3d(${rtl(a) ? Math.min(0, Math.max(-max, at)) : Math.min(max, Math.max(0, at))}px,0,0)`;
	}
	v.style.setProperty('--scroll-area-overflow-x-start', `${fromStartX}px`);
	v.style.setProperty('--scroll-area-overflow-x-end', `${maxLeft - fromStartX}px`);
	v.style.setProperty('--scroll-area-overflow-y-start', `${fromStartY}px`);
	v.style.setProperty('--scroll-area-overflow-y-end', `${hiddenY ? 0 : maxTop - fromStartY}px`);
	for (const el of [a.root, a.viewport, ...barsOf(a)]) {
		toggle(el, 'data-has-overflow-x', !hiddenX);
		toggle(el, 'data-has-overflow-y', !hiddenY);
		for (const [edge, on] of Object.entries(edges)) toggle(el, `data-overflow-${edge}`, on);
	}
}

// handleScroll: the axis that moved is scrolling for 500 ms.
function scrolled(a: Area): void {
	const now = { x: a.viewport.scrollLeft, y: a.viewport.scrollTop };
	for (const axis of ['x', 'y'] as const) {
		if (now[axis] === a.last[axis]) continue;
		const bar = barOf(a, axis);
		if (bar) bar.setAttribute('data-scrolling', '');
		a.root.setAttribute('data-scrolling', '');
		clearTimeout(a.timers[axis]);
		a.timers[axis] = window.setTimeout(() => {
			bar?.removeAttribute('data-scrolling');
			if (!barsOf(a).some((b) => b.hasAttribute('data-scrolling'))) a.root.removeAttribute('data-scrolling');
		}, SCROLL_TIMEOUT);
	}
	a.last = now;
	measure(a);
}

function hover(a: Area, on: boolean): void {
	for (const bar of barsOf(a)) toggle(bar, 'data-hovering', on);
}

function areaOf(target: Element): Area | undefined {
	const root = target.closest<HTMLElement>(ROOT);
	const viewport = root?.querySelector<HTMLElement>(VIEWPORT);
	if (!root || !viewport || viewport.closest(ROOT) !== root) return undefined;
	let a = areas.get(root);
	if (a?.viewport === viewport) return a;
	a = { root, viewport, last: { x: viewport.scrollLeft, y: viewport.scrollTop }, timers: {} };
	areas.set(root, a);
	const area = a;
	viewport.addEventListener('scroll', () => scrolled(area), { passive: true });
	root.addEventListener('pointerleave', () => hover(area, false));
	new ResizeObserver(() => measure(area)).observe(viewport);
	for (const bar of barsOf(a)) bar.addEventListener('wheel', (event) => wheel(area, bar, event), { passive: false });
	measure(a);
	return a;
}

function wheel(a: Area, bar: HTMLElement, event: WheelEvent): void {
	if (event.ctrlKey) return;
	const horizontal = bar.getAttribute('data-orientation') === 'horizontal';
	const v = a.viewport;
	const delta = horizontal ? event.deltaX : event.deltaY;
	if (!delta) return;
	const max = horizontal ? v.scrollWidth - v.clientWidth : v.scrollHeight - v.clientHeight;
	const [lo, hi] = horizontal && rtl(a) ? [-max, 0] : [0, max];
	const now = horizontal ? v.scrollLeft : v.scrollTop;
	if ((now <= lo && delta < 0) || (now >= hi && delta > 0)) return;
	event.preventDefault();
	const next = Math.min(hi, Math.max(lo, now + delta));
	if (horizontal) v.scrollLeft = next;
	else v.scrollTop = next;
	scrolled(a);
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	const a = areaOf(target);
	if (!a) return false;
	if (event.pointerType !== 'touch') hover(a, true);
	return false;
}

// A viewport focused from the keys scrolls with them: its thumb follows from then on.
export function focusin(target: Element): boolean {
	areaOf(target);
	return false;
}

// The scrollbar's onPointerDown (a press on the track) and the root's thumb drag.
export function pointerdown(target: Element, event: PointerEvent): boolean {
	if (event.button !== 0) return false;
	const bar = target.closest<HTMLElement>(BAR);
	const a = bar && areaOf(bar);
	const thumb = thumbOf(bar ?? undefined);
	if (!a || !bar || !thumb) return false;
	const vertical = bar.getAttribute('data-orientation') !== 'horizontal';
	const v = a.viewport;
	if (!thumb.contains(target)) {
		if (vertical) {
			const size = thumb.offsetHeight;
			const pad = offset(bar, 'padding', 'y');
			const margin = offset(thumb, 'margin', 'y');
			const click = event.clientY - bar.getBoundingClientRect().top - size / 2 - pad + margin / 2;
			v.scrollTop = (click / (bar.offsetHeight - size - pad - margin)) * (v.scrollHeight - v.clientHeight);
		} else {
			const size = thumb.offsetWidth;
			const pad = offset(bar, 'padding', 'x');
			const margin = offset(thumb, 'margin', 'x');
			const click = event.clientX - bar.getBoundingClientRect().left - size / 2 - pad + margin / 2;
			const ratio = click / (bar.offsetWidth - size - pad - margin);
			const range = v.scrollWidth - v.clientWidth;
			v.scrollLeft = rtl(a) ? (v.scrollLeft <= 0 ? -1 : 1) * (1 - ratio) * range : ratio * range;
		}
		scrolled(a);
	}
	const start = { x: event.clientX, y: event.clientY, top: v.scrollTop, left: v.scrollLeft };
	thumb.setPointerCapture?.(event.pointerId);
	const move = (e: PointerEvent) => {
		if (vertical) {
			const max = bar.offsetHeight - thumb.offsetHeight - offset(bar, 'padding', 'y') - offset(thumb, 'margin', 'y');
			v.scrollTop = start.top + ((e.clientY - start.y) / max) * (v.scrollHeight - v.clientHeight);
		} else {
			const max = bar.offsetWidth - thumb.offsetWidth - offset(bar, 'padding', 'x') - offset(thumb, 'margin', 'x');
			v.scrollLeft = start.left + ((e.clientX - start.x) / max) * (v.scrollWidth - v.clientWidth);
		}
		e.preventDefault();
		scrolled(a);
	};
	const up = (e: PointerEvent) => {
		document.removeEventListener('pointermove', move, true);
		document.removeEventListener('pointerup', up, true);
		document.removeEventListener('pointercancel', up, true);
		if (thumb.hasPointerCapture?.(e.pointerId)) thumb.releasePointerCapture(e.pointerId);
	};
	document.addEventListener('pointermove', move, true);
	document.addEventListener('pointerup', up, true);
	document.addEventListener('pointercancel', up, true);
	return true;
}
