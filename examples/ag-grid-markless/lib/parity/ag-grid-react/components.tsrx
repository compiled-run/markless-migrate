// ag-grid-react's AgGridReact for the options Devtron's panel passes: the client-side row model with row
// virtualisation, sorting, two text filters and one custom filter in header popups, single row selection,
// column resizing with flex, and AG Grid's own DOM, classes and ARIA so its stylesheet applies unchanged.
// One component: rows, header cells and filter options written inline, because handlers in a child
// component per row or per column did not reach this component's state after resume (see the log).
import { computed, element, state } from '@markless/core';
import { afterScroll, announce, keepRowFocus, debounceFilter, dragX, firstTime, focusHeader, listUnder, focusWhenShown, onGuardFocus, onHeaderKey, measureScrollbar, popupUnder, rowOf, scrollFromFake, setScrollTop, wasProgrammatic, watchSize } from './api.ts';
import { headerView } from './header.ts';
import { ROW_HEIGHT, blankType, countOf, directionOptions, layoutFlexes, layoutWidths, nextSort, optionIndex, optionLabel, parseNumbers, parseText, pickerView, resizeColumn, secondShown, toggleDirection, totalWidthOf, windowView, withFilterType, withFilterValue, withJoin } from './model.ts';
import type { ColDef, Row } from './model.ts';

const THEME_CLASSES = 'ag-theme-params-1 ag-theme-buttonStyle-1 ag-theme-columnDropStyle-2 ag-theme-batchEditStyle-3 ag-theme-checkboxStyle-4 ag-theme-iconSet-5 ag-theme-tabStyle-6 ag-theme-inputStyle-7';

/** AgGridReact. The panel's gridRef API (getRowNode(id).setSelected) is the `selected` prop and onSelectionChanged;
 * the aria live region's text is `live`, kept by the panel so that clearing the rows can announce too. */
export function AgGridReact({ rowData, columnDefs, onRowClicked, onSelectionChanged, selected, dark, live, onAnnounce }: { rowData: Row[]; columnDefs: ColDef[]; onRowClicked: (serial: number) => void; onSelectionChanged: (serial: number) => void; selected: number; dark: boolean; live: string; onAnnounce: (text: string) => void }) @{
	let g = state({
		sort: '',
		sortTouched: false,
		fChannel: '',
		fArgs: '',
		fDirection: '',
		draft: '',
		openFilter: '',
		popupStyle: '',
		picker: -1,
		pickerActive: 0,
		pickerStyle: '',
		top: 0,
		height: 0,
		total: 0,
		sbw: 16,
		baseWidths: '',
		flexes: '',
		focused: 0,
		hovered: 0,
		activeHeader: '',
		scrolling: false,
	});
	const body = element<HTMLDivElement>();
	const fakeV = element<HTMLDivElement>();
	const directions = computed(() => directionOptions(g.fDirection));
	const widths = computed(() => layoutWidths(columnDefs, g.baseWidths, g.flexes, g.total));
	const flex = computed(() => layoutFlexes(columnDefs, g.flexes));
	const count = computed(() => countOf(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection));
	const win = computed(() => windowView(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection, columnDefs, g.baseWidths, g.flexes, g.total, g.top, g.height, selected, g.focused, g.hovered));
	const h0 = computed(() => headerView(0, columnDefs, g.baseWidths, g.flexes, g.total, g.sort, g.sortTouched, g.fChannel, g.fArgs, g.fDirection, g.activeHeader));
	const h1 = computed(() => headerView(1, columnDefs, g.baseWidths, g.flexes, g.total, g.sort, g.sortTouched, g.fChannel, g.fArgs, g.fDirection, g.activeHeader));
	const h2 = computed(() => headerView(2, columnDefs, g.baseWidths, g.flexes, g.total, g.sort, g.sortTouched, g.fChannel, g.fArgs, g.fDirection, g.activeHeader));
	const h3 = computed(() => headerView(3, columnDefs, g.baseWidths, g.flexes, g.total, g.sort, g.sortTouched, g.fChannel, g.fArgs, g.fDirection, g.activeHeader));
	const h4 = computed(() => headerView(4, columnDefs, g.baseWidths, g.flexes, g.total, g.sort, g.sortTouched, g.fChannel, g.fArgs, g.fDirection, g.activeHeader));
	const widthStyle = computed(() => `width: ${totalWidthOf(columnDefs, g.baseWidths, g.flexes, g.total)}px;`);
	const headerRowStyle = computed(() => `height: 25px; top: 0px; width: ${totalWidthOf(columnDefs, g.baseWidths, g.flexes, g.total)}px;`);
	const pinnedStyle = computed(() => `height: ${Math.max(1, countOf(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection) * ROW_HEIGHT)}px; width: 0px; max-width: 0px; min-width: 0px;`);
	const heightStyle = computed(() => `height: ${Math.max(1, countOf(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection) * ROW_HEIGHT)}px;`);
	const centerStyle = computed(() => `width: ${totalWidthOf(columnDefs, g.baseWidths, g.flexes, g.total)}px; height: ${Math.max(1, countOf(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection) * ROW_HEIGHT)}px;`);
	const fakeContainerStyle = computed(() => `width: 16px; max-width: 16px; min-width: 16px; height: ${Math.max(1, countOf(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection) * ROW_HEIGHT)}px;`);
	const hScrollStyle = computed(() => `width: ${totalWidthOf(columnDefs, g.baseWidths, g.flexes, g.total)}px; height: 16px; max-height: 16px; min-height: 16px;`);
	const rowCount = computed(() => countOf(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection) + 1);
	const wrapperStyle = computed(() => `height: 100%; --ag-internal-row-border-width: ${dark ? 1 : 2}px; --ag-line-height: ${ROW_HEIGHT}px;`);
	const viewportStyle = computed(() => `width: calc(100% + ${g.sbw}px);`);
	const fakeVCls = computed(() => `ag-body-vertical-scroll ag-apple-scrollbar ag-scrollbar-invisible${g.scrolling ? ' ag-scrollbar-scrolling' : ''}${countOf(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection) * ROW_HEIGHT > g.height ? '' : ' ag-hidden'}`);
	const overlayCls = computed(() => ((rowData ?? []).length === 0 ? 'ag-overlay' : 'ag-overlay ag-hidden'));
	const clearStyle = computed(() => (g.fDirection === '' ? 'display: none;' : ''));
	const textPopupCls = computed(() => `${THEME_CLASSES} ag-popup${g.openFilter === 'channel' || g.openFilter === 'args' ? '' : ' ag-hidden'}`);
	const directionPopupCls = computed(() => `${THEME_CLASSES} ag-popup${g.openFilter === 'direction' ? '' : ' ag-hidden'}`);
	const pickerPopupCls = computed(() => `${THEME_CLASSES} ag-popup${g.picker < 0 ? ' ag-hidden' : ''}`);
	const body0Cls = computed(() => (blankType(parseText(g.draft).conditions[0]!.type) ? 'ag-filter-body ag-hidden' : 'ag-filter-body'));
	const body1Cls = computed(() => (!secondShown(g.draft) || blankType(parseText(g.draft).conditions[1]!.type) ? 'ag-filter-body ag-hidden' : 'ag-filter-body'));
	const conditionCls = computed(() => (secondShown(g.draft) ? 'ag-filter-condition' : 'ag-filter-condition ag-hidden'));
	const picker1FieldCls = computed(() => (secondShown(g.draft) ? 'ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select' : 'ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select ag-hidden'));
	const overlayTextStyle = computed(() => ((rowData ?? []).length === 0 ? '' : 'display: none;'));
	const rootCls = computed(() => `ag-root ag-unselectable ag-layout-normal${countOf(rowData, g.sort, g.fChannel, g.fArgs, g.fDirection) * ROW_HEIGHT >= g.height && g.height > 0 ? ' ag-body-vertical-content-no-gap' : ''} ag-body-horizontal-content-no-gap`);
	const textOpen = computed(() => g.openFilter === 'channel' || g.openFilter === 'args');
	const op0 = computed(() => parseText(g.draft).conditions[0]!.type);
	const op1 = computed(() => parseText(g.draft).conditions[1]!.type);
	const label0 = computed(() => optionLabel(parseText(g.draft).conditions[0]!.type));
	const label1 = computed(() => optionLabel(parseText(g.draft).conditions[1]!.type));
	const value0 = computed(() => parseText(g.draft).conditions[0]!.filter);
	const value1 = computed(() => parseText(g.draft).conditions[1]!.filter);
	const second = computed(() => secondShown(g.draft));
	const isOr = computed(() => parseText(g.draft).join === 'OR');
	const body0Hidden = computed(() => blankType(parseText(g.draft).conditions[0]!.type));
	const body1Hidden = computed(() => !secondShown(g.draft) || blankType(parseText(g.draft).conditions[1]!.type));
	const picker0Cls = computed(() => (g.picker === 0 ? 'ag-wrapper ag-picker-field-wrapper ag-picker-expanded' : 'ag-wrapper ag-picker-field-wrapper ag-picker-collapsed'));
	const picker1Cls = computed(() => (g.picker === 1 ? 'ag-wrapper ag-picker-field-wrapper ag-picker-expanded' : 'ag-wrapper ag-picker-field-wrapper ag-picker-collapsed'));
	const andCls = computed(() => (parseText(g.draft).join === 'OR' ? 'ag-wrapper ag-input-wrapper ag-radio-button-input-wrapper' : 'ag-wrapper ag-input-wrapper ag-radio-button-input-wrapper ag-checked'));
	const orCls = computed(() => (parseText(g.draft).join === 'OR' ? 'ag-wrapper ag-input-wrapper ag-radio-button-input-wrapper ag-checked' : 'ag-wrapper ag-input-wrapper ag-radio-button-input-wrapper'));
	const pickerOptions = computed(() => pickerView(g.draft, g.picker, g.pickerActive));

	<div class={THEME_CLASSES + ' ag-theme-columnDropStyle-2'} style={wrapperStyle} onIdle={() => {
		if (!firstTime('grid')) return;
		const bar = measureScrollbar();
		g.sbw = bar.width + (bar.invisible ? 16 : 0);
		const lost = bar.invisible ? 0 : bar.width;
		keepRowFocus(document.querySelector<HTMLElement>('.ag-center-cols-container'));
		watchSize(body, (width, height) => {
			g.total = width - lost;
			g.height = height;
		});
	}}>
		<div class="ag-measurement-container">
			<div style="width: var(--ag-row-height, 15538px);"></div>
			<div style="width: var(--ag-header-height, 15538px);"></div>
			<div style="width: var(--ag-list-item-height, 15538px);"></div>
			<div class="ag-measurement-element-border" style="--ag-internal-measurement-border: var(--ag-row-border, solid 15538px);"></div>
			<div class="ag-measurement-element-border" style="--ag-internal-measurement-border: var(--ag-pinned-row-border, solid 15538px);"></div>
		</div>
		<div class="ag-aria-description-container" aria-live="polite" aria-relevant="additions text" aria-atomic="true">{live}</div>
		<div class="ag-root-wrapper ag-ltr ag-layout-normal" role="presentation" grid-id="1">
			<div class="ag-root-wrapper-body ag-focus-managed ag-layout-normal" role="presentation">
				<div class="ag-tab-guard ag-tab-guard-top" role="presentation" tabindex="0" onFocus={(e) => onGuardFocus(e, true)}></div>
				<div class={rootCls} role="grid" aria-colcount="5" aria-rowcount={rowCount}>
					<div class="ag-header ag-pivot-off ag-header-allow-overflow" role="presentation" style="height: 26px; min-height: 26px;">
						<div class="ag-pinned-left-header ag-hidden" aria-hidden="true" role="rowgroup" style="width: 0px; min-width: 0px; max-width: 0px;"></div>
						<div class="ag-header-viewport " role="rowgroup" tabindex="-1">
							<div class="ag-header-container" role="presentation" style={widthStyle}>
								<div class="ag-header-row ag-header-row-column" role="row" tabindex="0" aria-rowindex="1" style={headerRowStyle}>
				<div class={h0.cls} role="columnheader" col-id="serialNumber" aria-colindex="1" tabindex="-1" aria-sort={h0.ariaSort} style={h0.style} onFocus={() => announce(h0.desc, (text) => onAnnounce(text))} onMouseEnter={() => (g.activeHeader = 'serialNumber')} onMouseLeave={() => (g.activeHeader = '')} onKeyDown={(e) => {
					if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'Enter') e.preventDefault();
					if (onHeaderKey(e)) return;
					if (e.key !== 'Enter') return;
					g.sort = nextSort(g.sort, 'serialNumber', e.shiftKey);
					g.sortTouched = true;
				}}>
					<div class={h0.resizeCls} role="presentation" aria-hidden={h0.resizeHidden} onPointerDown={(e) => {
						const fromWidths = layoutWidths(columnDefs, g.baseWidths, g.flexes, g.total);
						const fromFlexes = layoutFlexes(columnDefs, g.flexes);
						const total = g.total;
						const start = parseNumbers(fromWidths)[0] ?? 0;
						dragX(e, (dx) => {
							const next = resizeColumn(fromWidths, fromFlexes, total, 0, start + dx);
							g.baseWidths = next.widths;
							g.flexes = next.flexes;
						});
					}}></div>
					<div class="ag-header-cell-comp-wrapper" role="presentation">
					<div class={h0.labelCls} role="presentation">
						<div class="ag-header-cell-label" data-ref="eLabel" role="presentation" onClick={(e) => {
							g.sort = nextSort(g.sort, 'serialNumber', e.shiftKey);
							g.sortTouched = true;
						}}>
							<span class="ag-header-cell-text" data-ref="eText">{h0.name}</span>
							<span class="ag-header-icon ag-header-label-icon ag-filter-icon ag-hidden" data-ref="eFilter" aria-hidden="true"><span class="ag-icon ag-icon-filter" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-container" data-ref="eSortIndicator">
							<span class={h0.orderCls} data-ref="eSortOrder" aria-hidden="true">{h0.order}</span>
							<span class={h0.ascCls} data-ref="eSortAsc" aria-hidden="true"><span class="ag-icon ag-icon-asc" role="presentation" unselectable="on"></span></span>
							<span class={h0.descCls} data-ref="eSortDesc" aria-hidden="true"><span class="ag-icon ag-icon-desc" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-mixed-icon ag-hidden" data-ref="eSortMixed" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-none-icon ag-hidden" data-ref="eSortNone" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
						</span>
						</div>
					</div>
					</div>
				</div>
				<div class={h1.cls} role="columnheader" col-id="timestamp" aria-colindex="2" tabindex="-1" aria-sort={h1.ariaSort} style={h1.style} onFocus={() => announce(h1.desc, (text) => onAnnounce(text))} onMouseEnter={() => (g.activeHeader = 'timestamp')} onMouseLeave={() => (g.activeHeader = '')} onKeyDown={(e) => {
					if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'Enter') e.preventDefault();
					if (onHeaderKey(e)) return;
					if (e.key !== 'Enter') return;
					g.sort = nextSort(g.sort, 'timestamp', e.shiftKey);
					g.sortTouched = true;
				}}>
					<div class={h1.resizeCls} role="presentation" aria-hidden={h1.resizeHidden} onPointerDown={(e) => {
						const fromWidths = layoutWidths(columnDefs, g.baseWidths, g.flexes, g.total);
						const fromFlexes = layoutFlexes(columnDefs, g.flexes);
						const total = g.total;
						const start = parseNumbers(fromWidths)[1] ?? 0;
						dragX(e, (dx) => {
							const next = resizeColumn(fromWidths, fromFlexes, total, 1, start + dx);
							g.baseWidths = next.widths;
							g.flexes = next.flexes;
						});
					}}></div>
					<div class="ag-header-cell-comp-wrapper" role="presentation">
					<div class={h1.labelCls} role="presentation">
						<div class="ag-header-cell-label" data-ref="eLabel" role="presentation" onClick={(e) => {
							g.sort = nextSort(g.sort, 'timestamp', e.shiftKey);
							g.sortTouched = true;
						}}>
							<span class="ag-header-cell-text" data-ref="eText">{h1.name}</span>
							<span class="ag-header-icon ag-header-label-icon ag-filter-icon ag-hidden" data-ref="eFilter" aria-hidden="true"><span class="ag-icon ag-icon-filter" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-container" data-ref="eSortIndicator">
							<span class={h1.orderCls} data-ref="eSortOrder" aria-hidden="true">{h1.order}</span>
							<span class={h1.ascCls} data-ref="eSortAsc" aria-hidden="true"><span class="ag-icon ag-icon-asc" role="presentation" unselectable="on"></span></span>
							<span class={h1.descCls} data-ref="eSortDesc" aria-hidden="true"><span class="ag-icon ag-icon-desc" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-mixed-icon ag-hidden" data-ref="eSortMixed" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-none-icon ag-hidden" data-ref="eSortNone" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
						</span>
						</div>
					</div>
					</div>
				</div>
				<div class={h2.cls} role="columnheader" col-id="direction" aria-colindex="3" tabindex="-1" aria-sort={h2.ariaSort} style={h2.style} onFocus={() => announce(h2.desc, (text) => onAnnounce(text))} onMouseEnter={() => (g.activeHeader = 'direction')} onMouseLeave={() => (g.activeHeader = '')} onKeyDown={(e) => {
					if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'Enter') e.preventDefault();
					if (onHeaderKey(e)) return;
					if (e.key !== 'Enter') return;
					g.sort = nextSort(g.sort, 'direction', e.shiftKey);
					g.sortTouched = true;
				}}>
					<div class={h2.resizeCls} role="presentation" aria-hidden={h2.resizeHidden} onPointerDown={(e) => {
						const fromWidths = layoutWidths(columnDefs, g.baseWidths, g.flexes, g.total);
						const fromFlexes = layoutFlexes(columnDefs, g.flexes);
						const total = g.total;
						const start = parseNumbers(fromWidths)[2] ?? 0;
						dragX(e, (dx) => {
							const next = resizeColumn(fromWidths, fromFlexes, total, 2, start + dx);
							g.baseWidths = next.widths;
							g.flexes = next.flexes;
						});
					}}></div>
					<div class="ag-header-cell-comp-wrapper" role="presentation">
					<div class={h2.labelCls} role="presentation">
						<span class={h2.filterButtonCls} data-ref="eFilterButton" aria-hidden="true" onClick={(e) => {
							g.popupStyle = popupUnder(e.target, 0);
							g.draft = '';
							g.picker = -1;
							g.openFilter = g.openFilter === 'direction' ? '' : 'direction';
						}}><span class="ag-icon ag-icon-filter" role="presentation" unselectable="on"></span></span>
						<div class="ag-header-cell-label" data-ref="eLabel" role="presentation" onClick={(e) => {
							g.sort = nextSort(g.sort, 'direction', e.shiftKey);
							g.sortTouched = true;
						}}>
							<span class="ag-header-cell-text" data-ref="eText">{h2.name}</span>
							<span class="ag-sort-indicator-container" data-ref="eSortIndicator">
							<span class={h2.orderCls} data-ref="eSortOrder" aria-hidden="true">{h2.order}</span>
							<span class={h2.ascCls} data-ref="eSortAsc" aria-hidden="true"><span class="ag-icon ag-icon-asc" role="presentation" unselectable="on"></span></span>
							<span class={h2.descCls} data-ref="eSortDesc" aria-hidden="true"><span class="ag-icon ag-icon-desc" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-mixed-icon ag-hidden" data-ref="eSortMixed" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-none-icon ag-hidden" data-ref="eSortNone" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
						</span>
						</div>
					</div>
					</div>
				</div>
				<div class={h3.cls} role="columnheader" col-id="channel" aria-colindex="4" tabindex="-1" aria-sort={h3.ariaSort} style={h3.style} onFocus={() => announce(h3.desc, (text) => onAnnounce(text))} onMouseEnter={() => (g.activeHeader = 'channel')} onMouseLeave={() => (g.activeHeader = '')} onKeyDown={(e) => {
					if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'Enter') e.preventDefault();
					if (onHeaderKey(e)) return;
					if (e.key !== 'Enter') return;
					g.sort = nextSort(g.sort, 'channel', e.shiftKey);
					g.sortTouched = true;
				}}>
					<div class={h3.resizeCls} role="presentation" aria-hidden={h3.resizeHidden} onPointerDown={(e) => {
						const fromWidths = layoutWidths(columnDefs, g.baseWidths, g.flexes, g.total);
						const fromFlexes = layoutFlexes(columnDefs, g.flexes);
						const total = g.total;
						const start = parseNumbers(fromWidths)[3] ?? 0;
						dragX(e, (dx) => {
							const next = resizeColumn(fromWidths, fromFlexes, total, 3, start + dx);
							g.baseWidths = next.widths;
							g.flexes = next.flexes;
						});
					}}></div>
					<div class="ag-header-cell-comp-wrapper" role="presentation">
					<div class={h3.labelCls} role="presentation">
						<span class={h3.filterButtonCls} data-ref="eFilterButton" aria-hidden="true" onClick={(e) => {
							g.popupStyle = popupUnder(e.target, 206);
							g.draft = g.fChannel;
							g.picker = -1;
							g.openFilter = g.openFilter === 'channel' ? '' : 'channel';
							if (g.openFilter) focusWhenShown('.ag-popup[data-filter="text"]', 'input[aria-label="Filter Value"]');
						}}><span class="ag-icon ag-icon-filter" role="presentation" unselectable="on"></span></span>
						<div class="ag-header-cell-label" data-ref="eLabel" role="presentation" onClick={(e) => {
							g.sort = nextSort(g.sort, 'channel', e.shiftKey);
							g.sortTouched = true;
						}}>
							<span class="ag-header-cell-text" data-ref="eText">{h3.name}</span>
							<span class="ag-sort-indicator-container" data-ref="eSortIndicator">
							<span class={h3.orderCls} data-ref="eSortOrder" aria-hidden="true">{h3.order}</span>
							<span class={h3.ascCls} data-ref="eSortAsc" aria-hidden="true"><span class="ag-icon ag-icon-asc" role="presentation" unselectable="on"></span></span>
							<span class={h3.descCls} data-ref="eSortDesc" aria-hidden="true"><span class="ag-icon ag-icon-desc" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-mixed-icon ag-hidden" data-ref="eSortMixed" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-none-icon ag-hidden" data-ref="eSortNone" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
						</span>
						</div>
					</div>
					</div>
				</div>
				<div class={h4.cls} role="columnheader" col-id="args" aria-colindex="5" tabindex="-1" aria-sort={h4.ariaSort} style={h4.style} onFocus={() => announce(h4.desc, (text) => onAnnounce(text))} onMouseEnter={() => (g.activeHeader = 'args')} onMouseLeave={() => (g.activeHeader = '')} onKeyDown={(e) => {
					if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'Enter') e.preventDefault();
					if (onHeaderKey(e)) return;
					if (e.key !== 'Enter') return;
					g.sort = nextSort(g.sort, 'args', e.shiftKey);
					g.sortTouched = true;
				}}>
					<div class={h4.resizeCls} role="presentation" aria-hidden={h4.resizeHidden} onPointerDown={(e) => {
						const fromWidths = layoutWidths(columnDefs, g.baseWidths, g.flexes, g.total);
						const fromFlexes = layoutFlexes(columnDefs, g.flexes);
						const total = g.total;
						const start = parseNumbers(fromWidths)[4] ?? 0;
						dragX(e, (dx) => {
							const next = resizeColumn(fromWidths, fromFlexes, total, 4, start + dx);
							g.baseWidths = next.widths;
							g.flexes = next.flexes;
						});
					}}></div>
					<div class="ag-header-cell-comp-wrapper" role="presentation">
					<div class={h4.labelCls} role="presentation">
						<span class={h4.filterButtonCls} data-ref="eFilterButton" aria-hidden="true" onClick={(e) => {
							g.popupStyle = popupUnder(e.target, 206);
							g.draft = g.fArgs;
							g.picker = -1;
							g.openFilter = g.openFilter === 'args' ? '' : 'args';
							if (g.openFilter) focusWhenShown('.ag-popup[data-filter="text"]', 'input[aria-label="Filter Value"]');
						}}><span class="ag-icon ag-icon-filter" role="presentation" unselectable="on"></span></span>
						<div class="ag-header-cell-label" data-ref="eLabel" role="presentation" onClick={(e) => {
							g.sort = nextSort(g.sort, 'args', e.shiftKey);
							g.sortTouched = true;
						}}>
							<span class="ag-header-cell-text" data-ref="eText">{h4.name}</span>
							<span class="ag-sort-indicator-container" data-ref="eSortIndicator">
							<span class={h4.orderCls} data-ref="eSortOrder" aria-hidden="true">{h4.order}</span>
							<span class={h4.ascCls} data-ref="eSortAsc" aria-hidden="true"><span class="ag-icon ag-icon-asc" role="presentation" unselectable="on"></span></span>
							<span class={h4.descCls} data-ref="eSortDesc" aria-hidden="true"><span class="ag-icon ag-icon-desc" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-mixed-icon ag-hidden" data-ref="eSortMixed" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
							<span class="ag-sort-indicator-icon ag-sort-none-icon ag-hidden" data-ref="eSortNone" aria-hidden="true"><span class="ag-icon ag-icon-none" role="presentation" unselectable="on"></span></span>
						</span>
						</div>
					</div>
					</div>
				</div>
								</div>
							</div>
						</div>
						<div class="ag-pinned-right-header ag-hidden" aria-hidden="true" role="rowgroup" style="width: 0px; min-width: 0px; max-width: 0px;"></div>
					</div>
					<div class="ag-floating-top ag-invisible" role="presentation" style="height: 0px; min-height: 0px; overflow-y: scroll;">
						<div class="ag-pinned-left-floating-top ag-hidden" role="rowgroup" aria-hidden="true" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-viewport ag-floating-top-viewport" role="rowgroup"><div class="ag-floating-top-container" role="presentation" style={widthStyle}></div></div>
						<div class="ag-pinned-right-floating-top ag-hidden" role="rowgroup" aria-hidden="true" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-floating-top-full-width-container" role="rowgroup"></div>
					</div>
					<div class="ag-body ag-layout-normal" role="presentation">
						<div el={body} class="ag-body-viewport ag-row-no-animation ag-layout-normal" role="presentation" style={viewportStyle} onScroll={(e) => {
							g.top = (e.target as HTMLElement).scrollTop;
							setScrollTop(fakeV, g.top);
							if (wasProgrammatic()) return;
							g.scrolling = true;
							afterScroll(() => (g.scrolling = false));
						}}>
							<div class="ag-pinned-left-cols-container ag-hidden" role="rowgroup" style={pinnedStyle} aria-hidden="true"></div>
							<div class="ag-viewport ag-center-cols-viewport" role="rowgroup" style={heightStyle}>
								<div class="ag-center-cols-container" role="presentation" style={centerStyle}>
									@for (const row of win; key row.id) {
										<div role="row" row-index={row.index} row-id={row.id} tabindex="0" class={row.cls} aria-rowindex={row.ariaIndex} aria-selected={row.selected} style={row.style} onMouseEnter={() => (g.hovered = row.serial)} onMouseLeave={() => (g.hovered = 0)} onClick={(e) => {
											const id = row.serial;
											g.focused = id;
											rowOf(e)?.focus();
											const next = (e.ctrlKey || e.metaKey) && selected === id ? 0 : id;
											onSelectionChanged(next);
											announce(next === id ? 'Press SPACE to deselect this row' : 'Press SPACE to select this row', (text) => onAnnounce(text));
											onRowClicked(id);
										}}>
											<div role="gridcell" col-id="serialNumber" class={row.c0.cls} aria-colindex="1" style={row.c0.style}>{row.serial}</div>
											<div role="gridcell" col-id="timestamp" class={row.c1.cls} aria-colindex="2" style={row.c1.style}>{row.time}</div>
											<div role="gridcell" col-id="direction" class={row.c2.cls} aria-colindex="3" style={row.c2.style}><span class={row.dir.cls} title={row.dir.title}>{row.dir.left}<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right mx-0.5 flex-shrink-0" aria-hidden="true" style={row.dir.arrowStyle}><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>{row.dir.right}</span></div>
											<div role="gridcell" col-id="channel" class={row.c3.cls} aria-colindex="4" style={row.c3.style}><div title={row.channel}>{row.channel}<span class="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs dark:bg-charcoal-400" hidden={row.noResponse}>Response</span></div></div>
											<div role="gridcell" col-id="args" class={row.c4.cls} aria-colindex="5" style={row.c4.style}><span class="truncate font-space-mono text-xs">{row.preview}</span></div>
										</div>
									}
								</div>
							</div>
							<div class="ag-pinned-right-cols-container ag-hidden" role="rowgroup" style={pinnedStyle} aria-hidden="true"></div>
							<div class="ag-full-width-container" role="rowgroup" style={heightStyle}></div>
						</div>
						<div class={fakeVCls} aria-hidden="true" style="width: 16px; max-width: 16px; min-width: 16px;">
							<div el={fakeV} class="ag-body-vertical-scroll-viewport" data-ref="eViewport" style="width: 16px; max-width: 16px; min-width: 16px;" onScroll={(e) => scrollFromFake(body, (e.target as HTMLElement).scrollTop)}>
								<div class="ag-body-vertical-scroll-container" data-ref="eContainer" style={fakeContainerStyle}></div>
							</div>
						</div>
					</div>
					<div class="ag-sticky-top" role="presentation" style="height: 0px; top: 26px; width: calc(100% - 0px);">
						<div class="ag-pinned-left-sticky-top ag-hidden" role="rowgroup" aria-hidden="true" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-viewport ag-sticky-top-viewport" role="rowgroup"><div class="ag-sticky-top-container" role="presentation" style={widthStyle}></div></div>
						<div class="ag-pinned-right-sticky-top ag-hidden" role="rowgroup" aria-hidden="true" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-sticky-top-full-width-container" role="rowgroup"></div>
					</div>
					<div class="ag-sticky-bottom ag-invisible" role="presentation" style="height: 0px; bottom: 0px; width: calc(100% - 0px);">
						<div class="ag-pinned-left-sticky-bottom ag-hidden" role="rowgroup" aria-hidden="true" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-viewport ag-sticky-bottom-viewport" role="rowgroup"><div class="ag-sticky-bottom-container" role="presentation" style={widthStyle}></div></div>
						<div class="ag-pinned-right-sticky-bottom ag-hidden" role="rowgroup" aria-hidden="true" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-sticky-bottom-full-width-container" role="rowgroup"></div>
					</div>
					<div class="ag-floating-bottom ag-invisible" role="presentation" style="height: 0px; min-height: 0px; overflow-y: scroll;">
						<div class="ag-pinned-left-floating-bottom ag-hidden" role="rowgroup" aria-hidden="true" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-viewport ag-floating-bottom-viewport" role="rowgroup"><div class="ag-floating-bottom-container" role="presentation" style={widthStyle}></div></div>
						<div class="ag-pinned-right-floating-bottom ag-hidden" role="rowgroup" aria-hidden="true" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-floating-bottom-full-width-container" role="rowgroup"></div>
					</div>
					<div class="ag-body-horizontal-scroll ag-apple-scrollbar ag-scrollbar-invisible ag-invisible" aria-hidden="true" style="bottom: 0px; height: 16px; max-height: 16px; min-height: 16px;">
						<div class="ag-horizontal-left-spacer ag-scroller-corner" data-ref="eLeftSpacer" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
						<div class="ag-body-horizontal-scroll-viewport" data-ref="eViewport" style="height: 16px; max-height: 16px; min-height: 16px;">
							<div class="ag-body-horizontal-scroll-container" data-ref="eContainer" style={hScrollStyle}></div>
						</div>
						<div class="ag-horizontal-right-spacer ag-scroller-corner" data-ref="eRightSpacer" style="width: 0px; max-width: 0px; min-width: 0px;"></div>
					</div>
					<div class={overlayCls} role="presentation">
						<div class="ag-overlay-panel" role="presentation">
							<div class="ag-overlay-wrapper ag-layout-normal ag-overlay-no-rows-wrapper" data-ref="eOverlayWrapper" role="presentation" style="padding-top: 25px;">
								<span class="ag-overlay-no-rows-center" style={overlayTextStyle}>No Rows To Show</span>
							</div>
						</div>
					</div>
				</div>
				<div class="ag-tab-guard ag-tab-guard-bottom" role="presentation" tabindex="0" onFocus={(e) => onGuardFocus(e, false)}></div>
			</div>
			<div class={textPopupCls} data-filter="text">
				<div class="ag-menu ag-filter-menu ag-ltr ag-popup-child ag-popup-positioned-under" role="presentation" aria-label="Column Filter" style={g.popupStyle} onKeyDown={(e) => {
					if (e.key !== 'Escape') return;
					const col = g.openFilter;
					g.openFilter = '';
					g.picker = -1;
					focusHeader(col);
				}}>
					<div class="ag-filter">
						<form class="ag-filter-wrapper" onSubmit={(e) => e.preventDefault()}>
							<div class="ag-filter-body-wrapper ag-simple-filter-body-wrapper ag-focus-managed" style="flex: 0 0 auto; max-height: 747px;">
								<div class="ag-picker-field ag-labeled ag-label-align-left ag-select ag-filter-select" role="presentation">
									<div data-ref="eLabel" class="ag-label ag-hidden" aria-hidden="true" role="presentation"></div>
									<div class={picker0Cls} data-ref="eWrapper" tabindex="0" aria-expanded={g.picker === 0 ? 'true' : 'false'} role="combobox" aria-label="Filtering operator" onClick={(e) => {
										g.pickerStyle = listUnder(e.target);
										g.pickerActive = optionIndex(op0);
										g.picker = g.picker === 0 ? -1 : 0;
									}}>
										<div class="ag-picker-field-display" data-ref="eDisplayField">{label0}</div>
										<div class="ag-picker-field-icon" data-ref="eIcon" aria-hidden="true"><span class="ag-icon ag-icon-small-down" role="presentation" unselectable="on"></span></div>
									</div>
								</div>
								<div class={body0Cls} role="presentation" aria-hidden={body0Hidden ? 'true' : 'false'}>
									<div role="presentation" class="ag-labeled ag-label-align-left ag-text-field ag-input-field ag-filter-from ag-filter-filter" aria-hidden="false">
										<div class="ag-input-field-label ag-label ag-hidden ag-text-field-label" data-ref="eLabel" aria-hidden="true" role="presentation"></div>
										<div class="ag-wrapper ag-input-wrapper ag-text-field-input-wrapper" data-ref="eWrapper" role="presentation">
											<input class="ag-input-field-input ag-text-field-input" data-ref="eInput" type="text" tabindex="0" placeholder="Filter..." aria-label="Filter Value" value={value0} onInput={(e) => {
												g.draft = withFilterValue(g.draft, 0, (e.target as HTMLInputElement).value);
												const col = g.openFilter;
												const next = g.draft;
												debounceFilter(() => {
													if (col === 'channel') g.fChannel = next;
													else if (col === 'args') g.fArgs = next;
												});
											}} />
										</div>
									</div>
									<div role="presentation" class="ag-labeled ag-label-align-left ag-text-field ag-input-field ag-filter-to ag-filter-filter ag-hidden" aria-hidden="true">
										<div class="ag-input-field-label ag-label ag-hidden ag-text-field-label" data-ref="eLabel" aria-hidden="true" role="presentation"></div>
										<div class="ag-wrapper ag-input-wrapper ag-text-field-input-wrapper" data-ref="eWrapper" role="presentation">
											<input class="ag-input-field-input ag-text-field-input" data-ref="eInput" type="text" tabindex="0" placeholder="To" aria-label="Filter to Value" />
										</div>
									</div>
								</div>
								<div class={conditionCls}>
									<div role="presentation" class="ag-labeled ag-label-align-right ag-radio-button ag-input-field ag-filter-condition-operator ag-filter-condition-operator-and">
										<div class="ag-input-field-label ag-label ag-radio-button-label" data-ref="eLabel" aria-hidden="false">AND</div>
										<div class={andCls} data-ref="eWrapper" role="presentation">
											<input class="ag-input-field-input ag-radio-button-input" data-ref="eInput" type="radio" tabindex="0" name="ag-simple-filter-and-or" aria-label="AND" checked={!isOr} onChange={() => {
												g.draft = withJoin(g.draft, 'AND');
												if (g.openFilter === 'channel') g.fChannel = g.draft;
												else if (g.openFilter === 'args') g.fArgs = g.draft;
											}} />
										</div>
									</div>
									<div role="presentation" class="ag-labeled ag-label-align-right ag-radio-button ag-input-field ag-filter-condition-operator ag-filter-condition-operator-or">
										<div class="ag-input-field-label ag-label ag-radio-button-label" data-ref="eLabel" aria-hidden="false">OR</div>
										<div class={orCls} data-ref="eWrapper" role="presentation">
											<input class="ag-input-field-input ag-radio-button-input" data-ref="eInput" type="radio" tabindex="0" name="ag-simple-filter-and-or" aria-label="OR" checked={isOr} onChange={() => {
												g.draft = withJoin(g.draft, 'OR');
												if (g.openFilter === 'channel') g.fChannel = g.draft;
												else if (g.openFilter === 'args') g.fArgs = g.draft;
											}} />
										</div>
									</div>
								</div>
								<div class={picker1FieldCls} role="presentation">
									<div data-ref="eLabel" class="ag-label ag-hidden" aria-hidden="true" role="presentation"></div>
									<div class={picker1Cls} data-ref="eWrapper" tabindex="0" aria-expanded={g.picker === 1 ? 'true' : 'false'} role="combobox" aria-label="Filtering operator" onClick={(e) => {
										g.pickerStyle = listUnder(e.target);
										g.pickerActive = optionIndex(op1);
										g.picker = g.picker === 1 ? -1 : 1;
									}}>
										<div class="ag-picker-field-display" data-ref="eDisplayField">{label1}</div>
										<div class="ag-picker-field-icon" data-ref="eIcon" aria-hidden="true"><span class="ag-icon ag-icon-small-down" role="presentation" unselectable="on"></span></div>
									</div>
								</div>
								<div class={body1Cls} role="presentation" aria-hidden={body1Hidden ? 'true' : 'false'}>
									<div role="presentation" class="ag-labeled ag-label-align-left ag-text-field ag-input-field ag-filter-from ag-filter-filter" aria-hidden="false">
										<div class="ag-input-field-label ag-label ag-hidden ag-text-field-label" data-ref="eLabel" aria-hidden="true" role="presentation"></div>
										<div class="ag-wrapper ag-input-wrapper ag-text-field-input-wrapper" data-ref="eWrapper" role="presentation">
											<input class="ag-input-field-input ag-text-field-input" data-ref="eInput" type="text" tabindex="0" placeholder="Filter..." aria-label="Filter Value" value={value1} onInput={(e) => {
												g.draft = withFilterValue(g.draft, 1, (e.target as HTMLInputElement).value);
												const col = g.openFilter;
												const next = g.draft;
												debounceFilter(() => {
													if (col === 'channel') g.fChannel = next;
													else if (col === 'args') g.fArgs = next;
												});
											}} />
										</div>
									</div>
								</div>
							</div>
						</form>
					</div>
				</div>
			</div>
			<div class={directionPopupCls} data-filter="direction">
				<div class="ag-menu ag-filter-menu ag-ltr ag-popup-child ag-popup-positioned-under" role="presentation" aria-label="Column Filter" style={g.popupStyle} onKeyDown={(e) => {
					if (e.key !== 'Escape') return;
					g.openFilter = '';
					focusHeader('direction');
				}}>
					<div class="ag-filter">
						<div class="ag-filter-wrapper">
							<div class="ag-react-container">
								<div class="flex flex-col gap-1 p-1">
									@for (const option of directions; key option.dir) {
										<div class="flex cursor-pointer items-center gap-1 rounded-sm p-1 transition-all duration-150" onClick={() => (g.fDirection = toggleDirection(g.fDirection, option.dir))}>
											<div class={option.box}><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" aria-hidden="true" style={option.checkStyle}><path d="M20 6 9 17l-5-5"></path></svg></div>
											<span class={option.info.cls} title={option.info.title}>{option.info.left}<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right mx-0.5 flex-shrink-0" aria-hidden="true" style={option.info.arrowStyle}><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>{option.info.right}</span>
										</div>
									}
									<div class="mt-1 flex items-center justify-center border-t border-gray-100 pt-1 dark:border-charcoal-300" style={clearStyle}>
										<button class="w-full text-center text-xs text-gray-500 transition-colors duration-150 hover:text-gray-700 dark:text-charcoal-100 dark:hover:text-gray-100" onClick={() => (g.fDirection = '')}>Clear all</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div class={pickerPopupCls}>
				<div class="ag-list ag-select-list ag-ltr ag-popup-child ag-popup-positioned-under" role="listbox" aria-label="Select Field" style={g.pickerStyle}>
					@for (const option of pickerOptions; key option.key) {
						<div class={option.cls} role="option" aria-posinset={option.pos} aria-setsize="8" aria-selected={option.selected} onMouseEnter={() => (g.pickerActive = option.pos - 1)} onClick={() => {
							g.draft = withFilterType(g.draft, g.picker === 1 ? 1 : 0, option.key);
							g.picker = -1;
							if (g.openFilter === 'channel') g.fChannel = g.draft;
							else if (g.openFilter === 'args') g.fArgs = g.draft;
						}}><span data-ref="eText">{option.label}</span></div>
					}
				</div>
			</div>
		</div>
	</div>
}
