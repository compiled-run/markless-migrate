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
	/** The arrow keys' order: [state, x, y]. */
	readonly k?: readonly (readonly [number, number, number])[];
}

const WRAPPER = '[data-mm-chart]';
const OFFSET = 10;
const parsed = new WeakMap<Element, { raw: string; facts: Facts | undefined }>();
const active = new WeakMap<Element, { raw: string; state: number; key: number }>();
const wired = new WeakSet<Element>();

function factsOf(wrapper: Element): Facts | undefined {
	const raw = wrapper.getAttribute('data-mm-chart') ?? '';
	const known = parsed.get(wrapper);
	if (known?.raw === raw) return known.facts;
	let facts: Facts | undefined;
	try {
		facts = JSON.parse(raw) as Facts;
	} catch {
		facts = undefined;
	}
	parsed.set(wrapper, { raw, facts });
	return facts;
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

function show(wrapper: HTMLElement, state: number, place?: { x: number; y: number } | { key: number }): void {
	const f = factsOf(wrapper);
	const tip = wrapper.querySelector<HTMLElement>('.recharts-tooltip-wrapper');
	if (!f || !tip) return;
	const raw = wrapper.getAttribute('data-mm-chart') ?? '';
	const now = active.get(wrapper);
	if (!now || now.raw !== raw || now.state !== state) wrapper.dispatchEvent(new CustomEvent('mmchart', { detail: state }));
	active.set(wrapper, { raw, state, key: place && 'key' in place ? place.key : (now?.key ?? -1) });
	if (state < 0 || !place) {
		tip.style.visibility = 'hidden';
		return;
	}
	// The tooltip's content is the chart's state, written when this event is done; it is measured then.
	queueMicrotask(() => {
		if (active.get(wrapper)?.state !== state) return;
		const surface = wrapper.querySelector('svg.recharts-surface');
		const scale = surface ? surface.getBoundingClientRect().width / f.w || 1 : 1;
		let x: number;
		let y: number;
		if ('key' in place) {
			const entry = f.k![place.key]!;
			x = entry[1];
			y = entry[2];
		} else {
			const [fx, fy] = f.p[state] ?? [null, null];
			const [vx, vy, vw, vh] = f.v;
			x = fx ?? follow(place.x, tip.offsetWidth / scale, vx, vw);
			y = fy ?? follow(place.y, tip.offsetHeight / scale, vy, vh);
		}
		tip.style.visibility = 'visible';
		tip.style.transition = 'transform 400ms';
		tip.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
	});
}

function pick(f: Facts, svg: Element, target: Element, x: number, y: number): number {
	if (f.m === 'i') {
		const sector = target.closest('.recharts-pie-sector');
		return sector ? inside(f.g, [...svg.querySelectorAll('.recharts-pie-sector')].indexOf(sector)) : -1;
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
	const f = factsOf(wrapper);
	const svg = wrapper.querySelector('svg.recharts-surface');
	if (!f || !svg || !f.p.length) return;
	const box = svg.getBoundingClientRect();
	const x = (event.clientX - box.left) * (f.w / (box.width || f.w));
	const y = (event.clientY - box.top) * (f.h / (box.height || f.h));
	const inBox = x >= 0 && y >= 0 && x <= f.w && y <= f.h;
	show(wrapper, inBox && event.target instanceof Element ? pick(f, svg, event.target, x, y) : -1, { x, y });
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper) return false;
	if (!wired.has(wrapper)) {
		wired.add(wrapper);
		wrapper.addEventListener('pointermove', (e) => at(wrapper, e));
		wrapper.addEventListener('pointerleave', () => show(wrapper, -1));
	}
	at(wrapper, event);
	return false;
}

function step(wrapper: HTMLElement, key: number): void {
	const f = factsOf(wrapper);
	const entry = f?.k?.[key];
	if (entry) show(wrapper, entry[0], { key });
}

export function focusin(target: Element): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !target.matches('svg.recharts-surface')) return false;
	step(wrapper, 0);
	return true;
}

export function focusout(target: Element): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !target.matches('svg.recharts-surface')) return false;
	show(wrapper, -1);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !target.matches('svg.recharts-surface')) return false;
	const f = factsOf(wrapper);
	if (!f?.k?.length) return false;
	if (event.key === 'Escape') {
		show(wrapper, -1);
		return true;
	}
	if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return false;
	event.preventDefault();
	const now = active.get(wrapper);
	const key = now && now.state >= 0 ? now.key : -1;
	step(wrapper, key < 0 ? 0 : Math.min(f.k.length - 1, Math.max(0, key + (event.key === 'ArrowRight' ? 1 : -1))));
	return true;
}
