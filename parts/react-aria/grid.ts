// React Aria's Table keyboard and focus model (useTable, useGrid, useSelectableCollection, useSelectableItem, useGridCell
// and TableKeyboardDelegate, focusMode "row", cells with focusMode "child"): the table is one tab stop until focus enters
// it, then the focused row, cell or column header is; arrows, Home, End, PageUp, PageDown and typing move focus among
// them, a cell's focusable children take focus in its place, and Tab leaves the table. Selection is Markless state
// (convert's RacTablePlan).
import { keyboardModality } from './interactions.ts';

const TABLE = 'table[data-rac][data-collection][role="grid"], table[data-rac][data-collection][role="treegrid"]';
const CELL = '[role="gridcell"], [role="rowheader"], [role="columnheader"]';

type Kind = 'column' | 'item' | 'cell';
interface Model {
	readonly table: HTMLElement;
	readonly columns: HTMLElement[];
	readonly rows: HTMLElement[];
	readonly rtl: boolean;
}
interface State {
	focusedKey: HTMLElement | null;
	isFocused: boolean;
	childFocusStrategy: 'first' | 'last' | null;
	keyWhenFocused: WeakSet<HTMLElement>;
	search: string;
	searchTimeout?: ReturnType<typeof setTimeout>;
}
const states = new WeakMap<HTMLElement, State>();

function stateOf(table: HTMLElement): State {
	let s = states.get(table);
	if (!s) states.set(table, (s = { focusedKey: null, isFocused: false, childFocusStrategy: null, keyWhenFocused: new WeakSet(), search: '' }));
	return s;
}

const own = (table: HTMLElement, el: Element) => el.closest(TABLE) === table;

function model(table: HTMLElement): Model {
	const headerRows = [...table.querySelectorAll<HTMLElement>('thead tr[role="row"]')].filter((r) => own(table, r));
	const columns = headerRows.length ? [...headerRows[headerRows.length - 1]!.querySelectorAll<HTMLElement>('[role="columnheader"]')].filter((c) => own(table, c)) : [];
	const rows = [...table.querySelectorAll<HTMLElement>('tbody tr[role="row"], tfoot tr[role="row"]')].filter((r) => own(table, r));
	return { table, columns, rows, rtl: getComputedStyle(table).direction === 'rtl' };
}

const kindOf = (el: HTMLElement): Kind => (el.getAttribute('role') === 'columnheader' ? 'column' : el.getAttribute('role') === 'row' ? 'item' : 'cell');
const cellsOf = (row: HTMLElement) => [...row.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.matches(CELL));
const rowOf = (cell: HTMLElement) => cell.closest<HTMLElement>('tr[role="row"]')!;
const indexOf = (m: Model, el: HTMLElement) => (kindOf(el) === 'column' ? m.columns.indexOf(el) : cellsOf(rowOf(el)).indexOf(el));
const disabled = (row: HTMLElement) => row.getAttribute('aria-disabled') === 'true';

// TableKeyboardDelegate over GridKeyboardDelegate, focusMode "row".
function nextRow(m: Model, from: HTMLElement | null): HTMLElement | null {
	for (let i = from ? m.rows.indexOf(from) + 1 : 0; i < m.rows.length; i++) if (!disabled(m.rows[i]!)) return m.rows[i]!;
	return null;
}
function previousRow(m: Model, from: HTMLElement | null): HTMLElement | null {
	for (let i = from ? m.rows.indexOf(from) - 1 : m.rows.length - 1; i >= 0; i--) if (!disabled(m.rows[i]!)) return m.rows[i]!;
	return null;
}
const cellAt = (row: HTMLElement, index: number) => (index < 0 ? null : (cellsOf(row)[index] ?? null));

function keyBelow(m: Model, key: HTMLElement): HTMLElement | null {
	const kind = kindOf(key);
	if (kind === 'column') {
		const first = firstKey(m, null);
		return first ? cellAt(first, indexOf(m, key)) : null;
	}
	const row = kind === 'cell' ? rowOf(key) : key;
	const next = nextRow(m, row);
	if (!next) return null;
	return kind === 'cell' ? cellAt(next, indexOf(m, key)) : next;
}

function keyAbove(m: Model, key: HTMLElement): HTMLElement | null {
	const kind = kindOf(key);
	if (kind === 'column') return null;
	const row = kind === 'cell' ? rowOf(key) : key;
	const previous = previousRow(m, row);
	if (previous) return kind === 'cell' ? cellAt(previous, indexOf(m, key)) : previous;
	return kind === 'cell' ? (m.columns[indexOf(m, key)] ?? null) : (m.columns[0] ?? null);
}

function keyRightOf(m: Model, key: HTMLElement, left = false): HTMLElement | null {
	const back = left !== m.rtl;
	const kind = kindOf(key);
	if (kind === 'column') {
		const at = m.columns.indexOf(key);
		// findNextColumnKey: past the last column of its header row it goes back to the first (and the other way).
		return (back ? m.columns[at - 1] ?? m.columns[m.columns.length - 1] : m.columns[at + 1] ?? m.columns[0]) ?? null;
	}
	if (kind === 'item') {
		const cells = cellsOf(key);
		return (back ? cells[cells.length - 1] : cells[0]) ?? null;
	}
	const cells = cellsOf(rowOf(key));
	const at = cells.indexOf(key);
	return cells[back ? at - 1 : at + 1] ?? rowOf(key);
}

function firstKey(m: Model, from: HTMLElement | null, global = false): HTMLElement | null {
	if (from && kindOf(from) !== 'item' && !global) return (kindOf(from) === 'column' ? m.columns[0] : cellsOf(rowOf(from))[0]) ?? null;
	const row = nextRow(m, null);
	if (row && from && kindOf(from) !== 'item' && global) return cellsOf(row)[0] ?? null;
	return row;
}

function lastKey(m: Model, from: HTMLElement | null, global = false): HTMLElement | null {
	if (from && kindOf(from) !== 'item' && !global) {
		const list = kindOf(from) === 'column' ? m.columns : cellsOf(rowOf(from));
		return list[list.length - 1] ?? null;
	}
	const row = previousRow(m, null);
	if (row && from && kindOf(from) !== 'item' && global) {
		const cells = cellsOf(row);
		return cells[cells.length - 1] ?? null;
	}
	return row;
}

// DOMLayoutDelegate: rects relative to the table, which is its own scroll container.
function rectOf(m: Model, el: HTMLElement) {
	const c = m.table.getBoundingClientRect();
	const r = el.getBoundingClientRect();
	return { y: r.top - c.top - m.table.clientTop + m.table.scrollTop, height: r.height };
}

function keyPageAbove(m: Model, key: HTMLElement): HTMLElement | null {
	let at: HTMLElement | null = key;
	let rect = rectOf(m, key);
	const pageY = Math.max(0, rect.y + rect.height - m.table.clientHeight);
	while (at && rect.y > pageY) {
		const above = keyAbove(m, at);
		if (!above) break;
		at = above;
		rect = rectOf(m, at);
	}
	return at;
}

function keyPageBelow(m: Model, key: HTMLElement): HTMLElement | null {
	let at = key;
	let rect = rectOf(m, key);
	const pageY = Math.min(m.table.scrollHeight, rect.y + m.table.clientHeight);
	while (rect.y + rect.height < pageY) {
		const below = keyBelow(m, at);
		if (!below) break;
		rect = rectOf(m, below);
		at = below;
	}
	return at;
}

const collator = () => new Intl.Collator(document.documentElement.lang || undefined, { usage: 'search', sensitivity: 'base' });

function keyForSearch(m: Model, search: string, from: HTMLElement | null): HTMLElement | null {
	const compare = collator();
	let key: HTMLElement | null = from ?? firstKey(m, null);
	if (!key) return null;
	const start = key;
	if (kindOf(key) === 'cell') key = rowOf(key);
	let wrapped = false;
	while (key) {
		if (kindOf(key) === 'item')
			for (const cell of cellsOf(key)) {
				const text = cell.getAttribute('role') === 'rowheader' ? (cell.textContent ?? '') : '';
				if (text && compare.compare(text.slice(0, search.length), search) === 0) return kindOf(start) === 'cell' ? cell : key;
			}
		key = keyBelow(m, key);
		if (!key && !wrapped) {
			key = firstKey(m, null);
			wrapped = true;
		}
	}
	return null;
}

// React Aria's focusable test (isFocusable) and getFocusableTreeWalker over one element.
const FOCUSABLE = ['input:not([disabled]):not([type=hidden])', 'select:not([disabled])', 'textarea:not([disabled])', 'button:not([disabled])', 'a[href]', 'area[href]', 'summary', 'iframe', 'object', 'embed', 'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable^="false"])', 'permission'].join(':not([hidden]),') + ',[tabindex]:not([disabled]):not([hidden])';
const TABBABLE = ['input:not([disabled]):not([type=hidden])', 'select:not([disabled])', 'textarea:not([disabled])', 'button:not([disabled])', 'a[href]', 'area[href]', 'summary', 'iframe', 'object', 'embed', 'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable^="false"])', 'permission', '[tabindex]:not([tabindex="-1"]):not([disabled])'].join(':not([hidden]):not([tabindex="-1"]),');
const visible = (el: Element) => !el.closest('[inert]') && el.checkVisibility({ visibilityProperty: true });
const focusables = (root: Element, tabbable = false) => [...root.querySelectorAll<HTMLElement>('*')].filter((el) => el.matches(tabbable ? TABBABLE : FOCUSABLE) && visible(el));
const within = (el: Element) => el.contains(document.activeElement);

function focusSafely(el: HTMLElement): void {
	el.focus({ preventScroll: true });
}

function scrollIntoView(el: HTMLElement): void {
	if (keyboardModality()) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// useGridCell's focus(): a cell hands focus to its first (or last) focusable child, else takes it.
function focusCell(s: State, cell: HTMLElement): void {
	if (within(cell) && document.activeElement !== cell) return;
	const children = focusables(cell);
	const child = s.childFocusStrategy === 'last' ? children[children.length - 1] : children[0];
	if (child) return focusSafely(child);
	if (!within(cell)) focusSafely(cell);
}

// useSelectableItem's effect: the focused row or cell takes focus while the table has it.
function focusItem(s: State, key: HTMLElement): void {
	if (kindOf(key) === 'item') {
		if (document.activeElement !== key) focusSafely(key);
	} else focusCell(s, key);
}

function setFocusedKey(m: Model, s: State, key: HTMLElement | null, childFocus?: 'first' | 'last'): void {
	const was = s.focusedKey;
	s.focusedKey = key;
	s.childFocusStrategy = childFocus ?? null;
	if (was && was !== key) was.setAttribute('tabindex', '-1');
	if (key) key.setAttribute('tabindex', '0');
	m.table.setAttribute('tabindex', key ? '-1' : '0');
	if (key && s.isFocused) afterRender(s, key);
}

// React Aria moves focus in an effect, once the event that set the focused key has run its course.
function afterRender(s: State, key: HTMLElement): void {
	queueMicrotask(() => {
		if (s.focusedKey !== key || !s.isFocused) return;
		focusItem(s, key);
		scrollIntoView(key);
	});
}

function tableOf(target: Element): HTMLElement | null {
	return target.closest<HTMLElement>(TABLE);
}

export function focusin(target: Element, event: FocusEvent): boolean {
	const table = tableOf(target);
	if (!table || !(target instanceof HTMLElement)) return false;
	const m = model(table);
	const s = stateOf(table);
	const cell = target.closest<HTMLElement>(CELL);
	if (cell && own(table, cell)) {
		if (target !== cell) {
			s.keyWhenFocused.add(cell);
			// Focus that came from the keyboard goes back to the row or cell the table last had, as one tab stop.
			if (!keyboardModality()) setFocusedKey(m, s, cell);
		} else {
			setFocusedKey(m, s, cell);
			if (!(event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)))
				requestAnimationFrame(() => {
					if (document.activeElement === cell) focusCell(s, cell);
				});
		}
	} else if (target.matches('tr[role="row"]') && own(table, target)) setFocusedKey(m, s, target);
	if (s.isFocused) return false;
	s.isFocused = true;
	if (!s.focusedKey) {
		const from = event.relatedTarget;
		const selected = m.rows.filter((r) => r.getAttribute('aria-selected') === 'true');
		const after = from instanceof Node && table.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING;
		const key = after ? (selected[selected.length - 1] ?? lastKey(m, null)) : (selected[0] ?? firstKey(m, null));
		if (key) setFocusedKey(m, s, key);
	} else {
		// Focus coming back to the table goes straight to the row or cell it had; a first key waits for the effect.
		if (!within(s.focusedKey)) focusSafely(s.focusedKey);
		scrollIntoView(s.focusedKey);
	}
	return false;
}

export function focusout(target: Element, event: FocusEvent): boolean {
	const table = tableOf(target);
	if (!table) return false;
	if (!(event.relatedTarget instanceof Node && table.contains(event.relatedTarget))) stateOf(table).isFocused = false;
	return false;
}

const mac = () => /^Mac/i.test(navigator.platform);
// useSelectableCollection's withShiftSel: a key alone, with Shift, with the platform's Control (Alt on a Mac), or both.
const plain = (event: KeyboardEvent) => !event.metaKey && !(mac() ? event.ctrlKey : event.altKey);

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const table = tableOf(target);
	if (!table) return false;
	const m = model(table);
	const s = stateOf(table);
	const active = document.activeElement;
	// useGridCell's onKeyDownCapture: arrows move among a cell's focusable children first, and never reach them.
	const cell = target.closest<HTMLElement>(CELL);
	if (cell && own(table, cell) && active instanceof HTMLElement && cell.contains(active) && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			const left = event.key === 'ArrowLeft';
			const children = focusables(cell);
			const at = active === cell ? -1 : children.indexOf(active);
			const forward = left === m.rtl;
			const next = active === cell ? (forward ? children[0] : undefined) : children[at + (forward ? 1 : -1)];
			event.preventDefault();
			if (next) {
				focusSafely(next);
				scrollIntoView(next);
				return true;
			}
			if (keyRightOf(m, cell, left) === cell) {
				const edge = forward ? children[0] : children[children.length - 1];
				if (edge) focusSafely(edge);
				return true;
			}
		} else if (!event.altKey) event.preventDefault();
	}
	// isCtrlKeyPressed: Home and End go to the first or last row's first or last cell with it.
	const ctrl = mac() ? event.metaKey : event.ctrlKey;
	const handled = (() => {
		if (!plain(event)) return false;
		const key = s.focusedKey;
		switch (event.key) {
			case 'ArrowDown': {
				const next = key ? keyBelow(m, key) : firstKey(m, null);
				if (!next) return false;
				setFocusedKey(m, s, next);
				return true;
			}
			case 'ArrowUp': {
				const next = key ? keyAbove(m, key) : lastKey(m, null);
				if (!next) return false;
				setFocusedKey(m, s, next);
				return true;
			}
			case 'ArrowLeft':
			case 'ArrowRight': {
				const left = event.key === 'ArrowLeft';
				const next = key ? keyRightOf(m, key, left) : firstKey(m, null);
				if (!next) return false;
				setFocusedKey(m, s, next, left !== m.rtl ? 'last' : 'first');
				return true;
			}
			case 'Home':
			case 'End': {
				if (!key && event.shiftKey) return false;
				const next = event.key === 'Home' ? firstKey(m, key, ctrl) : lastKey(m, key, ctrl);
				setFocusedKey(m, s, next);
				return true;
			}
			case 'PageDown':
			case 'PageUp': {
				if (!key) return false;
				const next = event.key === 'PageDown' ? keyPageBelow(m, key) : keyPageAbove(m, key);
				if (!next) return false;
				setFocusedKey(m, s, next);
				return true;
			}
		}
		return false;
	})();
	if (handled) {
		event.preventDefault();
		return true;
	}
	if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
		// Tab leaves from the table's last tabbable element; Shift+Tab from the table itself.
		if (event.shiftKey) table.focus();
		else {
			const tabbable = focusables(table, true);
			const last = tabbable[tabbable.length - 1];
			if (last && (!within(last) || (active instanceof Element && !active.matches(TABBABLE)))) focusSafely(last);
		}
		return false;
	}
	return typeSelect(m, s, event);
}

// useTypeSelect: typed characters within a second of each other move focus to the row whose row header starts with them.
function typeSelect(m: Model, s: State, event: KeyboardEvent): boolean {
	const character = event.key.length === 1 || !/^[A-Z]/i.test(event.key) ? event.key : '';
	if (!character || event.ctrlKey || event.metaKey || event.altKey || (s.search.length === 0 && character === ' ')) return false;
	s.search += character;
	const key = keyForSearch(m, s.search, s.focusedKey) ?? keyForSearch(m, s.search, null);
	clearTimeout(s.searchTimeout);
	if (!key) {
		s.search = '';
		return false;
	}
	setFocusedKey(m, s, key);
	event.preventDefault();
	s.searchTimeout = setTimeout(() => (s.search = ''), 1000);
	return true;
}
