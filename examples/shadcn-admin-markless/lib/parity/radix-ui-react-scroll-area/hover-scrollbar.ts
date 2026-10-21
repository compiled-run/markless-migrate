// Radix ScrollArea with type "hover" (components/ui/scroll-area.tsx in the old app, around the command palette's list):
// the vertical scrollbar mounts while the pointer is over the area and the content overflows, and unmounts
// scrollHideDelay (600 ms) after the pointer leaves. Radix measures through a ResizeObserver whose callback waits a
// frame and is then debounced by 10 ms: first the viewport and its content (the scrollbar mounts once the content
// overflows), then the scrollbar and the content (the thumb gets its size and mounts).
const HIDE_DELAY = 600;
const DEBOUNCE = 10;
const MIN_THUMB = 18;
const BAR_CLASS = 'flex touch-none p-px transition-colors select-none h-full w-2.5 border-l border-l-transparent';
const BAR_STYLE = 'position: absolute; top: 0px; right: 0px; bottom: var(--radix-scroll-area-corner-height);';
const THUMB_CLASS = 'relative flex-1 rounded-full bg-border';
const THUMB_STYLE = 'width: var(--radix-scroll-area-thumb-width); height: var(--radix-scroll-area-thumb-height);';

type Tracking = { observer: ResizeObserver; frame: number; debounce: number };

const tracking = new WeakMap<HTMLElement, Tracking>();
const hideTimers = new WeakMap<HTMLElement, number>();

const viewportOf = (root: HTMLElement) => root.querySelector<HTMLElement>(':scope > [data-slot=scroll-area-viewport]');
const barOf = (root: HTMLElement) => root.querySelector<HTMLElement>(':scope > [data-slot=scroll-area-scrollbar]');

function sizes(viewport: HTMLElement, bar: HTMLElement) {
	const style = getComputedStyle(bar);
	const padding = parseInt(style.paddingTop, 10) + parseInt(style.paddingBottom, 10);
	const content = viewport.scrollHeight;
	const ratio = viewport.offsetHeight / content;
	const thumb = Math.max((bar.clientHeight - padding) * (Number.isNaN(ratio) ? 0 : ratio), MIN_THUMB);
	return { content, viewport: viewport.offsetHeight, bar: bar.clientHeight, padding, ratio, thumb };
}

/** The thumb follows the viewport's scroll position. */
export function placeScrollThumb(root: HTMLElement | null | undefined): void {
	const viewport = root && viewportOf(root);
	const bar = root && barOf(root);
	const thumb = bar?.querySelector<HTMLElement>('[data-slot=scroll-area-thumb]');
	if (!viewport || !bar || !thumb) return;
	const s = sizes(viewport, bar);
	const maxScroll = s.content - s.viewport;
	const maxThumb = s.bar - s.padding - s.thumb;
	const offset = maxScroll > 0 ? (Math.min(Math.max(viewport.scrollTop, 0), maxScroll) / maxScroll) * maxThumb : 0;
	thumb.style.transform = `translate3d(0px, ${offset}px, 0px)`;
}

// What a settled measurement changes: the scrollbar mounts or unmounts with the overflow; a mounted one sizes its thumb.
function measure(root: HTMLElement, viewport: HTMLElement, track: Tracking): void {
	const overflows = viewport.offsetHeight < viewport.scrollHeight;
	let bar = barOf(root);
	if (!overflows) {
		bar?.remove();
		return;
	}
	if (!bar) {
		bar = document.createElement('div');
		bar.setAttribute('data-orientation', 'vertical');
		bar.setAttribute('data-state', 'visible');
		bar.setAttribute('data-slot', 'scroll-area-scrollbar');
		bar.className = BAR_CLASS;
		bar.setAttribute('style', BAR_STYLE);
		root.append(bar);
		track.observer.observe(bar);
		return;
	}
	const s = sizes(viewport, bar);
	bar.style.setProperty('--radix-scroll-area-thumb-height', `${s.thumb}px`);
	let thumb = bar.querySelector<HTMLElement>('[data-slot=scroll-area-thumb]');
	if (s.ratio > 0 && s.ratio < 1 && !thumb) {
		thumb = document.createElement('div');
		thumb.setAttribute('data-state', 'visible');
		thumb.setAttribute('data-slot', 'scroll-area-thumb');
		thumb.className = THUMB_CLASS;
		thumb.setAttribute('style', THUMB_STYLE);
		bar.append(thumb);
	}
	placeScrollThumb(root);
}

/** The pointer entered the area: it is measured, and the scrollbar, then its thumb, mount. */
export function showScrollbar(root: HTMLElement | null | undefined): void {
	if (!root) return;
	clearTimeout(hideTimers.get(root));
	const viewport = viewportOf(root);
	const content = viewport?.firstElementChild;
	if (!viewport || !content || tracking.has(root)) return;
	const track: Tracking = {
		observer: new ResizeObserver(() => {
			cancelAnimationFrame(track.frame);
			track.frame = requestAnimationFrame(() => {
				clearTimeout(track.debounce);
				track.debounce = window.setTimeout(() => measure(root, viewport, track), DEBOUNCE);
			});
		}),
		frame: 0,
		debounce: 0,
	};
	tracking.set(root, track);
	track.observer.observe(viewport);
	track.observer.observe(content);
}

/** The pointer left the area: the scrollbar unmounts after scrollHideDelay, or at once when the area itself went. */
export function hideScrollbar(root: HTMLElement | null | undefined): void {
	if (!root) return;
	clearTimeout(hideTimers.get(root));
	if (!root.checkVisibility()) dropScrollbar(root);
	else hideTimers.set(root, window.setTimeout(() => dropScrollbar(root), HIDE_DELAY));
}

/** Unmounted at once, as when the area itself mounts afresh. */
export function dropScrollbar(root: HTMLElement | null | undefined): void {
	if (!root) return;
	clearTimeout(hideTimers.get(root));
	const track = tracking.get(root);
	if (track) {
		track.observer.disconnect();
		cancelAnimationFrame(track.frame);
		clearTimeout(track.debounce);
		tracking.delete(root);
	}
	barOf(root)?.remove();
}
