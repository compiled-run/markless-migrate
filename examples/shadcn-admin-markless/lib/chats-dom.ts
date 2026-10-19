// Rows of an @for keep the attribute values they were created with, so what changes on a kept row is written here.
export function markActive(list: HTMLElement | undefined, id: string): void {
	for (const item of list?.querySelectorAll<HTMLElement>('[cmdk-item]') ?? []) {
		const on = String(item.id === `new-chat-item-${id}`);
		item.setAttribute('aria-selected', on);
		item.setAttribute('data-selected', on);
	}
}

export function markChosen(list: HTMLElement | undefined, chosen: string): void {
	const ids = chosen ? chosen.split(',') : [];
	for (const item of list?.querySelectorAll<HTMLElement>('[cmdk-item]') ?? []) {
		const check = item.querySelector<SVGElement>(':scope > svg');
		if (check) check.style.display = ids.includes(item.id.replace('new-chat-item-', '')) ? '' : 'none';
	}
}

export function markChat(list: HTMLElement | undefined, id: string): void {
	for (const button of list?.querySelectorAll<HTMLElement>('button[data-chat]') ?? []) button.classList.toggle('sm:bg-muted', button.dataset.chat === id);
}

const hideTimers = new WeakMap<HTMLElement, number>();

function scrollParts(root: HTMLElement) {
	const viewport = root.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]');
	const bar = root.querySelector<HTMLElement>('[data-slot=scroll-area-scrollbar]');
	const thumb = bar?.querySelector<HTMLElement>('[data-slot=scroll-area-thumb]');
	return { viewport, bar, thumb };
}

/** Radix ScrollArea (type "hover"): the thumb's size and offset from the viewport's scroll position. */
export function placeThumb(root: HTMLElement | undefined): void {
	if (!root) return;
	const { viewport, bar, thumb } = scrollParts(root);
	if (!viewport || !bar || !thumb || bar.hidden) return;
	const content = viewport.scrollHeight;
	const size = bar.clientHeight;
	const padding = 2;
	const ratio = viewport.offsetHeight / content;
	const thumbSize = Math.max((size - padding) * ratio, 18);
	bar.style.setProperty('--radix-scroll-area-thumb-height', `${thumbSize}px`);
	const maxScroll = content - viewport.offsetHeight;
	const maxThumb = size - padding - thumbSize;
	const offset = maxScroll > 0 ? Math.min(Math.max((viewport.scrollTop / maxScroll) * maxThumb, 0), maxThumb) : 0;
	thumb.style.transform = `translate3d(0px, ${offset}px, 0px)`;
}

/** The scrollbar shows while the pointer is over the area and its content overflows. */
export function showScrollbar(root: HTMLElement | undefined): void {
	if (!root) return;
	clearTimeout(hideTimers.get(root));
	const { viewport, bar } = scrollParts(root);
	if (!viewport || !bar || viewport.scrollHeight <= viewport.offsetHeight) return;
	bar.hidden = false;
	placeThumb(root);
}

/** Radix's scrollHideDelay: hidden 600 ms after the pointer leaves. */
export function hideScrollbar(root: HTMLElement | undefined): void {
	if (!root) return;
	clearTimeout(hideTimers.get(root));
	hideTimers.set(root, window.setTimeout(() => {
		const { bar } = scrollParts(root);
		if (bar) bar.hidden = true;
	}, 600));
}
