// recharts' Tooltip on the converter's chart state (convert's ChartPlan): the pointer picks a point as the old page's
// chart did (along an axis, by the distance from the centre or the angle, or by the sector under it), the arrow keys
// step through the points once the chart has focus (accessibilityLayer), and leaving, Escape or blurring hides the
// tooltip. The point's index goes to the chart as an `mmchart` event; this places the tooltip where recharts did.

interface Facts {
	readonly w: number;
	readonly h: number;
	/** recharts' view box, which keeps a tooltip that follows the pointer inside it. */
	readonly v: readonly [number, number, number, number];
	readonly m: 'x' | 'y' | 'r' | 'a' | 'i';
	readonly c?: readonly [number, number];
	/** [from, to, state] along the mode's coordinate. */
	readonly g: readonly (readonly [number, number, number])[];
	readonly sp?: readonly [number, number];
	/** Per state, the tooltip's translate on each axis, or null where it follows the pointer. */
	readonly p: readonly (readonly [number | null, number | null])[];
	/** A polar chart's axis per state: its angle (a radar) or the middle of its ring (radial bars). */
	readonly q?: readonly number[];
	/** The arrow keys' order: [state, x, y]. */
	readonly k?: readonly (readonly [number, number, number])[];
}

const WRAPPER = '[data-mm-chart]';
const OFFSET = 10;
const parsed = new WeakMap<Element, Facts | undefined>();
const active = new WeakMap<Element, { surface: Element; state: number; key: number }>();
const wired = new WeakSet<Element>();

/** The SVG the chart shows now: one per width the old page drew it at and per state of its card's controls. */
function surfaceOf(wrapper: Element): SVGSVGElement | undefined {
	for (const el of wrapper.children) if (el instanceof SVGSVGElement && el.classList.contains('recharts-surface') && el.getBoundingClientRect().width > 0) return el;
	return undefined;
}

function factsOf(surface: Element): Facts | undefined {
	if (!parsed.has(surface)) {
		try {
			parsed.set(surface, JSON.parse(surface.getAttribute('data-mm-facts') ?? '') as Facts);
		} catch {
			parsed.set(surface, undefined);
		}
	}
	return parsed.get(surface);
}

function inside(segments: Facts['g'], at: number): number {
	for (const [from, to, state] of segments) if (at >= from && at <= to) return state;
	return -1;
}

// recharts' getTooltipTranslateXY: past the pointer by the offset, flipped before it when that leaves the view box.
function follow(at: number, size: number, start: number, length: number): number {
	const positive = at + OFFSET;
	if (positive + size > start + length) return Math.max(at - size - OFFSET, start);
	return Math.max(positive, start);
}

// Where recharts anchors a tooltip that follows the pointer: the pointer, or for a polar chart the point on the state's axis.
function anchor(f: Facts, state: number, x: number, y: number): [number, number] {
	const q = f.q?.[state];
	if (q === undefined || !f.c) return [x, y];
	const [cx, cy] = f.c;
	const angle = f.m === 'a' ? (q * Math.PI) / 180 : Math.atan2(cy - y, x - cx);
	const radius = f.m === 'a' ? Math.hypot(x - cx, y - cy) : q;
	return [cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)];
}

function show(wrapper: HTMLElement, surface: SVGSVGElement | undefined, state: number, place?: { x: number; y: number } | { key: number }): void {
	const f = surface && factsOf(surface);
	const tip = wrapper.querySelector<HTMLElement>('.recharts-tooltip-wrapper');
	if (!tip) return;
	const now = active.get(wrapper);
	const shown = f ? state : -1;
	if (!now || now.surface !== surface || now.state !== shown) wrapper.dispatchEvent(new CustomEvent('mmchart', { detail: shown }));
	if (surface) active.set(wrapper, { surface, state: shown, key: place && 'key' in place ? place.key : (now?.key ?? -1) });
	if (shown < 0 || !place || !f || !surface) {
		// recharts drops the hidden tooltip's transform, so it comes in from the corner the next time it shows.
		tip.style.visibility = 'hidden';
		tip.style.removeProperty('transform');
		tip.style.removeProperty('transition');
		return;
	}
	// The tooltip's content is the chart's state, written when this event is done; it is measured then.
	queueMicrotask(() => {
		if (active.get(wrapper)?.state !== shown) return;
		const m = surface.getScreenCTM();
		if (!m) return;
		const scale = m.a || 1;
		let x: number;
		let y: number;
		if ('key' in place) {
			const entry = f.k![place.key]!;
			x = entry[1];
			y = entry[2];
		} else {
			const [fx, fy] = f.p[shown] ?? [null, null];
			const [vx, vy, vw, vh] = f.v;
			const [ax, ay] = anchor(f, shown, place.x, place.y);
			x = fx ?? follow(ax, tip.offsetWidth / scale, vx, vw);
			y = fy ?? follow(ay, tip.offsetHeight / scale, vy, vh);
		}
		// The old page's translate is in its SVG's pixels; this SVG is scaled to its container.
		const at = new DOMPoint(x, y).matrixTransform(m);
		const box = wrapper.getBoundingClientRect();
		tip.style.visibility = 'visible';
		if (!matchMedia('(prefers-reduced-motion: reduce)').matches) tip.style.transition = 'transform 400ms';
		tip.style.transform = `translate(${at.x - box.left}px, ${at.y - box.top}px)`;
	});
}

function pick(f: Facts, svg: Element, target: Element, x: number, y: number, client: { clientX: number; clientY: number }): number {
	if (f.m === 'i') {
		// A label drawn over a sector does not take the pointer from it.
		const under = target.closest('.recharts-pie-sector') ? target : document.elementsFromPoint(client.clientX, client.clientY).find((e) => svg.contains(e) && e.closest('.recharts-pie-sector'));
		const sector = under?.closest('.recharts-pie-sector');
		return sector && svg.contains(sector) ? inside(f.g, [...svg.querySelectorAll('.recharts-pie-sector')].indexOf(sector)) : -1;
	}
	if (f.m === 'x' || f.m === 'y') {
		const cross = f.m === 'x' ? y : x;
		if (f.sp && (cross < f.sp[0] || cross > f.sp[1])) return -1;
		return inside(f.g, f.m === 'x' ? x : y);
	}
	const [cx, cy] = f.c ?? [f.v[0] + f.v[2] / 2, f.v[1] + f.v[3] / 2];
	const r = Math.hypot(x - cx, y - cy);
	if (f.m === 'r') return inside(f.g, r);
	if (f.sp && (r < f.sp[0] || r > f.sp[1])) return -1;
	return inside(f.g, ((Math.atan2(cy - y, x - cx) * 180) / Math.PI + 360) % 360);
}

function at(wrapper: HTMLElement, event: PointerEvent): void {
	const surface = surfaceOf(wrapper);
	const f = surface && factsOf(surface);
	const m = surface?.getScreenCTM();
	if (!surface || !f || !m || !f.p.length) return;
	const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
	const inBox = p.x >= 0 && p.y >= 0 && p.x <= f.w && p.y <= f.h;
	show(wrapper, surface, inBox && event.target instanceof Element ? pick(f, surface, event.target, p.x, p.y, event) : -1, { x: p.x, y: p.y });
}

function wire(wrapper: HTMLElement): void {
	if (wired.has(wrapper)) return;
	wired.add(wrapper);
	wrapper.addEventListener('pointermove', (e) => at(wrapper, e));
	wrapper.addEventListener('pointerleave', () => show(wrapper, surfaceOf(wrapper), -1));
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper) return false;
	wire(wrapper);
	at(wrapper, event);
	return false;
}

// A pointer already over the chart when the page loads moves inside it without a pointerover: the chart is wired once it is visible.
export function mount(el: Element): void {
	if (el instanceof HTMLElement && el.matches(WRAPPER)) wire(el);
}

function step(wrapper: HTMLElement, surface: SVGSVGElement, key: number): void {
	const entry = factsOf(surface)?.k?.[key];
	if (entry) show(wrapper, surface, entry[0], { key });
}

export function focusin(target: Element): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !(target instanceof SVGSVGElement) || !target.matches('svg.recharts-surface')) return false;
	step(wrapper, target, 0);
	return true;
}

export function focusout(target: Element): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !(target instanceof SVGSVGElement) || !target.matches('svg.recharts-surface')) return false;
	show(wrapper, target, -1);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !(target instanceof SVGSVGElement) || !target.matches('svg.recharts-surface')) return false;
	const f = factsOf(target);
	if (!f?.k?.length) return false;
	if (event.key === 'Escape') {
		show(wrapper, target, -1);
		return true;
	}
	if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return false;
	event.preventDefault();
	const now = active.get(wrapper);
	const key = now && now.state >= 0 ? now.key : -1;
	step(wrapper, target, key < 0 ? 0 : Math.min(f.k.length - 1, Math.max(0, key + (event.key === 'ArrowRight' ? 1 : -1))));
	return true;
}
