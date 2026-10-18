// Alpine.js's Sort plugin, x-sort (MIT, Caleb Porzio), on the same SortableJS library.
import Sortable from 'sortablejs';

export interface SortOptions {
	readonly ghost: boolean;
	readonly config?: Sortable.Options;
	/** Each x-sort:item element with its value. */
	readonly items: readonly (readonly [HTMLElement | undefined, unknown])[];
	/** The x-sort:handle elements. */
	readonly handles: readonly (HTMLElement | undefined)[];
}

export function sort(el: HTMLElement | undefined, options: SortOptions, run?: (item: unknown, position: number) => void): void {
	if (!el) return;
	const keys = new Map<Element, unknown>();
	// Alpine finds items and handles by these attributes, and they stay on its elements; SortableJS does the same here.
	for (const [item, value] of options.items) {
		if (!item) continue;
		item.setAttribute('x-sort:item', value === undefined ? '' : String(value));
		if (value !== undefined) keys.set(item, value);
	}
	for (const handle of options.handles) handle?.setAttribute('x-sort:handle', '');
	const useHandles = options.handles.length > 0;
	let ghostRef: HTMLElement | null = null;
	const sortable = new Sortable(el, {
		animation: 150,
		handle: useHandles ? '[x-sort\\:handle]' : undefined,
		scroll: true,
		forceAutoScrollFallback: true,
		scrollSensitivity: 50,
		preventOnFilter: false,
		filter(e: Event | TouchEvent) {
			const target = e.target as HTMLElement;
			if (target.closest('[x-sort\\:ignore]')) return true;
			if (!options.items.length) return false;
			return !target.closest('[x-sort\\:item]');
		},
		onSort(e) {
			if (e.from !== e.to && e.to !== (e as unknown as { target: Element }).target) return;
			const key = keys.get(e.item);
			if (key !== undefined) run?.(key, e.newIndex!);
		},
		onStart() {
			document.body.classList.add('sorting');
			ghostRef = document.querySelector('.sortable-ghost');
			if (!options.ghost && ghostRef) ghostRef.style.opacity = '0';
		},
		onEnd() {
			document.body.classList.remove('sorting');
			if (!options.ghost && ghostRef) ghostRef.style.opacity = '1';
			ghostRef = null;
		},
		...options.config,
	});
	void sortable;
}
