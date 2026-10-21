// Radix ScrollArea's horizontal scrollbar under the settings nav (components/ui/scroll-area.tsx in the old app): the
// scrollbar's --radix-scroll-area-thumb-width, measured from the viewport and its content each time either resizes
// (Radix debounces that by 10 ms), and the thumb, there while the content overflows and moved with the scroll position.
const MIN_THUMB = 18;

type Sizes = { content: number; viewport: number; bar: number; padding: number };

function thumbSize(sizes: Sizes): number {
	const ratio = sizes.viewport / sizes.content;
	return Math.max((sizes.bar - sizes.padding) * (Number.isNaN(ratio) ? 0 : ratio), MIN_THUMB);
}

function thumbOffset(scroll: number, sizes: Sizes): number {
	const maxScroll = sizes.content - sizes.viewport;
	const maxThumb = sizes.bar - sizes.padding - thumbSize(sizes);
	if (maxScroll <= 0) return 0;
	return (Math.min(Math.max(scroll, 0), maxScroll) / maxScroll) * maxThumb;
}

export function trackScrollbar(area: HTMLElement | undefined): void {
	const viewport = area?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]');
	const bar = area?.querySelector<HTMLElement>('[data-slot=scroll-area-scrollbar]');
	const content = viewport?.firstElementChild;
	if (!viewport || !bar || !content) return;
	const measure = (): Sizes => {
		const style = getComputedStyle(bar);
		return { content: viewport.scrollWidth, viewport: viewport.offsetWidth, bar: bar.clientWidth, padding: parseInt(style.paddingLeft, 10) + parseInt(style.paddingRight, 10) };
	};
	const place = (sizes: Sizes) => {
		const thumb = bar.querySelector<HTMLElement>('[data-slot=scroll-area-thumb]');
		if (thumb) thumb.style.transform = `translate3d(${thumbOffset(viewport.scrollLeft, sizes)}px, 0px, 0px)`;
	};
	const resize = () => {
		const sizes = measure();
		bar.style.setProperty('--radix-scroll-area-thumb-width', `${thumbSize(sizes)}px`);
		const ratio = sizes.viewport / sizes.content;
		const overflows = ratio > 0 && ratio < 1;
		let thumb = bar.querySelector<HTMLElement>('[data-slot=scroll-area-thumb]');
		if (overflows && !thumb) {
			thumb = document.createElement('div');
			thumb.setAttribute('data-state', 'visible');
			thumb.setAttribute('data-slot', 'scroll-area-thumb');
			thumb.className = 'relative flex-1 rounded-full bg-border';
			thumb.setAttribute('style', 'width: var(--radix-scroll-area-thumb-width); height: var(--radix-scroll-area-thumb-height);');
			bar.append(thumb);
		} else if (!overflows) thumb?.remove();
		place(sizes);
	};
	let timer: number | undefined;
	const observer = new ResizeObserver(() => {
		clearTimeout(timer);
		timer = window.setTimeout(resize, 10);
	});
	observer.observe(bar);
	observer.observe(content);
	viewport.addEventListener('scroll', () => place(measure()), { passive: true });
	resize();
}
