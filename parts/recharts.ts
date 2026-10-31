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
	/** Frames from a control's use to the one recharts' update animation begins at, on the old page. */
	readonly z?: number;
	/** Per state, where recharts anchors the tooltip along the category axis (a drawing laid out again). */
	readonly pa?: readonly (number | null)[];
	/** The drawing's axes, every tick they could show, and its layout, where it is cartesian (recharts-layout). */
	readonly a?: readonly unknown[];
	readonly l?: string;
	readonly pl?: readonly unknown[];
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
		const [vx, vy, vw, vh] = f.v;
		const fixed = f.pa?.[shown] ?? null;
		if ('key' in place) {
			const entry = f.k![place.key]!;
			x = entry[1];
			y = entry[2];
			if (fixed !== null && f.m === 'x') x = follow(fixed, tip.offsetWidth / scale, vx, vw);
			if (fixed !== null && f.m === 'y') y = follow(fixed, tip.offsetHeight / scale, vy, vh);
		} else {
			const [fx, fy] = f.p[shown] ?? [null, null];
			const [ax, ay] = anchor(f, shown, place.x, place.y);
			x = fx ?? follow(fixed !== null && f.m === 'x' ? fixed : ax, tip.offsetWidth / scale, vx, vw);
			y = fy ?? follow(fixed !== null && f.m === 'y' ? fixed : ay, tip.offsetHeight / scale, vy, vh);
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

function at(wrapper: HTMLElement, event: MouseEvent): void {
	const surface = surfaceOf(wrapper);
	const f = surface && factsOf(surface);
	const m = surface?.getScreenCTM();
	if (!surface || !f || !m || !f.p.length) return;
	// recharts' getRelativeCoordinate rounds the pointer to whole pixels.
	const inSvg = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
	const p = { x: Math.round(inSvg.x), y: Math.round(inSvg.y) };
	const inBox = p.x >= 0 && p.y >= 0 && p.x <= f.w && p.y <= f.h;
	show(wrapper, surface, inBox && event.target instanceof Element ? pick(f, surface, event.target, p.x, p.y, event) : -1, { x: p.x, y: p.y });
}

function wire(wrapper: HTMLElement): void {
	if (wired.has(wrapper)) return;
	wired.add(wrapper);
	// recharts follows mousemove, whose coordinates the browser gives in whole pixels; a touch or a pen, pointermove.
	wrapper.addEventListener('mousemove', (e) => at(wrapper, e));
	wrapper.addEventListener('pointermove', (e) => e.pointerType !== 'mouse' && at(wrapper, e));
	wrapper.addEventListener('pointerleave', () => show(wrapper, surfaceOf(wrapper), -1));
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	intent(target);
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper) return false;
	wire(wrapper);
	at(wrapper, event);
	return false;
}

// A pointer already over the chart when the page loads moves inside it without a pointerover: the chart is wired once it is visible.
export function mount(el: Element): void {
	if (!(el instanceof HTMLElement) || !el.matches(WRAPPER)) return;
	wire(el);
	watch(el);
	track(el);
	const card = el.closest('[data-mm-morph]');
	if (card?.querySelector('[data-mm-variant]') && card.querySelector('[data-slot="select-trigger"]')) share(card);
	followLanguage(el);
	begin(el);
}

// An RTL preview's language (its data-lang, which the site's RTL part sets; English where it is left to right) picks
// the chart's drawing for that language, as the example draws it again (convert's mmlang).
const followed = new WeakSet<Element>();
function followLanguage(wrapper: HTMLElement): void {
	const preview = wrapper.hasAttribute('data-mm-lang') ? wrapper.closest('[data-slot="preview"]') : null;
	if (!preview || followed.has(wrapper)) return;
	followed.add(wrapper);
	const language = () => preview.getAttribute('data-lang') ?? (preview.getAttribute('dir') === 'ltr' ? 'en' : undefined);
	let shownLanguage = language();
	const send = () => {
		const now = language();
		if (!now || now === shownLanguage) return;
		shownLanguage = now;
		wrapper.dispatchEvent(new CustomEvent('mmlang', { detail: now }));
	};
	new MutationObserver(send).observe(preview, { attributes: true, attributeFilter: ['data-lang', 'dir'] });
}

// The choice the old page's card made for itself on a page narrower than `w` (dashboard-01's useIsMobile: the last 7
// days): made through the card's select, as a visitor would, before the chart has moved; recharts drew it from the start.
const starting = new WeakSet<Element>();
const begun = new WeakSet<Element>();
function begin(wrapper: HTMLElement): void {
	if (begun.has(wrapper)) return;
	begun.add(wrapper);
	let start: { w: number; l: string };
	try {
		start = JSON.parse(wrapper.getAttribute('data-mm-start') ?? '') as { w: number; l: string };
	} catch {
		return;
	}
	const card = wrapper.closest('[data-mm-morph]');
	const trigger = card?.querySelector('[data-slot="select-trigger"]');
	if (!card || !trigger || innerWidth >= start.w) return;
	share(card);
	if (watched.has(wrapper)) starting.add(wrapper);
	trigger.dispatchEvent(new CustomEvent('mmchoose', { bubbles: true, detail: start.l }));
}

/**
 * A card whose select and buttons set one range (dashboard-01's timeRange): the select's choice also presses the button
 * of the same text, which Markless keeps the range in (the toggle group's state, the select's shown value).
 */
const shared = new WeakSet<Element>();
function share(card: Element): void {
	if (shared.has(card)) return;
	shared.add(card);
	card.addEventListener('mmchoose', (event) => {
		const text = (event as CustomEvent<string>).detail;
		const press = [...card.querySelectorAll<HTMLElement>('[data-mm-variant]')].find((el) => el.textContent?.trim() === text);
		if (press && press.getAttribute('aria-checked') !== 'true' && press.getAttribute('data-state') !== 'on') press.click();
	});
}

// The old card chose on load wherever the chart was, scrolled to or not.
export function idle(): void {
	for (const el of document.querySelectorAll<HTMLElement>(`${WRAPPER}[data-mm-start]`)) begin(el);
}

// The drawing laid out for the chart's own size and the visitor's time zone (recharts-layout), where either differs
// from the capture's: a width the old page was not captured at, or dates read a day earlier behind UTC.
type Layout = typeof import('./recharts-layout.ts');
type Axis = import('./recharts-layout.ts').Axis;
type Clock = typeof import('./clock.ts');
let layoutLoad: Promise<[Layout, Clock]> | undefined;
let layoutIn: [Layout, Clock] | undefined;
const loadLayout = () => (layoutLoad ??= Promise.all([import('./recharts-layout.ts'), import('./clock.ts')]).then((m) => (layoutIn = m)));
const laid = new WeakMap<SVGSVGElement, string>();
const sized = new WeakSet<Element>();

function clockOf(wrapper: Element): { rules: unknown[]; year: number } | undefined {
	try {
		const rules = JSON.parse(wrapper.closest('[data-mm-clock]')?.getAttribute('data-mm-clock') ?? '[]') as { '*'?: number }[];
		const year = rules.find((r) => r['*'] !== undefined)?.['*'];
		return year === undefined ? undefined : { rules, year };
	} catch {
		return undefined;
	}
}

// Behind UTC, the dates recharts formats from UTC midnights read a day earlier, so their axis keeps other ticks.
const behind = (year: number) => [0, 6].some((month) => new Date(Date.UTC(year, month, 1)).getTimezoneOffset() > 0);

function fit(wrapper: HTMLElement, svg: SVGSVGElement | undefined = surfaceOf(wrapper)): void {
	const f = svg && factsOf(svg);
	if (!svg || !f || (!f.a && !f.l && !f.pl)) return;
	const box = wrapper.getBoundingClientRect();
	const W = Math.round(box.width);
	const H = Math.round(box.height);
	const clock = clockOf(wrapper);
	const west = !!clock && behind(clock.year);
	const axes = (f.a ?? []) as (Axis | null)[];
	// Dates an axis' formatter wrote with toLocaleDateString: this visitor's (a chart's clock region writes those with
	// a month itself; a weekday alone it leaves).
	const intl = (axis: Axis) => (axis.f && axis.v ? axis.v.map((v) => new Date(v).toLocaleDateString(axis.lo, axis.f)) : undefined);
	const dated = axes.some((a) => a && intl(a)?.some((l, i) => l !== a.l[i]));
	const key = `${W}x${H}${west || dated ? 'w' : ''}`;
	if (laid.get(svg) === key || (!laid.has(svg) && f.w === W && f.h === H && !west && !dated)) return;
	const run = ([layout, c]: [Layout, Clock]) => {
		// The axis' text for this visitor, written in place; the clock part is told it is written.
		const local = (axis: Axis) => {
			const own = intl(axis);
			const clocked = !!clock && axis.l.some((l) => new RegExp(c.DATE_TEXT.source).test(l));
			if (own && !clocked) return own;
			if (!west) return undefined;
			const may = c.monthNamesIn(axis.l.join('\n'));
			return axis.l.map((l) => c.rewrite(l, clock!.rules as never, Date.now(), may));
		};
		layout.fit(svg, W, H, local, c.claim);
		laid.set(svg, key);
		parsed.delete(svg);
		for (const path of svg.querySelectorAll('path[data-mm-geo]')) finals.delete(path);
	};
	if (layoutIn) run(layoutIn);
	else void loadLayout().then(run);
}

function track(wrapper: HTMLElement): void {
	if (sized.has(wrapper)) return;
	sized.add(wrapper);
	// ResponsiveContainer gives the chart its container's size in whole pixels (convert writes the wrapper at 100%).
	const container = wrapper.style.width === '100%' && wrapper.style.height === '100%' ? wrapper.parentElement : null;
	const resized = () => {
		if (container) {
			const box = container.getBoundingClientRect();
			wrapper.style.width = `${Math.round(box.width)}px`;
			wrapper.style.height = `${Math.round(box.height)}px`;
		}
		const svg = surfaceOf(wrapper);
		if (svg) shown.set(wrapper, svg);
		fit(wrapper, svg);
	};
	resized();
	new ResizeObserver(resized).observe(container ?? wrapper);
}

// recharts' update animation runs in its own module, fetched once a card whose controls switch its chart is about to be used.
type Motion = typeof import('./recharts-motion.ts');
let motion: Promise<Motion> | undefined;
let motionIn: Motion | undefined;
const loadMotion = () => (motion ??= import('./recharts-motion.ts').then((m) => (motionIn = m)));
const watched = new WeakSet<Element>();
/** The drawing each chart shows, which a control's switch moves from. */
const shown = new WeakMap<Element, SVGSVGElement>();
/** Each mark's own path, as convert wrote it: where its animation ends. */
const finals = new WeakMap<Element, string>();

/**
 * A control switching the chart shows another of its SVGs: recharts keeps the chart mounted, so its entry animation does
 * not play again and its marks move from the old shape to the new one. Until the animation module is in, the new SVG
 * keeps the old one's paths, and the frames it took count towards the old page's wait.
 */
function watch(wrapper: HTMLElement): void {
	if (watched.has(wrapper)) return;
	watched.add(wrapper);
	new MutationObserver((records) => {
		const now = surfaceOf(wrapper);
		const widths = new Set(now?.getAttribute('data-mm-b')?.split(' '));
		// The drawing on screen until now: every drawing of the old control state is hidden at once, at every width.
		const hidden = records.filter((r) => r.target !== now && r.target instanceof SVGSVGElement && r.target.parentElement === wrapper && r.target.getAttribute('data-mm-b')?.split(' ').some((b) => widths.has(b)) && !/display:\s*none/.test(r.oldValue ?? '')).map((r) => r.target as SVGSVGElement);
		const before = shown.get(wrapper);
		const from = before && hidden.includes(before) ? before : hidden[0];
		if (now) shown.set(wrapper, now);
		if (!now || !from) return;
		fit(wrapper, now);
		// The card's own start (begin) is no switch: the chart's entry animation plays for it.
		if (starting.has(wrapper)) return void starting.delete(wrapper);
		wrapper.setAttribute('data-mm-moved', '');
		if (!now.querySelector('[data-mm-geo]') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const lag = factsOf(now)?.z ?? 0;
		if (motionIn) return motionIn.morph(wrapper, from, now, lag, 0, finals);
		let frames = 0;
		let counting = true;
		const count = () => {
			if (!counting) return;
			frames++;
			requestAnimationFrame(count);
		};
		requestAnimationFrame(count);
		// Before the module is in: the old shape, which the new SVG's paths hold until it moves them.
		const old = [...from.querySelectorAll('path[data-mm-geo]')];
		now.querySelectorAll('path[data-mm-geo]').forEach((path, i) => {
			const d = old[i]?.getAttribute('d');
			if (!finals.has(path)) finals.set(path, path.getAttribute('d') ?? '');
			if (d) path.setAttribute('d', d);
		});
		void loadMotion().then(
			(m) => {
				counting = false;
				m.morph(wrapper, from, now, lag, frames, finals);
			},
			() => (counting = false),
		);
	}).observe(wrapper, { attributes: true, attributeFilter: ['style'], attributeOldValue: true, subtree: true });
}

const intent = (target: Element) => {
	if (target.closest('[data-mm-morph]')) void loadMotion();
};

function step(wrapper: HTMLElement, surface: SVGSVGElement, key: number): void {
	const entry = factsOf(surface)?.k?.[key];
	if (entry) show(wrapper, surface, entry[0], { key });
}

export function focusin(target: Element): boolean {
	intent(target);
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
