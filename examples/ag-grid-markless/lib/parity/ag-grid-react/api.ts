// The grid API the panel calls through its ref (api.ensureIndexVisible, getRowNode(id).setSelected), as plain
// functions over the grid's DOM: Markless has no component refs, so the port addresses the one grid on the page.
import { ROW_HEIGHT } from './model.ts';

const viewport = () => document.querySelector<HTMLElement>('.ag-body-viewport');

/** gridApi.ensureIndexVisible(index, position) for uniform row heights, no pinned or sticky rows. */
export function ensureIndexVisible(
	index: number,
	position: 'top' | 'bottom' | 'middle' | null,
	count: number,
): void {
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
	if (next !== null && Math.abs(body.scrollTop - next) >= 1) {
		programmatic = true;
		body.scrollTop = next;
	}
}

let programmatic = false;
/** Whether the scroll event being handled came from ensureIndexVisible: AG Grid's own scrolls do not show the
 * overlay scrollbar. */
export function wasProgrammatic(): boolean {
	const was = programmatic;
	programmatic = false;
	return was;
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
	const button = (target as HTMLElement | null)
		?.closest('.ag-header-cell')
		?.querySelector('.ag-header-cell-filter-button');
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
/** AG Grid's bodyScrollEnd (150 ms of no scrolling) and the overlay scrollbar's 400 ms before it hides. */
export function afterScroll(done: () => void): void {
	clearTimeout(scrollEnd);
	scrollEnd = window.setTimeout(done, 550);
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
export function watchSize(
	el: HTMLElement | undefined | null,
	changed: (width: number, height: number) => void,
): void {
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

let lastAnnouncement = 'No Rows To Show';
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
		if (focused?.isConnected && document.activeElement === document.body)
			focused.focus({ preventScroll: true });
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

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

function tabbable(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
	);
}

/** AG Grid's tab out of the grid: focus the first tabbable element after (or before) the grid, or leave focus on
 * the page when there is none. */
export function tabOut(forward: boolean): void {
	const grid = document.querySelector<HTMLElement>('.ag-root-wrapper');
	if (!grid) return;
	const all = tabbable().filter((el) => !grid.contains(el));
	const position = (el: HTMLElement) => grid.compareDocumentPosition(el);
	const target = forward
		? all.find((el) => position(el) & Node.DOCUMENT_POSITION_FOLLOWING)
		: all.reverse().find((el) => position(el) & Node.DOCUMENT_POSITION_PRECEDING);
	if (target) target.focus();
	else if (forward) {
		// Nothing after the grid: focus the bottom guard and let the browser's own Tab (not prevented on the last
		// header) carry focus off the page, so the next Shift+Tab comes back in through the guard.
		quietGuard = true;
		document.querySelector<HTMLElement>('.ag-tab-guard-bottom')?.focus();
	} else (document.activeElement as HTMLElement | null)?.blur();
}

let headerAt = 0;
let quietGuard = false;

/** Whether a focus event landed on the last shown header cell (Tab there leaves the grid). */
export function isLastHeader(e: Event): boolean {
	const list = headers().filter((h) => h.getClientRects().length > 0);
	return list[list.length - 1] === e.target;
}

function headers(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>('.ag-header-cell[col-id]')];
}

/** Focuses header cell `index` (clamped); AG Grid remembers it as where focus re-enters the header. */
export function focusHeaderAt(index: number): void {
	const list = headers();
	if (!list.length) return;
	headerAt = Math.max(0, Math.min(list.length - 1, index));
	list[headerAt]!.focus();
}

/** A tab guard took focus: from outside the grid it hands focus to a header cell; from inside, focus leaves. */
export function onGuardFocus(e: FocusEvent, top: boolean): void {
	if (quietGuard) {
		quietGuard = false;
		return;
	}
	const grid = document.querySelector('.ag-root-wrapper');
	const from = e.relatedTarget as Node | null;
	if (from && grid?.contains(from)) return tabOut(!top);
	focusHeaderAt(top ? headerAt : headers().length - 1);
}

/** Keys on a header cell that AG Grid handles itself: Tab and arrows between cells, ArrowDown to the grid body.
 * The handler prevents the default for these keys itself, where Markless can see it. */
export function onHeaderKey(e: KeyboardEvent): boolean {
	const list = headers();
	const at = list.indexOf(e.target as HTMLElement);
	if (at < 0) return false;
	if (e.key === 'Tab') {
		if (e.shiftKey && at === 0) tabOut(false);
		else if (e.shiftKey) focusHeaderAt(at - 1);
		else if (at === list.length - 1) tabOut(true);
		else focusHeaderAt(at + 1);
		return true;
	}
	if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
		focusHeaderAt(at + (e.key === 'ArrowRight' ? 1 : -1));
		return true;
	}
	if (e.key === 'ArrowDown') {
		quietGuard = true;
		document.querySelector<HTMLElement>('.ag-tab-guard-bottom')?.focus();
		return true;
	}
	return false;
}

/** Focuses a text filter's operator picker (condition 0 or 1), where AG Grid leaves focus after a pick. */
export function focusPicker(which: number): void {
	document
		.querySelectorAll<HTMLElement>('.ag-popup[data-filter="text"] .ag-picker-field-wrapper')
		[which]?.focus();
}

/** AG Grid's popup service closes popups on a pointer press outside them and outside the button that opened them. */
export function onOutsidePointer(close: () => void): void {
	document.addEventListener(
		'mousedown',
		(e) => {
			const target = e.target as HTMLElement;
			if (
				target.closest('.ag-popup:not(.ag-hidden)') ||
				target.closest('.ag-header-cell-filter-button')
			)
				return;
			if (!document.querySelector('.ag-popup:not(.ag-hidden)')) return;
			close();
		},
		true,
	);
}

let dragged = false;
/** Whether the click being handled ends a header drag (AG Grid does not sort a column it has just moved). */
export function wasDragged(): boolean {
	const was = dragged;
	dragged = false;
	return was;
}

/** The header container's left edge, the origin for column positions while a header is dragged. */
export function headerBox(): number {
	return document.querySelector('.ag-header-container')?.getBoundingClientRect().left ?? 0;
}

function outsideGrid(e: PointerEvent): boolean {
	const box = document.querySelector('.ag-root-wrapper')?.getBoundingClientRect();
	return (
		!box ||
		e.clientX < box.left ||
		e.clientX > box.right ||
		e.clientY < box.top ||
		e.clientY > box.bottom
	);
}

/** A header drag: once the pointer has moved 4 px (AG Grid's dragStartPixels), `move` gets the pointer's x on every
 * move and once more when the button is released, and whether the pointer is outside the grid (which hides it). */
export function dragMove(
	start: PointerEvent,
	move: (x: number, done: boolean, outside: boolean) => void,
): void {
	if (start.button !== 0) return;
	const x0 = start.clientX;
	const y0 = start.clientY;
	let moving = false;
	dragged = false;
	const onMove = (e: PointerEvent) => {
		if (!moving && Math.abs(e.clientX - x0) < 4 && Math.abs(e.clientY - y0) < 4) return;
		moving = true;
		dragged = true;
		move(e.clientX, false, outsideGrid(e));
	};
	const onUp = (e: PointerEvent) => {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		if (moving) move(e.clientX, true, outsideGrid(e));
	};
	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', onUp);
}
