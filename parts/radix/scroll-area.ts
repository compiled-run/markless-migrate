// Radix ScrollArea (type "hover", as shadcn renders it): the scrollbar shows while the pointer is over the area and hides
// scrollHideDelay (600 ms) after it leaves; its thumb is sized to the share of the content in view
// (--radix-scroll-area-thumb-height or -width) and moved with the scroll (translate3d). A press on the scrollbar scrolls
// so the thumb's centre (or the point of the thumb pressed) is under the pointer and keeps doing so as it moves; the
// wheel over a scrollbar scrolls its axis. The scrollbars Radix mounts on hover are rendered hidden in the area
// (convert's companions).

const ROOT = '[data-slot="scroll-area"]';
const HIDE_DELAY = 600;
const wired = new WeakSet<Element>();
const timers = new WeakMap<Element, number>();

const scrollbarsOf = (root: Element) => [...root.querySelectorAll<HTMLElement>('[data-mm-shown-with] [data-slot="scroll-area-scrollbar"], [data-slot="scroll-area-scrollbar"][data-mm-shown-with]')].filter((s) => s.closest(ROOT) === root);
const holderOf = (bar: HTMLElement) => bar.closest<HTMLElement>('[data-mm-shown-with]') ?? bar;

interface Sizes {
	readonly content: number;
	readonly viewport: number;
	readonly size: number;
	readonly paddingStart: number;
	readonly paddingEnd: number;
}
function sizesOf(viewport: HTMLElement, bar: HTMLElement, vertical: boolean): Sizes {
	const css = getComputedStyle(bar);
	return {
		content: vertical ? viewport.scrollHeight : viewport.scrollWidth,
		viewport: vertical ? viewport.offsetHeight : viewport.offsetWidth,
		size: vertical ? bar.clientHeight : bar.clientWidth,
		paddingStart: parseInt(vertical ? css.paddingTop : css.paddingLeft) || 0,
		paddingEnd: parseInt(vertical ? css.paddingBottom : css.paddingRight) || 0,
	};
}
const thumbSize = (s: Sizes) => Math.max((s.size - s.paddingStart - s.paddingEnd) * (s.content ? s.viewport / s.content : 0), 18);
const scale = (input: readonly [number, number], output: readonly [number, number]) => (value: number) => (input[0] === input[1] || output[0] === output[1] ? output[0] : output[0] + ((output[1] - output[0]) / (input[1] - input[0])) * (value - input[0]));

function update(root: HTMLElement): void {
	const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"], [data-radix-scroll-area-viewport]');
	if (!viewport) return;
	const rtl = getComputedStyle(root).direction === 'rtl';
	for (const bar of scrollbarsOf(root)) {
		const vertical = bar.getAttribute('data-orientation') !== 'horizontal';
		const thumb = bar.querySelector<HTMLElement>('[data-slot="scroll-area-thumb"]');
		if (!thumb) continue;
		const s = sizesOf(viewport, bar, vertical);
		const size = thumbSize(s);
		bar.style.setProperty(vertical ? '--radix-scroll-area-thumb-height' : '--radix-scroll-area-thumb-width', `${size}px`);
		const max = s.content - s.viewport;
		const range: [number, number] = !vertical && rtl ? [-max, 0] : [0, max];
		const pos = Math.min(range[1], Math.max(range[0], vertical ? viewport.scrollTop : viewport.scrollLeft));
		const offset = scale([0, max], [0, s.size - s.paddingStart - s.paddingEnd - size])(pos);
		thumb.style.transform = vertical ? `translate3d(0, ${offset}px, 0)` : `translate3d(${offset}px, 0, 0)`;
	}
}

function show(root: HTMLElement): void {
	clearTimeout(timers.get(root));
	for (const bar of scrollbarsOf(root)) {
		holderOf(bar).hidden = false;
		bar.hidden = false;
		bar.setAttribute('data-state', 'visible');
		bar.querySelector('[data-slot="scroll-area-thumb"]')?.setAttribute('data-state', 'visible');
	}
	update(root);
}

function hideLater(root: HTMLElement): void {
	clearTimeout(timers.get(root));
	timers.set(
		root,
		window.setTimeout(() => {
			for (const bar of scrollbarsOf(root)) {
				bar.setAttribute('data-state', 'hidden');
				bar.querySelector('[data-slot="scroll-area-thumb"]')?.setAttribute('data-state', 'hidden');
				holderOf(bar).hidden = true;
			}
		}, HIDE_DELAY),
	);
}

export function pointerover(target: Element): boolean {
	const root = target.closest<HTMLElement>(ROOT);
	if (!root || !scrollbarsOf(root).length) return false;
	if (!wired.has(root)) {
		wired.add(root);
		const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"], [data-radix-scroll-area-viewport]');
		viewport?.addEventListener('scroll', () => update(root));
		root.addEventListener('pointerleave', () => hideLater(root));
		root.addEventListener('pointerenter', () => show(root));
		// ScrollAreaScrollbarImpl's document wheel listener: the wheel over a scrollbar moves the viewport.
		root.addEventListener(
			'wheel',
			(event) => {
				const bar = (event.target as Element).closest<HTMLElement>('[data-slot="scroll-area-scrollbar"]');
				if (!bar || !viewport || bar.closest(ROOT) !== root) return;
				const vertical = bar.getAttribute('data-orientation') !== 'horizontal';
				const max = vertical ? viewport.scrollHeight - viewport.clientHeight : viewport.scrollWidth - viewport.clientWidth;
				const pos = (vertical ? viewport.scrollTop : viewport.scrollLeft) + (vertical ? event.deltaY : event.deltaX);
				if (vertical) viewport.scrollTop = pos;
				else viewport.scrollLeft = pos;
				if (pos > 0 && pos < max) event.preventDefault();
			},
			{ passive: false },
		);
	}
	show(root);
	return false;
}

// ScrollAreaScrollbarImpl's press: the pointer, less the point of the thumb pressed (its centre on the track), scales to
// the scroll position, from the press and on every move until the release.
export function pointerdown(target: Element, event: PointerEvent): boolean {
	const bar = target.closest<HTMLElement>('[data-slot="scroll-area-scrollbar"]');
	const root = bar?.closest<HTMLElement>(ROOT);
	const viewport = root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"], [data-radix-scroll-area-viewport]');
	if (!bar || !root || !viewport || event.button !== 0) return false;
	const vertical = bar.getAttribute('data-orientation') !== 'horizontal';
	const thumb = bar.querySelector<HTMLElement>('[data-slot="scroll-area-thumb"]');
	const rtl = getComputedStyle(root).direction === 'rtl';
	const thumbRect = thumb?.contains(target) ? thumb.getBoundingClientRect() : undefined;
	const pointerOffset = thumbRect ? (vertical ? event.clientY - thumbRect.top : event.clientX - thumbRect.left) : 0;
	const rect = bar.getBoundingClientRect();
	(target as HTMLElement).setPointerCapture?.(event.pointerId);
	const userSelect = document.body.style.webkitUserSelect;
	document.body.style.webkitUserSelect = 'none';
	viewport.style.scrollBehavior = 'auto';
	const drag = (e: PointerEvent) => {
		const s = sizesOf(viewport, bar, vertical);
		const size = thumbSize(s);
		const offset = pointerOffset || size / 2;
		const max = s.content - s.viewport;
		const to = scale([s.paddingStart + offset, s.size - s.paddingEnd - (size - offset)], !vertical && rtl ? [-max, 0] : [0, max])(vertical ? e.clientY - rect.top : e.clientX - rect.left);
		if (vertical) viewport.scrollTop = to;
		else viewport.scrollLeft = to;
	};
	const up = () => {
		document.removeEventListener('pointermove', drag, true);
		document.removeEventListener('pointerup', up, true);
		document.body.style.webkitUserSelect = userSelect;
		viewport.style.scrollBehavior = '';
	};
	document.addEventListener('pointermove', drag, true);
	document.addEventListener('pointerup', up, true);
	drag(event);
	return true;
}
