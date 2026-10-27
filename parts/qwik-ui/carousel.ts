// @qwik-ui/headless Carousel (carousel/*): Next and Previous step through the stops (0, move, 2·move, … up to
// slides − slidesPerView, which is always one), clamped unless rewind; a bullet's click, focus, Home, End and arrows go to
// its slide; a step's click goes to its index; the player toggles autoplay. Moving sets the scroller's transform to the
// sum of the slides before the stop and their gaps (adjusted for center and end alignment, clamped to what scrolls), marks
// the slides in view data-active and the rest inert, disables Previous and Next at the ends, and marks the current
// bullet and step. A mouse drag on the viewport moves the track and snaps to the nearest slide when released.
// What a Root's bind:selectedIndex and bind:autoplay signals would hear is dispatched on the root (qui-carousel-index,
// qui-carousel-autoplay); goTo and setAutoplay are those signals written.
const ROOT = '[data-qui-carousel]';

interface Carousel {
	readonly root: HTMLElement;
	readonly scroller: HTMLElement | null;
	readonly slides: HTMLElement[];
	readonly spv: number;
	readonly move: number;
	readonly rewind: boolean;
	readonly vertical: boolean;
}

const num = (el: Element, name: string, fallback: number) => {
	const v = Number(el.getAttribute(name));
	return Number.isFinite(v) && el.hasAttribute(name) ? v : fallback;
};

function carouselOf(el: Element | null): Carousel | undefined {
	const root = el?.closest<HTMLElement>(ROOT);
	if (!root) return undefined;
	const own = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)].filter((x) => x.closest(ROOT) === root);
	const scroller = own('[data-qui-carousel-scroller]')[0] ?? null;
	return {
		root,
		scroller,
		slides: own('[data-qui-carousel-slide]'),
		spv: Math.max(1, num(root, 'slidesperview', 1)),
		move: Math.max(1, num(root, 'move', 1)),
		rewind: root.hasAttribute('rewind') && root.getAttribute('rewind') !== 'false',
		vertical: (scroller?.dataset.orientation ?? root.getAttribute('orientation')) === 'vertical',
	};
}

function stops(c: Carousel): number[] {
	const last = Math.max(0, c.slides.length - c.spv);
	const out: number[] = [];
	for (let i = 0; i <= last; i += c.move) out.push(i);
	if (out.at(-1) !== last) out.push(last);
	return out;
}

const current = new WeakMap<HTMLElement, number>();
function indexOf(c: Carousel): number {
	const known = current.get(c.root);
	if (known !== undefined) return known;
	const active = c.slides.findIndex((s) => s.hasAttribute('data-active'));
	return active < 0 ? 0 : active;
}

function position(c: Carousel, index: number): number {
	if (!c.scroller) return 0;
	const gap = parseFloat(getComputedStyle(c.scroller).gap) || 0;
	const size = (s: HTMLElement) => (c.vertical ? s.offsetHeight : s.offsetWidth);
	let at = 0;
	for (let i = 0; i < index && i < c.slides.length; i++) at += size(c.slides[i]!) + gap;
	const align = c.scroller.dataset.align;
	const view = c.vertical ? c.scroller.parentElement!.clientHeight : c.scroller.parentElement!.clientWidth;
	const slide = c.slides[index] ? size(c.slides[index]!) : 0;
	if (align === 'center') at -= (view - slide) / 2;
	else if (align === 'end') at -= view - slide;
	const max = (c.vertical ? c.scroller.scrollHeight : c.scroller.scrollWidth) - view;
	return Math.max(0, Math.min(at, Math.max(0, max)));
}

function setTransform(c: Carousel, px: number, transition = true): void {
	if (!c.scroller) return;
	c.scroller.style.transition = transition ? '' : 'none';
	c.scroller.style.transform = c.vertical ? `translate3d(0px, ${-px}px, 0px)` : `translate3d(${-px}px, 0px, 0px)`;
}

function go(c: Carousel, index: number, focusBullet = false): void {
	const all = stops(c);
	const last = all.at(-1) ?? 0;
	index = Math.max(0, Math.min(index, last));
	current.set(c.root, index);
	c.slides.forEach((s, i) => {
		const inView = i >= index && i < index + c.spv;
		s.toggleAttribute('data-active', inView);
		s.inert = !inView;
		if (!c.scroller) s.hidden = !inView;
	});
	for (const prev of c.root.querySelectorAll<HTMLButtonElement>('[data-qui-carousel-prev]')) {
		const off = !c.rewind && index <= 0;
		prev.disabled = off;
		prev.setAttribute('aria-disabled', String(off));
	}
	for (const next of c.root.querySelectorAll<HTMLButtonElement>('[data-qui-carousel-next]')) {
		const off = !c.rewind && index >= last;
		next.disabled = off;
		next.setAttribute('aria-disabled', String(off));
	}
	const bullets = [...c.root.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]')];
	bullets.forEach((b, i) => {
		const isStop = all.includes(i);
		b.hidden = !isStop;
		const next = all.find((s) => s > i) ?? Infinity;
		const on = isStop && index >= i && index < next;
		b.toggleAttribute('data-active', on);
		b.setAttribute('aria-selected', String(on));
		b.tabIndex = i === index ? 0 : -1;
		if (on && focusBullet) b.focus();
	});
	for (const step of c.root.querySelectorAll<HTMLElement>('[data-qui-carousel-step]')) {
		const on = Number(step.dataset.step) === index;
		step.toggleAttribute('data-current', on);
		if (on) step.setAttribute('aria-current', 'step');
		else step.removeAttribute('aria-current');
	}
	setTransform(c, position(c, index));
	c.root.dispatchEvent(new CustomEvent('qui-carousel-index', { bubbles: true, detail: index }));
}

function step(c: Carousel, dir: 1 | -1, focusBullet = false): void {
	const all = stops(c);
	const at = indexOf(c);
	const pos = all.findIndex((s) => s >= at);
	let n = (pos < 0 ? all.length - 1 : all[pos] === at ? pos : dir > 0 ? pos - 1 : pos) + dir;
	if (n < 0) n = c.rewind ? all.length - 1 : 0;
	if (n >= all.length) n = c.rewind ? 0 : all.length - 1;
	go(c, all[n]!, focusBullet);
}

const players = new WeakMap<HTMLElement, ReturnType<typeof setInterval>>();
// isAutoplaySig: it turns on under reduced motion too, where no interval runs (use-carousel.tsx's useAutoplay).
const autoplay = new WeakMap<HTMLElement, boolean>();
function setPlaying(c: Carousel, on: boolean): void {
	clearInterval(players.get(c.root));
	players.delete(c.root);
	autoplay.set(c.root, on);
	if (on && !matchMedia('(prefers-reduced-motion: reduce)').matches) players.set(c.root, setInterval(() => go(c, (indexOf(c) + 1) % Math.max(1, c.slides.length)), num(c.root, 'autoplayintervalms', 0) || 1000));
	c.root.setAttribute('aria-live', on ? 'off' : 'polite');
	for (const p of c.root.querySelectorAll('[data-qui-carousel-player]')) p.setAttribute('aria-label', on ? 'stop automatic slide show' : 'start automatic slide show');
	c.root.dispatchEvent(new CustomEvent('qui-carousel-autoplay', { bubbles: true, detail: on }));
}

export function goTo(root: Element, index: number): void {
	const c = carouselOf(root);
	if (c) go(c, index);
}

export function setAutoplay(root: Element, on: boolean): void {
	const c = carouselOf(root);
	if (c) setPlaying(c, on);
}

export const autoplaying = (root: Element): boolean => autoplay.get(root as HTMLElement) ?? false;

export function click(target: Element): boolean {
	const c = carouselOf(target);
	if (!c) return false;
	if (target.closest('[data-qui-carousel-next]')) step(c, 1);
	else if (target.closest('[data-qui-carousel-prev]')) step(c, -1);
	else if (target.closest('[data-qui-carousel-player]')) setPlaying(c, !autoplay.get(c.root));
	else {
		const bullet = target.closest('[role="tablist"] [role="tab"]');
		const stepEl = target.closest<HTMLElement>('[data-qui-carousel-step]');
		if (bullet) go(c, [...c.root.querySelectorAll('[role="tablist"] [role="tab"]')].indexOf(bullet));
		else if (stepEl) go(c, Number(stepEl.dataset.step));
		else return false;
	}
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const bullet = target.closest('[role="tablist"] [role="tab"]');
	const c = bullet ? carouselOf(bullet) : undefined;
	if (!c || !['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return false;
	event.preventDefault();
	const all = stops(c);
	if (event.key === 'Home') go(c, all[0] ?? 0, true);
	else if (event.key === 'End') go(c, all.at(-1) ?? 0, true);
	else step(c, event.key === 'ArrowRight' ? 1 : -1, true);
	return true;
}

export function focusin(target: Element): boolean {
	const c = carouselOf(target);
	if (!c) return false;
	if (target.closest('[data-qui-carousel-slide]')) setPlaying(c, false);
	const bullet = target.closest('[role="tablist"] [role="tab"]');
	if (bullet) go(c, [...c.root.querySelectorAll('[role="tablist"] [role="tab"]')].indexOf(bullet));
	return !!bullet;
}

// A mouse drag on the viewport moves the track 1.5 px a pixel and snaps to the nearest slide when released.
export function pointerdown(target: Element, event: PointerEvent): boolean {
	const viewport = target.closest<HTMLElement>('[data-qui-carousel-viewport]');
	const c = viewport ? carouselOf(viewport) : undefined;
	if (!c || !c.scroller || event.pointerType !== 'mouse' || c.scroller.dataset.draggable === 'false') return false;
	const start = c.vertical ? event.clientY : event.clientX;
	const from = position(c, indexOf(c));
	const max = position(c, c.slides.length - 1);
	let now = from;
	const moveTo = (e: PointerEvent) => {
		now = Math.max(0, Math.min(max, from + (start - (c.vertical ? e.clientY : e.clientX)) * 1.5));
		setTransform(c, now, false);
	};
	const end = () => {
		window.removeEventListener('pointermove', moveTo);
		window.removeEventListener('pointerup', end);
		let best = 0;
		for (let i = 0; i < c.slides.length; i++) if (Math.abs(position(c, i) - now) < Math.abs(position(c, best) - now)) best = i;
		go(c, best);
	};
	window.addEventListener('pointermove', moveTo);
	window.addEventListener('pointerup', end);
	return true;
}
