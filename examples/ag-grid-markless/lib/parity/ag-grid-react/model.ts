// The client-side row model, column layout and filters of AG Grid Community 34.2 for exactly the options
// Devtron's panel passes: sortable/resizable defaults, two flex columns, text filters, one custom filter,
// single row selection, rowHeight 29, headerHeight 25, rowBuffer 10, getRowId by serial number.

export type Direction = 'renderer-to-main' | 'main-to-renderer' | 'service-worker-to-main' | 'main-to-service-worker' | 'renderer' | 'main';

export type Row = {
	readonly serialNumber: number;
	readonly timestamp: number;
	readonly direction: Direction;
	readonly channel: string;
	readonly args: unknown[];
	readonly method?: string;
	readonly responseTime?: number;
	readonly uuid?: string;
	readonly serviceWorkerDetails?: { serviceWorkerVersionId: number; serviceWorkerScope: string };
	readonly gotoSerialNumber?: number;
};

export type FilterKind = 'text' | 'direction' | 'none';

export type ColDef = {
	readonly colId: keyof Row & string;
	readonly headerName: string;
	readonly width?: number;
	readonly flex?: number;
	readonly cellClass: string;
	readonly headerClass: string;
	readonly filter: FilterKind;
	readonly resizable: boolean;
};

export const ROW_HEIGHT = 29;
export const HEADER_HEIGHT = 25;
const ROW_BUFFER = 10;
export const MIN_WIDTH = 36;

// Column state is kept as plain strings in the component (widths "55,100,91,259,775", flexes "0,0,0,1,3").
export function parseNumbers(text: string): number[] {
	return text === '' ? [] : text.split(',').map(Number);
}

export function initialWidths(cols: readonly ColDef[]): string {
	return cols.map((c) => c.width ?? 200).join(',');
}

export function initialFlexes(cols: readonly ColDef[]): string {
	return cols.map((c) => c.flex ?? 0).join(',');
}

/** colFlex.refreshFlexedColumns: the flexed columns after `after` share what the others leave of `total`. */
export function flexWidths(widthsText: string, flexText: string, total: number, after = -1): string {
	const widths = parseNumbers(widthsText);
	const flexes = parseNumbers(flexText);
	if (!total) return widthsText;
	const items = widths.map((w, i) => ({ flex: flexes[i] ?? 0, isFlex: (flexes[i] ?? 0) > 0 && i > after, size: w, frozen: null as number | null, target: 0, violation: '' }));
	if (!items.some((i) => i.isFlex)) return widthsText;
	let unfrozenCount = items.length;
	let unfrozenFlex = items.reduce((a, i) => a + i.flex, 0);
	let unfrozenSpace = total;
	const freeze = (item: (typeof items)[number], width: number) => {
		item.frozen = width;
		unfrozenSpace -= width;
		unfrozenFlex -= item.flex;
		unfrozenCount -= 1;
	};
	for (const item of items) if (!item.isFlex) freeze(item, item.size);
	while (unfrozenCount > 0) {
		const spaceToFill = Math.round(unfrozenFlex < 1 ? unfrozenSpace * unfrozenFlex : unfrozenSpace);
		let last: (typeof items)[number] | undefined;
		let actualLeft = 0;
		let idealRight = 0;
		for (const item of items) {
			if (item.frozen != null) continue;
			last = item;
			idealRight += spaceToFill * (item.flex / unfrozenFlex);
			const rounded = Math.round(idealRight - actualLeft);
			item.target = rounded;
			actualLeft += rounded;
		}
		if (last) last.target += spaceToFill - actualLeft;
		let violation = 0;
		for (const item of items) {
			if (item.frozen != null) continue;
			const clamped = Math.max(item.target, MIN_WIDTH);
			violation += clamped - item.target;
			item.violation = clamped === item.target ? '' : 'min';
			item.target = clamped;
		}
		for (const item of items) {
			if (item.frozen != null) continue;
			if (violation === 0 || item.violation === 'min') freeze(item, item.target);
		}
	}
	return items.map((i) => i.frozen ?? i.size).join(',');
}

/** Dragging a header's resize bar: the column takes its new width and the flexed columns after it absorb the rest. */
export function resizeColumn(widthsText: string, flexText: string, total: number, index: number, width: number): { widths: string; flexes: string } {
	const widths = parseNumbers(widthsText);
	const flexes = parseNumbers(flexText);
	widths[index] = Math.max(MIN_WIDTH, Math.round(width));
	const anyFlexAfter = flexes.some((f, i) => f > 0 && i > index);
	if ((flexes[index] ?? 0) > 0 && anyFlexAfter) flexes[index] = 0;
	const next = widths.join(',');
	return { widths: anyFlexAfter ? flexWidths(next, flexes.join(','), total, index) : next, flexes: flexes.join(',') };
}

export type SortItem = { colId: string; sort: 'asc' | 'desc' };

// Sort model as "channel:asc,timestamp:desc", in sort-index order.
export function parseSort(text: string): SortItem[] {
	if (!text) return [];
	return text.split(',').map((part) => {
		const [colId, sort] = part.split(':');
		return { colId: colId!, sort: sort === 'desc' ? 'desc' : 'asc' };
	});
}

export function nextSort(text: string, colId: string, multi: boolean): string {
	const items = parseSort(text);
	const current = items.find((i) => i.colId === colId)?.sort ?? null;
	const next = current === null ? 'asc' : current === 'asc' ? 'desc' : null;
	const others = multi ? items.filter((i) => i.colId !== colId) : [];
	const all = next ? [...others, { colId, sort: next }] : others;
	return all.map((i) => `${i.colId}:${i.sort}`).join(',');
}

export function sortOf(text: string, colId: string): 'asc' | 'desc' | '' {
	return parseSort(text).find((i) => i.colId === colId)?.sort ?? '';
}

export function sortIndexOf(text: string, colId: string): string {
	const items = parseSort(text);
	if (items.length < 2) return '';
	const at = items.findIndex((i) => i.colId === colId);
	return at < 0 ? '' : String(at + 1);
}

function compare(a: unknown, b: unknown): number {
	const aMissing = a == null;
	const bMissing = b == null;
	if (aMissing && bMissing) return 0;
	if (aMissing) return -1;
	if (bMissing) return 1;
	return (a as number) > (b as number) ? 1 : (a as number) < (b as number) ? -1 : 0;
}

// Text filter model, one per filtered column: "type|filter|join|type|filter" (join is AND or OR).
export const TEXT_OPTIONS = [
	['contains', 'Contains'],
	['notContains', 'Does not contain'],
	['equals', 'Equals'],
	['notEqual', 'Does not equal'],
	['startsWith', 'Begins with'],
	['endsWith', 'Ends with'],
	['blank', 'Blank'],
	['notBlank', 'Not blank'],
] as const;

export type TextCondition = { type: string; filter: string };
export type TextModel = { conditions: TextCondition[]; join: 'AND' | 'OR' };

export function parseText(text: string): TextModel {
	const [t1 = 'contains', f1 = '', join = 'AND', t2 = 'contains', f2 = ''] = text ? text.split('\u0001') : [];
	return { conditions: [{ type: t1, filter: f1 }, { type: t2, filter: f2 }], join: join === 'OR' ? 'OR' : 'AND' };
}

export function writeText(model: TextModel): string {
	const [a, b] = model.conditions;
	return [a!.type, a!.filter, model.join, b!.type, b!.filter].join('\u0001');
}

const needsValue = (type: string) => type !== 'blank' && type !== 'notBlank';
const complete = (c: TextCondition) => !needsValue(c.type) || c.filter !== '';

/** The conditions that are applied: AG Grid applies a condition once it is complete. */
function applied(model: TextModel): TextCondition[] {
	const [a, b] = model.conditions;
	if (!complete(a!)) return [];
	return complete(b!) ? [a!, b!] : [a!];
}

export function textActive(text: string): boolean {
	return applied(parseText(text)).length > 0;
}

/** Whether the second condition (and the AND/OR join) is shown: once the first is complete. */
export function secondShown(text: string): boolean {
	return complete(parseText(text).conditions[0]!);
}

function matches(c: TextCondition, raw: unknown): boolean {
	if (c.type === 'blank') return raw == null || (typeof raw === 'string' && raw.trim().length === 0);
	if (c.type === 'notBlank') return !(raw == null || (typeof raw === 'string' && raw.trim().length === 0));
	if (raw == null) return c.type === 'notEqual' || c.type === 'notContains';
	const value = String(raw).toLowerCase();
	const text = c.filter.toLowerCase();
	switch (c.type) {
		case 'contains':
			return value.indexOf(text) >= 0;
		case 'notContains':
			return value.indexOf(text) < 0;
		case 'equals':
			return value === text;
		case 'notEqual':
			return value != text;
		case 'startsWith':
			return value.indexOf(text) === 0;
		case 'endsWith': {
			const at = value.lastIndexOf(text);
			return at >= 0 && at === value.length - text.length;
		}
		default:
			return false;
	}
}

function textPasses(model: TextModel, raw: unknown): boolean {
	const list = applied(model);
	if (list.length === 0) return true;
	if (list.length === 1) return matches(list[0]!, raw);
	return model.join === 'OR' ? list.some((c) => matches(c, raw)) : list.every((c) => matches(c, raw));
}

export type FilterState = { readonly channel: string; readonly args: string; readonly direction: string };

/** filterValueGetter for the Data column is JSON.stringify(args); the others filter on the field. */
function filterValue(row: Row, colId: string): unknown {
	return colId === 'args' ? JSON.stringify(row.args) : row[colId as 'channel'];
}

const displayedCache = { rows: null as readonly Row[] | null, sort: '', filters: '', result: [] as Row[] };

/** The rows in display order: the filters applied, then the sort (stable on the order the rows came in). */
export function displayedRows(rows: readonly Row[] | undefined, sort: string, channel: string, args: string, direction: string): Row[] {
	if (!rows) return [];
	const filters = [channel, args, direction].join('\u0002');
	if (displayedCache.rows === rows && displayedCache.sort === sort && displayedCache.filters === filters) return displayedCache.result;
	const channelModel = parseText(channel);
	const argsModel = parseText(args);
	const directions = direction ? direction.split(',') : [];
	let out = rows.filter((row) => {
		if (directions.length && !directions.includes(row.direction)) return false;
		if (!textPasses(channelModel, filterValue(row, 'channel'))) return false;
		return textPasses(argsModel, filterValue(row, 'args'));
	});
	const items = parseSort(sort);
	if (items.length) {
		const indexed = out.map((row, at) => ({ row, at }));
		indexed.sort((x, y) => {
			for (const item of items) {
				const result = compare(x.row[item.colId as 'channel'], y.row[item.colId as 'channel']);
				if (!isNaN(result) && result !== 0) return item.sort === 'asc' ? result : -result;
			}
			return x.at - y.at;
		});
		out = indexed.map((i) => i.row);
	}
	displayedCache.rows = rows;
	displayedCache.sort = sort;
	displayedCache.filters = filters;
	displayedCache.result = out;
	return out;
}

/** rowRenderer.workOutFirstAndLastRowsToRender for uniform row heights. */
export function renderRange(count: number, top: number, height: number): { first: number; last: number } {
	if (count === 0) return { first: 0, last: -1 };
	const buffer = ROW_BUFFER * ROW_HEIGHT;
	const pageLast = count * ROW_HEIGHT - 1;
	const firstPixel = Math.max(top - buffer, 0);
	const lastPixel = Math.min(top + height + buffer, pageLast);
	const at = (pixel: number) => Math.min(count - 1, Math.max(0, Math.floor(pixel / ROW_HEIGHT)));
	return { first: at(firstPixel), last: at(lastPixel) };
}

export type DirectionInfo = { readonly cls: string; readonly title: string; readonly left: string; readonly right: string; readonly arrow: boolean; readonly arrowStyle: string };

const BADGE = 'flex items-center overflow-hidden justify-center w-full px-2 py-0.5 rounded-sm text-xs font-medium border';

export function directionInfo(direction: string): DirectionInfo {
	switch (direction) {
		case 'renderer-to-main':
			return { cls: `${BADGE} dark:bg-dark-blue dark:text-light-blue bg-blue-100 text-blue-800 border-blue-300 dark:border-light-blue`, title: 'Renderer to Main', left: 'R', right: 'Main', arrow: true, arrowStyle: '' };
		case 'main-to-renderer':
			return { cls: `${BADGE} dark:bg-dark-green dark:text-light-green bg-green-100 text-green-800 border-green-300 dark:border-light-green`, title: 'Main to Renderer', left: 'Main', right: 'R', arrow: true, arrowStyle: '' };
		case 'service-worker-to-main':
			return { cls: `${BADGE} dark:bg-dark-yellow dark:text-light-yellow bg-yellow-100 text-yellow-800 border-yellow-300 dark:border-light-yellow`, title: 'Service Worker to Main', left: 'SW', right: 'Main', arrow: true, arrowStyle: '' };
		case 'main-to-service-worker':
			return { cls: `${BADGE} dark:bg-dark-orange dark:text-light-orange bg-orange-100 text-orange-800 border-orange-300 dark:border-light-orange`, title: 'Main to Service Worker', left: 'Main', right: 'SW', arrow: true, arrowStyle: '' };
		case 'renderer':
			return { cls: `${BADGE} dark:bg-dark-purple dark:text-light-purple bg-purple-100 text-purple-800 border-purple-300 dark:border-light-purple`, title: 'Renderer', left: 'Renderer', right: '', arrow: false, arrowStyle: 'display: none;' };
		case 'main':
			return { cls: `${BADGE} dark:bg-dark-purple dark:text-light-purple bg-purple-100 text-purple-800 border-purple-300 dark:border-light-purple`, title: 'Main', left: 'Main', right: '', arrow: false, arrowStyle: 'display: none;' };
		default:
			return { cls: `${BADGE} dark:bg-charcoal-500 dark:text-charcoal-100 bg-gray-100 text-gray-800 border-gray-400 dark:border-charcoal-200`, title: 'Unknown direction', left: '', right: '', arrow: true, arrowStyle: '' };
	}
}

export const ALL_DIRECTIONS: readonly Direction[] = ['renderer-to-main', 'main-to-renderer', 'service-worker-to-main', 'main-to-service-worker', 'renderer', 'main'];

export function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString() + '.' + date.getMilliseconds().toString().padStart(3, '0');
}

export type CellView = { readonly style: string; readonly cls: string };

export type RowView = {
	readonly id: string;
	readonly serial: number;
	readonly index: number;
	readonly ariaIndex: number;
	readonly cls: string;
	readonly selected: string;
	readonly style: string;
	readonly c0: CellView;
	readonly c1: CellView;
	readonly c2: CellView;
	readonly c3: CellView;
	readonly c4: CellView;
	readonly time: string;
	readonly dir: DirectionInfo;
	readonly channel: string;
	readonly response: boolean;
	readonly noResponse: boolean;
	readonly preview: string;
};

const CELL = 'ag-cell ag-cell-not-inline-editing ag-cell-normal-height';
let domOrder: number[] = [];

export function cellClasses(cols: readonly ColDef[]): string[] {
	return cols.map((c, i) => [CELL, i === 0 ? 'ag-column-first' : '', i === cols.length - 1 ? 'ag-column-last' : '', c.cellClass, 'ag-cell-value'].filter(Boolean).join(' '));
}

export function lefts(widthsText: string): number[] {
	const widths = parseNumbers(widthsText);
	let left = 0;
	return widths.map((w) => {
		const at = left;
		left += w;
		return at;
	});
}

export function preview(args: unknown): string {
	const json = JSON.stringify(args);
	return json.length > 120 ? json.slice(0, 120) + '...' : json;
}

/** The rows AG Grid has in the DOM: the render range, plus the focused row wherever it is. */
export function rowWindow(rows: readonly Row[], cols: readonly ColDef[] | undefined, order: readonly string[], widthsText: string, top: number, height: number, selected: number, focused: number, hovered: number): RowView[] {
	if (!cols) return [];
	const { first, last } = renderRange(rows.length, top, height);
	const widths = parseNumbers(widthsText);
	const left = lefts(widthsText);
	const classes = cellClasses(cols);
	const at = (colId: string) => {
		const i = order.indexOf(colId);
		return { style: `left: ${left[i] ?? 0}px; width: ${widths[i] ?? 0}px;`, cls: classes[i] ?? CELL };
	};
	const c = [at('serialNumber'), at('timestamp'), at('direction'), at('channel'), at('args')];
	const wanted = new Map<number, number>();
	for (let i = first; i <= last; i++) wanted.set(rows[i]!.serialNumber, i);
	const focusedIndex = focused > 0 ? rows.findIndex((r) => r.serialNumber === focused) : -1;
	if (focusedIndex >= 0) wanted.set(focused, focusedIndex);
	// AG Grid keeps a row element while its row stays in range and appends new ones, so rows already in the DOM
	// keep their place (and a focused row keeps focus) instead of being moved into index order.
	const indexes: number[] = [];
	for (const serial of domOrder) {
		const at = wanted.get(serial);
		if (at === undefined) continue;
		indexes.push(at);
		wanted.delete(serial);
	}
	for (const at of wanted.values()) indexes.push(at);
	domOrder = indexes.map((i) => rows[i]!.serialNumber);
	return indexes.map((index) => {
		const row = rows[index]!;
		const isSelected = row.serialNumber === selected;
		const isFocused = row.serialNumber === focused;
		const cls = [index % 2 === 0 ? 'ag-row-even' : 'ag-row-odd', isFocused ? '' : 'ag-row-no-focus', 'ag-row', 'ag-row-level-0', 'ag-row-position-absolute', index === 0 ? 'ag-row-first' : '', index === rows.length - 1 ? 'ag-row-last' : '', 'ag-after-created', row.serialNumber === hovered ? 'ag-row-hover' : '', isFocused ? 'ag-row-focus' : '', isSelected ? 'ag-row-selected' : ''].filter(Boolean).join(' ');
		return {
			id: String(row.serialNumber),
			serial: row.serialNumber,
			index,
			ariaIndex: index + 2,
			cls,
			selected: isSelected ? 'true' : 'false',
			style: `transform: translateY(${index * ROW_HEIGHT}px); height: ${ROW_HEIGHT}px;`,
			c0: c[0]!,
			c1: c[1]!,
			c2: c[2]!,
			c3: c[3]!,
			c4: c[4]!,
			time: formatTimestamp(row.timestamp),
			dir: directionInfo(row.direction),
			channel: row.channel,
			response: !!row.responseTime,
			noResponse: !row.responseTime,
			preview: preview(row.args),
		};
	});
}

/** Panel.tsx's port messages: the events in, with request/response pairs linked through their uuid. */
export function linkEvents(prev: readonly Row[], incoming: readonly Row[], uuids: Map<string, number>, max: number): Row[] {
	let updated = prev.slice();
	for (const event of incoming) {
		updated.push(event);
		if (updated.length > max) updated = updated.slice(-max);
		if (event.uuid && uuids.has(event.uuid)) {
			const oldSerial = uuids.get(event.uuid)!;
			if (oldSerial >= updated[0]!.serialNumber && oldSerial < updated[updated.length - 1]!.serialNumber) {
				const offset = updated[0]!.serialNumber;
				const oldIndex = oldSerial - offset;
				updated[oldIndex] = { ...updated[oldIndex]!, gotoSerialNumber: event.serialNumber };
				updated[updated.length - 1] = { ...updated[updated.length - 1]!, gotoSerialNumber: oldSerial };
			}
			uuids.delete(event.uuid);
		} else if (event.uuid) uuids.set(event.uuid, event.serialNumber);
	}
	return updated;
}

export function withFilterValue(text: string, index: number, value: string): string {
	const model = parseText(text);
	model.conditions[index]!.filter = value;
	return writeText(model);
}

export function withFilterType(text: string, index: number, type: string): string {
	const model = parseText(text);
	model.conditions[index]!.type = type;
	return writeText(model);
}

export function withJoin(text: string, join: 'AND' | 'OR'): string {
	const model = parseText(text);
	model.join = join;
	return writeText(model);
}

export function toggleDirection(list: string, direction: string): string {
	const items = list ? list.split(',') : [];
	return (items.includes(direction) ? items.filter((d) => d !== direction) : [...items, direction]).join(',');
}

export function optionLabel(type: string): string {
	return TEXT_OPTIONS.find((o) => o[0] === type)?.[1] ?? 'Contains';
}

export function optionIndex(type: string): number {
	return Math.max(0, TEXT_OPTIONS.findIndex((o) => o[0] === type));
}

// One call per computed in the component: a Markless computed that reads another computed can see it undefined
// after resume, so each view is worked out from state and props alone, with the costly steps cached here.
export function layoutWidths(cols: readonly ColDef[] | undefined, baseWidths: string, flexes: string, total: number): string {
	if (!cols) return '';
	return flexWidths(baseWidths || initialWidths(cols), flexes || initialFlexes(cols), total || 1280, -1);
}

export function layoutFlexes(cols: readonly ColDef[] | undefined, flexes: string): string {
	return flexes || (cols ? initialFlexes(cols) : '');
}

export function totalWidthOf(cols: readonly ColDef[] | undefined, baseWidths: string, flexes: string, total: number): number {
	return parseNumbers(layoutWidths(cols, baseWidths, flexes, total)).reduce((a, b) => a + b, 0);
}

export function windowView(rows: readonly Row[] | undefined, sort: string, channel: string, args: string, direction: string, cols: readonly ColDef[] | undefined, baseWidths: string, flexes: string, total: number, top: number, height: number, selected: number, focused: number, hovered: number): RowView[] {
	if (!cols) return [];
	const shown = displayedRows(rows, sort, channel, args, direction);
	return rowWindow(shown, cols, cols.map((c) => c.colId), layoutWidths(cols, baseWidths, flexes, total), top, height, selected, focused, hovered);
}

export function countOf(rows: readonly Row[] | undefined, sort: string, channel: string, args: string, direction: string): number {
	return displayedRows(rows, sort, channel, args, direction).length;
}

export const blankType = (type: string) => type === 'blank' || type === 'notBlank';

export function pickerView(draft: string, picker: number, active: number): { key: string; label: string; pos: number; cls: string; selected: string }[] {
	const model = parseText(draft);
	const current = model.conditions[picker === 1 ? 1 : 0]!.type;
	return TEXT_OPTIONS.map(([key, label], i) => ({ key, label, pos: i + 1, cls: i === active ? 'ag-list-item ag-select-list-item ag-active-item' : 'ag-list-item ag-select-list-item', selected: current === key ? 'true' : 'false' }));
}

export type DirectionOptionView = { readonly dir: string; readonly box: string; readonly checkStyle: string; readonly info: DirectionInfo };

export function directionOptions(selected: string): DirectionOptionView[] {
	const list = selected ? selected.split(',') : [];
	return ALL_DIRECTIONS.map((dir) => {
		const on = list.includes(dir);
		return {
			dir,
			box: `flex h-5 w-5 items-center justify-center rounded-sm border-2 transition-all duration-150 ${on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 hover:border-gray-400 dark:border-charcoal-300'} `,
			checkStyle: on ? '' : 'display: none;',
			info: directionInfo(dir),
		};
	});
}
