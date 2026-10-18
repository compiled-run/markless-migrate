// Header cell views for AG Grid's header row: classes, aria, sort indicators and filter button per column.
import {
	layoutWidths,
	lefts,
	parseNumbers,
	shownCols,
	shownWidths,
	sortIndexOf,
	sortOf,
	textActive,
} from './model.ts';
import type { ColDef } from './model.ts';

export type HeaderView = {
	readonly colId: string;
	readonly name: string;
	readonly cls: string;
	readonly style: string;
	readonly ariaIndex: number;
	readonly ariaSort: string;
	readonly labelCls: string;
	readonly filterButton: boolean;
	readonly filterButtonCls: string;
	readonly resizeCls: string;
	readonly resizeHidden: string;
	readonly order: string;
	readonly orderCls: string;
	readonly ascCls: string;
	readonly descCls: string;
	readonly desc: string;
	readonly index: number;
};

const ICON = 'ag-sort-indicator-icon';

export function headerViews(
	cols: readonly ColDef[],
	widthsText: string,
	sort: string,
	sortTouched: boolean,
	channel: string,
	args: string,
	direction: string,
	active: string,
): HeaderView[] {
	const widths = parseNumbers(widthsText);
	const left = lefts(widthsText);
	const sortCount = sort ? sort.split(',').length : 0;
	return cols.map((col, i) => {
		const s = sortOf(sort, col.colId);
		const filtered =
			col.colId === 'channel'
				? textActive(channel)
				: col.colId === 'args'
					? textActive(args)
					: col.colId === 'direction'
						? direction !== ''
						: false;
		const cls = [
			'ag-header-cell',
			i === 0 ? 'ag-column-first' : '',
			i === cols.length - 1 ? 'ag-column-last' : '',
			'ag-header-parent-hidden',
			'ag-header-cell-sortable',
			col.headerClass,
			'ag-focus-managed',
			filtered ? 'ag-header-cell-filtered' : '',
			active === col.colId ? 'ag-header-active' : '',
		]
			.filter(Boolean)
			.join(' ');
		const labelCls = [
			'ag-cell-label-container',
			s === 'asc'
				? 'ag-header-cell-sorted-asc'
				: s === 'desc'
					? 'ag-header-cell-sorted-desc'
					: sortTouched
						? 'ag-header-cell-sorted-none'
						: '',
		]
			.filter(Boolean)
			.join(' ');
		const order = sortIndexOf(sort, col.colId);
		return {
			colId: col.colId,
			name: col.headerName,
			cls,
			style: `top: 0px; height: 25px; width: ${widths[i]}px; left: ${left[i]}px;`,
			ariaIndex: i + 1,
			ariaSort: s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : 'none',
			labelCls,
			filterButton: col.filter !== 'none',
			filterButtonCls: `ag-header-icon ag-header-cell-filter-button${filtered ? ' ag-filter-active' : ''}`,
			resizeCls: col.resizable ? 'ag-header-cell-resize' : 'ag-header-cell-resize ag-hidden',
			resizeHidden: col.resizable ? 'false' : 'true',
			order: sortCount > 1 ? order : '',
			orderCls:
				sortCount > 1 && order
					? `${ICON} ag-sort-order`
					: `${ICON} ag-sort-order ag-hidden`,
			ascCls:
				s === 'asc'
					? `${ICON} ag-sort-ascending-icon`
					: `${ICON} ag-sort-ascending-icon ag-hidden`,
			descCls:
				s === 'desc'
					? `${ICON} ag-sort-descending-icon`
					: `${ICON} ag-sort-descending-icon ag-hidden`,
			desc: headerDescription(col, filtered),
			index: i,
		};
	});
}

/** HeaderCellCtrl.announceAriaDescription for a sortable column, with or without a filter. */
export function headerDescription(col: ColDef | undefined, filtered: boolean): string {
	if (!col) return '';
	const parts = new Map<string, string>([['sort', 'Press ENTER to sort']]);
	if (col.filter !== 'none') parts.set('filterButton', 'Press CTRL ENTER to open filter');
	if (filtered) parts.set('filter', 'Column Filtered');
	return Array.from(parts.keys())
		.sort((a, b) => (a === 'filter' ? -1 : b.charCodeAt(0) - a.charCodeAt(0)))
		.map((k) => parts.get(k))
		.join('. ');
}

export function headerView(
	colId: string,
	cols: readonly ColDef[] | undefined,
	order: string,
	hidden: string,
	baseWidths: string,
	flexes: string,
	total: number,
	sort: string,
	sortTouched: boolean,
	channel: string,
	args: string,
	direction: string,
	active: string,
	moving: string,
): HeaderView {
	const list = shownCols(cols, order, hidden);
	const views = headerViews(
		list,
		shownWidths(cols, order, hidden, baseWidths, flexes, total),
		sort,
		sortTouched,
		channel,
		args,
		direction,
		active,
	);
	const view = views.find((v) => v.colId === colId);
	if (!view)
		return {
			...headerViews(
				cols ?? [],
				layoutWidths(cols ?? [], '', '', total),
				'',
				false,
				'',
				'',
				'',
				'',
			).find((v) => v.colId === colId)!,
			style: 'display: none;',
		};
	return moving === colId ? { ...view, cls: `${view.cls} ag-header-cell-moving` } : view;
}
