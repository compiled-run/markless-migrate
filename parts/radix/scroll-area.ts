// Radix ScrollArea (type "hover", as shadcn renders it): the scrollbar shows while the pointer is over the area or it
// scrolls, and hides scrollHideDelay (600 ms) after; its thumb is sized to the share of the content in view
// (--radix-scroll-area-thumb-height or -width) and moved with the scroll (translate3d). The scrollbars Radix mounts on
// hover are rendered hidden in the area (convert's companions); this only shows, sizes and moves them.

const ROOT = '[data-slot="scroll-area"]';
const HIDE_DELAY = 600;
const wired = new WeakSet<Element>();
const timers = new WeakMap<Element, number>();

const scrollbarsOf = (root: Element) => [...root.querySelectorAll<HTMLElement>('[data-mm-shown-with] [data-slot="scroll-area-scrollbar"], [data-slot="scroll-area-scrollbar"][data-mm-shown-with]')].filter((s) => s.closest(ROOT) === root);
const holderOf = (bar: HTMLElement) => bar.closest<HTMLElement>('[data-mm-shown-with]') ?? bar;

function update(root: HTMLElement): void {
	const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"], [data-radix-scroll-area-viewport]');
	if (!viewport) return;
	for (const bar of scrollbarsOf(root)) {
		const vertical = bar.getAttribute('data-orientation') !== 'horizontal';
		const thumb = bar.querySelector<HTMLElement>('[data-slot="scroll-area-thumb"]');
		if (!thumb) continue;
		const view = vertical ? viewport.clientHeight : viewport.clientWidth;
		const content = vertical ? viewport.scrollHeight : viewport.scrollWidth;
		const css = getComputedStyle(bar);
		const padding = vertical ? parseInt(css.paddingTop) + parseInt(css.paddingBottom) : parseInt(css.paddingLeft) + parseInt(css.paddingRight);
		const track = ((vertical ? bar.clientHeight : bar.clientWidth) || view) - (padding || 0);
		const size = Math.max(18, (view / (content || 1)) * track);
		bar.style.setProperty(vertical ? '--radix-scroll-area-thumb-height' : '--radix-scroll-area-thumb-width', `${size}px`);
		const scrolled = vertical ? viewport.scrollTop : Math.abs(viewport.scrollLeft);
		const offset = content > view ? (scrolled / (content - view)) * (track - size) : 0;
		thumb.style.transform = vertical ? `translate3d(0px, ${offset}px, 0px)` : `translate3d(${offset}px, 0px, 0px)`;
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
		viewport?.addEventListener('scroll', () => {
			show(root);
			if (!root.matches(':hover')) hideLater(root);
		});
		root.addEventListener('pointerleave', () => hideLater(root));
	}
	show(root);
	return false;
}
