// The grid API the panel calls through its ref (api.ensureIndexVisible, getRowNode(id).setSelected), as plain
// functions over the grid's DOM: Markless has no component refs, so the port addresses the one grid on the page.
import { ROW_HEIGHT } from './model.ts';

const viewport = () => document.querySelector<HTMLElement>('.ag-body-viewport');

/** gridApi.ensureIndexVisible(index, position) for uniform row heights, no pinned or sticky rows. */
export function ensureIndexVisible(index: number, position: 'top' | 'bottom' | 'middle' | null, count: number): void {
	const body = viewport();
	if (!body || index < 0 || index >= count) return;
	const top = body.scrollTop;
	const height = body.clientHeight;
	const rowTop = index * ROW_HEIGHT;
	const rowBottom = rowTop + ROW_HEIGHT;
	const pxTop = rowTop;
	const pxBottom = rowBottom - height;
	let next: number | null = null;
	if (position === 'top') next = pxTop;
	else if (position === 'bottom') next = pxBottom;
	else if (position === 'middle') next = Math.min((pxTop + pxBottom) / 2, rowTop);
	else if (top > rowTop) next = pxTop;
	else if (top + height < rowBottom) next = pxBottom - pxTop > height ? pxTop : pxBottom;
	if (next !== null) body.scrollTop = next;
}

/** The browser's scrollbar width and whether scrollbars overlay the content, measured as AG Grid measures them. */
export function measureScrollbar(): { width: number; invisible: boolean } {
	const div = document.createElement('div');
	div.style.width = div.style.height = '100px';
	div.style.opacity = '0';
	div.style.overflow = 'scroll';
	div.style.position = 'absolute';
	document.body.appendChild(div);
	const width = div.offsetWidth - div.clientWidth;
	div.remove();
	return { width, invisible: width === 0 };
}

let mirrored = -1;
/** Mirrors the body's scroll position onto the fake vertical scrollbar (a handler cannot assign to a property of
 * an element() handle). */
export function setScrollTop(el: HTMLElement | undefined | null, top: number): void {
	if (!el || Math.abs(el.scrollTop - top) <= 1) return;
	mirrored = top;
	el.scrollTop = top;
}

/** The fake scrollbar was scrolled: move the body, unless this is the echo of the body's own scroll. */
export function scrollFromFake(body: HTMLElement | undefined | null, top: number): void {
	if (!body || Math.abs(top - mirrored) <= 1) return;
	if (Math.abs(body.scrollTop - top) > 1) body.scrollTop = top;
}

/** The popup's position under a header's filter button, relative to the grid's root wrapper, kept inside it. */
export function popupUnder(target: EventTarget | null, width: number): string {
	const button = (target as HTMLElement | null)?.closest('.ag-header-cell')?.querySelector('.ag-header-cell-filter-button');
	const root = document.querySelector('.ag-root-wrapper');
	if (!button || !root) return '';
	const b = button.getBoundingClientRect();
	const r = root.getBoundingClientRect();
	return `top: ${b.bottom - r.top + 4}px; left: ${Math.max(0, Math.min(b.left - r.left - 4, r.width - width))}px;`;
}

/** The operator list's position under a filter's operator picker. */
export function listUnder(target: EventTarget | null): string {
	const picker = (target as HTMLElement | null)?.closest('.ag-picker-field-wrapper');
	const root = document.querySelector('.ag-root-wrapper');
	if (!picker || !root) return '';
	const b = picker.getBoundingClientRect();
	const r = root.getBoundingClientRect();
	return `position: absolute; top: ${b.bottom - r.top}px; left: ${b.left - r.left}px; width: ${b.width}px; max-width: ${b.width}px; min-width: ${b.width}px;`;
}

/** Focuses a column's header cell, as AG Grid does when its filter popup closes. */
export function focusHeader(colId: string): void {
	document.querySelector<HTMLElement>(`.ag-header-cell[col-id="${colId}"]`)?.focus();
}

let scrollEnd = 0;
/** AG Grid's bodyScrollEnd: `done` runs once scrolling has been quiet for a while. */
export function afterScroll(done: () => void): void {
	clearTimeout(scrollEnd);
	scrollEnd = window.setTimeout(done, 500);
}

let debounce = 0;
/** The text filter's 500 ms debounce before a typed value applies. */
export function debounceFilter(apply: () => void): void {
	clearTimeout(debounce);
	debounce = window.setTimeout(apply, 500);
}

/** Starts a resize-bar drag: `move` gets the pointer's horizontal travel until the button is released. */
export function dragX(start: PointerEvent, move: (dx: number) => void): void {
	const x = start.clientX;
	const onMove = (e: PointerEvent) => move(e.clientX - x);
	const onUp = () => {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
	};
	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', onUp);
}

/** Watches the body viewport's size; AG Grid re-lays out columns and rows when it changes. */
export function watchSize(el: HTMLElement | undefined | null, changed: (width: number, height: number) => void): void {
	if (!el) return;
	changed(el.clientWidth, el.clientHeight);
	new ResizeObserver(() => changed(el.clientWidth, el.clientHeight)).observe(el);
}

/** The row id of the row element an event's handler sits on (a row component's handler cannot read its row prop). */
export function rowIdOf(e: Event): number {
	return Number(rowOf(e)?.getAttribute('row-id') ?? 0);
}

/** The row element an event happened in (event.currentTarget is gone by the time a resumed handler runs). */
export function rowOf(e: Event): HTMLElement | null {
	return (e.target as HTMLElement | null)?.closest<HTMLElement>('[row-id]') ?? null;
}

const ran = new Set<string>();
/** True the first time for `key`: an onIdle handler can run more than once for one element. */
export function firstTime(key: string): boolean {
	if (ran.has(key)) return false;
	ran.add(key);
	return true;
}

/** Runs `then` once the rows container is `count` rows tall: the grid's DOM is written after the state change
 * that grows it, so a scroll to the new last row has to wait for that write. */
export function afterRowsRendered(count: number, then: () => void): void {
	const container = document.querySelector<HTMLElement>('.ag-center-cols-container');
	if (!container) return;
	const want = `${count * ROW_HEIGHT}px`;
	if (container.style.height === want) return then();
	const observer = new ResizeObserver(() => {
		if (container.style.height !== want) return;
		observer.disconnect();
		then();
	});
	observer.observe(container);
}

let lastAnnouncement = '';
let announceTimer = 0;
/** AG Grid's aria announcer: debounced 200 ms, then the live region is cleared and set 50 ms later, with a
 * zero-width space added when the text repeats so screen readers read it again. */
export function announce(text: string, set: (text: string) => void): void {
	clearTimeout(announceTimer);
	announceTimer = window.setTimeout(() => {
		set('');
		setTimeout(() => {
			const value = text === lastAnnouncement ? `${text}\u200B` : text;
			lastAnnouncement = value;
			set(value);
		}, 50);
	}, 200);
}

/** Keeps keyboard focus on a row element across re-renders of the rows: Markless's keyed list re-inserts every
 * row element when the rendered range changes, which drops focus to the body (see the log). */
export function keepRowFocus(container: HTMLElement | null): void {
	if (!container) return;
	let focused: HTMLElement | null = null;
	container.addEventListener('focusin', (e) => {
		focused = (e.target as HTMLElement).closest<HTMLElement>('[row-id]');
	});
	const away = (e: Event) => {
		if (!container.contains(e.target as Node)) focused = null;
	};
	document.addEventListener('focusin', away);
	document.addEventListener('mousedown', away, true);
	new MutationObserver(() => {
		if (focused?.isConnected && document.activeElement === document.body) focused.focus({ preventScroll: true });
	}).observe(container, { childList: true });
}

/** Focuses the first field of a filter popup once it is shown, as AG Grid does when a filter opens: the popup's
 * `hidden` attribute is removed after the state change that opens it. */
export function focusWhenShown(popup: string, field: string): void {
	const el = document.querySelector<HTMLElement>(popup);
	if (!el) return;
	const go = () => el.querySelector<HTMLElement>(field)?.focus();
	if (!el.classList.contains('ag-hidden')) return go();
	const observer = new MutationObserver(() => {
		if (el.classList.contains('ag-hidden')) return;
		observer.disconnect();
		go();
	});
	observer.observe(el, { attributes: true, attributeFilter: ['class'] });
}
