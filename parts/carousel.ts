// shadcn/ui Carousel on Embla 8 (embla-carousel-react): the track moves to scroll snaps measured as Embla measures them
// (align, trimSnaps, axis, direction), with Embla's scroll body (duration 25, friction 0.68, 60 steps a second);
// Previous and Next step and get `disabled` at the ends, the arrow keys step, and a drag on the viewport follows the
// pointer and settles on a snap as Embla's DragHandler picks it. With Embla Autoplay (the converter writes its delay as
// data-mm-autoplay) it steps on its own, back to the first snap after the last, until a drag on it (stopOnInteraction).

interface Carousel {
	readonly root: HTMLElement;
	readonly viewport: HTMLElement;
	readonly track: HTMLElement;
	readonly vertical: boolean;
	readonly rtl: boolean;
	snaps: number[];
	index: number;
	location: number;
	target: number;
	velocity: number;
	duration: number;
	friction: number;
	frame: number;
	last: number;
}

const ROOT = '[data-slot="carousel"]';
const carousels = new WeakMap<HTMLElement, Carousel>();
const STEP = 1000 / 60;

function carouselOf(el: Element): Carousel | undefined {
	const root = el.closest<HTMLElement>(ROOT);
	if (!root) return undefined;
	const known = carousels.get(root);
	if (known) return known;
	const viewport = root.querySelector<HTMLElement>('[data-slot="carousel-content"]');
	const track = viewport?.firstElementChild as HTMLElement | null | undefined;
	if (!viewport || !track) return undefined;
	const vertical = getComputedStyle(track).flexDirection.startsWith('column');
	const rtl = getComputedStyle(viewport).direction === 'rtl';
	const location = current(track, vertical, rtl);
	const c: Carousel = { root, viewport, track, vertical, rtl, snaps: [], index: 0, location, target: location, velocity: 0, duration: 25, friction: 0.68, frame: 0, last: 0 };
	measure(c);
	c.index = nearest(c, location);
	carousels.set(root, c);
	return c;
}

function current(track: HTMLElement, vertical: boolean, rtl: boolean): number {
	const m = new DOMMatrixReadOnly(getComputedStyle(track).transform === 'none' ? undefined : getComputedStyle(track).transform);
	return vertical ? m.m42 : rtl ? -m.m41 : m.m41;
}

// Embla's ScrollSnaps and ScrollContain on Embla's NodeRects (offsetLeft/Top/Width/Height, whole pixels): each slide's
// start offset from the container, aligned, clamped to the scrollable range and trimmed of duplicate snaps at the ends.
function measure(c: Carousel): void {
	const rect = (n: HTMLElement) => ({ left: n.offsetLeft, top: n.offsetTop, width: n.offsetWidth, height: n.offsetHeight });
	const box = rect(c.track);
	const slides = [...c.track.children].filter((n): n is HTMLElement => n instanceof HTMLElement).map(rect);
	if (!slides.length) {
		c.snaps = [0];
		return;
	}
	// Embla subtracts the container's offsets, unless the slides are measured from the container itself.
	const from0 = (c.track.children[0] as HTMLElement).offsetParent === c.track ? { left: 0, top: 0, width: box.width } : box;
	type R = ReturnType<typeof rect>;
	const start = (r: R) => (c.vertical ? r.top - from0.top : c.rtl ? from0.left + from0.width - (r.left + r.width) : r.left - from0.left);
	const size = (r: R) => (c.vertical ? r.height : r.width);
	const view = size(box);
	const align = c.root.dataset.mmAlign ?? 'center';
	const offset = (n: number) => (align === 'start' ? 0 : align === 'end' ? view - n : (view - n) / 2);
	const unaligned = slides.map((r) => -Math.abs(start(r)));
	const aligned = unaligned.map((s, i) => s + offset(size(slides[i]!)));
	const content = -unaligned[unaligned.length - 1]! + size(slides[slides.length - 1]!);
	if (content <= view + 2) {
		c.snaps = [0];
		return;
	}
	const min = -content + view;
	const max = 0;
	const bounded = aligned
		.map((s, i) => {
			const v = Math.min(max, Math.max(min, s));
			if (i === 0) return max;
			if (i === aligned.length - 1) return min;
			if (Math.abs(min - v) <= 1) return min;
			if (Math.abs(max - v) <= 1) return max;
			return v;
		})
		.map((v) => Number.parseFloat(v.toFixed(3)));
	const from = bounded.lastIndexOf(bounded[0]!);
	const to = bounded.indexOf(bounded[bounded.length - 1]!) + 1;
	c.snaps = bounded.slice(from, to);
}

function nearest(c: Carousel, at: number): number {
	let best = 0;
	for (let i = 1; i < c.snaps.length; i++) if (Math.abs(c.snaps[i]! - at) < Math.abs(c.snaps[best]! - at)) best = i;
	return best;
}

function paint(c: Carousel, at = c.location): void {
	const v = Math.round(at * 100) / 100;
	const x = c.vertical ? 0 : c.rtl ? -v : v;
	const y = c.vertical ? v : 0;
	c.track.style.transform = `translate3d(${x}px, ${y}px, 0px)`;
}

function buttons(c: Carousel): void {
	const prev = c.root.querySelector<HTMLButtonElement>('[data-slot="carousel-previous"]');
	const next = c.root.querySelector<HTMLButtonElement>('[data-slot="carousel-next"]');
	if (prev) prev.disabled = c.index <= 0;
	if (next) next.disabled = c.index >= c.snaps.length - 1;
}

// Embla's ScrollBody.seek at Embla's fixed 60 updates a second, each frame painted between the last two updates as
// Embla renders it (so a settled track rests where that frame's interpolation put it, as Embla's does).
function animate(c: Carousel): void {
	if (c.frame) return;
	c.last = performance.now();
	let carry = 0;
	let previous = c.location;
	const tick = (now: number) => {
		carry += Math.min(now - c.last, 1000);
		c.last = now;
		let settled = false;
		while (carry >= STEP) {
			previous = c.location;
			c.velocity += (c.target - c.location) / c.duration;
			c.velocity *= c.friction;
			c.location += c.velocity;
			carry -= STEP;
			settled = Math.abs(c.target - c.location) < 0.001;
			if (settled) break;
		}
		const alpha = carry / STEP;
		paint(c, c.location * alpha + previous * (1 - alpha));
		if (settled) {
			c.location = c.target;
			c.velocity = 0;
			c.frame = 0;
			return;
		}
		c.frame = requestAnimationFrame(tick);
	};
	c.frame = requestAnimationFrame(tick);
}

function scrollTo(c: Carousel, index: number, duration = 25, friction = 0.68): void {
	measure(c);
	c.index = Math.min(c.snaps.length - 1, Math.max(0, index));
	c.target = c.snaps[c.index]!;
	c.duration = duration;
	c.friction = friction;
	buttons(c);
	c.root.dispatchEvent(new CustomEvent('carouselselect', { detail: { index: c.index, count: c.snaps.length } }));
	animate(c);
}

const playing = new WeakMap<HTMLElement, number>();

function stop(c: Carousel): void {
	clearTimeout(playing.get(c.root));
	playing.delete(c.root);
}

export function mount(el: Element): void {
	if (!(el instanceof HTMLElement) || !el.matches(ROOT)) return;
	const delay = Number(el.dataset.mmAutoplay);
	const c = carouselOf(el);
	if (!c || !(delay > 0)) return;
	const tick = () => {
		if (!el.isConnected) return;
		measure(c);
		scrollTo(c, c.index >= c.snaps.length - 1 ? 0 : c.index + 1);
		playing.set(el, window.setTimeout(tick, delay));
	};
	playing.set(el, window.setTimeout(tick, delay));
}

export function click(target: Element): boolean {
	const button = target.closest<HTMLButtonElement>('[data-slot="carousel-previous"], [data-slot="carousel-next"]');
	if (button) {
		const c = carouselOf(button);
		if (!c || button.disabled) return false;
		scrollTo(c, c.index + (button.dataset.slot === 'carousel-next' ? 1 : -1));
		return true;
	}
	const root = target.closest<HTMLElement>(ROOT);
	if (root && dragged.has(root)) {
		dragged.delete(root);
		return true;
	}
	return false;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
	const c = carouselOf(target);
	if (!c) return false;
	event.preventDefault();
	scrollTo(c, c.index + (event.key === 'ArrowRight' ? 1 : -1));
	return true;
}

const dragged = new WeakSet<HTMLElement>();

// Embla's DragHandler: a press on the viewport (not on a form field) drags the track; on release the pointer's speed
// over the last 170 ms, boosted as Embla boosts it, picks the snap: the nearest under 20 px, else the next that way.
export function pointerdown(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'mouse' && event.button !== 0) return false;
	if (target.closest('input, select, textarea, [contenteditable="true"]')) return false;
	const viewport = target.closest<HTMLElement>('[data-slot="carousel-content"]');
	if (!viewport) return false;
	const c = carouselOf(viewport);
	if (!c) return false;
	stop(c);
	measure(c);
	cancelAnimationFrame(c.frame);
	c.frame = 0;
	c.velocity = 0;
	const axis = (e: PointerEvent) => (c.vertical ? e.clientY : c.rtl ? -e.clientX : e.clientX);
	const cross = (e: PointerEvent) => (c.vertical ? e.clientX : e.clientY);
	const origin = axis(event);
	const originCross = cross(event);
	const from = c.location;
	const min = c.snaps[c.snaps.length - 1]!;
	const max = c.snaps[0]!;
	const log: { t: number; p: number }[] = [{ t: event.timeStamp, p: origin }];
	let moving = false;
	const move = (e: PointerEvent) => {
		const diff = axis(e) - origin;
		if (!moving) {
			if (e.pointerType !== 'mouse' && Math.abs(cross(e) - originCross) > Math.abs(diff)) return up(e, true);
			if (Math.abs(diff) < 2) return;
			moving = true;
		}
		let to = from + diff;
		if (to > max) to = max + (to - max) * 0.3;
		if (to < min) to = min + (to - min) * 0.3;
		c.location = c.target = to;
		paint(c);
		log.push({ t: e.timeStamp, p: axis(e) });
		while (log.length > 2 && e.timeStamp - log[0]!.t > 170) log.shift();
	};
	const up = (e: PointerEvent, abandoned = false) => {
		document.removeEventListener('pointermove', move);
		document.removeEventListener('pointerup', onUp);
		document.removeEventListener('pointercancel', onUp);
		if (!moving || abandoned) return;
		dragged.add(c.root);
		// DragTracker.pointerUp: the pointer's speed (px/ms) since the start of the last 170 ms, unless it rested longer.
		const first = log[0]!;
		const last = log[log.length - 1]!;
		const time = e.timeStamp - first.t;
		const speed = time > 0 && e.timeStamp - last.t <= 170 ? (axis(e) - first.p) / time : 0;
		const raw = Math.abs(speed) > 0.1 ? speed * (e.pointerType === 'mouse' ? 300 : 400) : 0;
		// allowedForce: under 20 px the nearest snap to where the force carries the track, else the next snap that way.
		const index = Math.abs(raw) < 20 ? nearest(c, c.location + raw) : c.index + (raw < 0 ? 1 : -1);
		const clamped = Math.min(c.snaps.length - 1, Math.max(0, index));
		const force = c.snaps[clamped]! - c.location;
		const factor = raw === 0 || force === 0 || Math.abs(raw) <= Math.abs(force) ? 0 : Math.abs(Math.abs(raw) - Math.abs(force)) / Math.abs(raw);
		scrollTo(c, index, 25 - 10 * factor, 0.68 + factor / 50);
	};
	const onUp = (e: PointerEvent) => up(e);
	document.addEventListener('pointermove', move);
	document.addEventListener('pointerup', onUp);
	document.addEventListener('pointercancel', onUp);
	return false;
}
