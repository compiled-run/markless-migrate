// The tasks page (features/tasks): the table over @tanstack/table-core (lib/parity/tanstack-react-table/tasks-table.ts),
// its toolbar, faceted filters, column menus, pagination, bulk actions and row menu, the import dialog, the create and
// update sheet and the delete confirmations. Written by deploy/shadcn-admin/scripts/gen-tasks.py from tasks.template.tsrx.
import { computed, element, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Shell } from '../components/layout/shell.tsrx';
import { layoutPrefs } from '../components/layout/prefs.ts';
import { chosenIn, filterIn, moveIn } from '../lib/parity/cmdk/behaviour.ts';
import { closeDialog, openDialog } from '../lib/parity/radix-ui-react-dialog/behaviour.ts';
import { closeMenu, openMenu, toggleMenu } from '../lib/parity/radix-ui-react-dropdown-menu/behaviour.ts';
import { DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger, menus, PopoverContent, SelectItem } from '../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { revalidate } from '../lib/parity/react-hook-form/index.ts';
import type { FieldErrors } from '../lib/parity/hookform-resolvers/index.ts';
import { DURATION, expired, message, promiseLoading, promiseSuccess, type Toast } from '../lib/parity/sonner/index.ts';
import { Toaster } from '../lib/parity/sonner/toaster.tsrx';
import { announcementFor, countOf, fromSearch, hasValue, json, LABELS, list, pageAfterResize, pageCountFor, pushFilters, pushGlobalFilter, pushPagination, priorityFacets, selectedCount, selectionView, statusFacets, tablePages, tableRows, statusText, tableModel, taskAt, taskField, toggleAllOnPage, toggleValue } from '../lib/parity/tanstack-react-table/tasks-table.ts';
import { clearFiles, CONFIRM_WORD, closeSub, fileDetails, filesIn, focusFirstError, importResolver, openSub, radioKey, subKey, taskFormResolver, trackTrigger, pageOf, toolbarOf, blurActive, selectPressed, radioValue, clearAnnouncementLater, keepPageFocus, type TaskForm } from '../lib/tasks-behaviour.ts';
import { ALERT_CONTENT, ALERT_DESTRUCTIVE, badge, btn, CHECKBOX, COMMAND_GROUP, COMMAND_ITEM, DIALOG_CLOSE_X, DIALOG_CONTENT, FILE_INPUT, FORM_LABEL, INPUT, INPUT_BASE, LABEL, OUTLINE_BADGE, OVERLAY, RADIO, RADIO_ITEM, RADIO_LABEL, SELECT_TRIGGER, SEPARATOR_V, SHEET_CLOSE_X, SHEET_CONTENT, SUB_CONTENT, SUB_TRIGGER, TD, TH, TR } from '../lib/tasks-ui.ts';
import { escapeClears, moveToolbarFocus } from '../lib/users-behaviour.ts';
import { cn } from '../lib/utils.ts';

const form = { resolver: taskFormResolver, defaultValues: { title: '', status: '', label: '', priority: '' } };
const importForm = { resolver: importResolver, defaultValues: { file: undefined } };
const LABEL_OPTIONS = [
	{ label: 'Documentation', value: 'documentation' },
	{ label: 'Feature', value: 'feature' },
	{ label: 'Bug', value: 'bug' },
];
const PRIORITY_OPTIONS = [
	{ label: 'High', value: 'high' },
	{ label: 'Medium', value: 'medium' },
	{ label: 'Low', value: 'low' },
];

export default function Tasks({ http, url }: PageProps) @{
	const prefs = layoutPrefs(http.request.headers.get('cookie'));
	const initial = fromSearch(url.search);
	let sorting = state('');
	let filter = state(initial.filter);
	let status = state(initial.status);
	let priority = state(initial.priority);
	let page = state(initial.page);
	let pageSize = state(initial.pageSize);
	let selected = state('');
	let hidden = state('');
	const m = menus();
	let announcement = state('');
	let toasts = state<Toast[]>([]);
	let current = state('');
	let deleteOpen = state(false);
	let multiOpen = state(false);
	let confirmValue = state('');
	let importOpen = state(false);
	let importError = state('');
	let importSubmitted = state(false);
	let sheetOpen = state(false);
	let isUpdate = state(false);
	let values = state<TaskForm>({ title: '', status: '', label: '', priority: '' });
	let errors = state<FieldErrors<TaskForm>>({});
	let submitted = state(false);
	const subTrigger = element<HTMLDivElement>();
	const subContent = element<HTMLDivElement>();
	const labelGroup = element<HTMLDivElement>();
	const priorityGroup = element<HTMLDivElement>();

	const facetTriggerClass = computed(() => btn('outline', 'sm', 'h-8 border-dashed'));
	const viewTriggerClass = computed(() => btn('outline', 'sm', 'ms-auto hidden h-8 lg:flex'));
	const sortTriggerClass = computed(() => btn('ghost', 'sm', 'h-8 data-[state=open]:bg-accent'));
	const pageSizeTriggerClass = computed(() => cn(SELECT_TRIGGER, 'h-8 w-17.5'));
	const bulkTriggerClass = computed(() => btn('outline', 'icon', 'size-8'));
	const selectTriggerClass = computed(() => SELECT_TRIGGER);
	// The rows' list must not read `selected`: a row handler's write to a cell its own @for list reads is dropped until another handler runs.
	const model = computed(() => tableModel({ sorting, filter, status, priority, page, pageSize, selected: '', hidden }));
	const selection = computed(() => selectionView({ sorting, filter, status, priority, page, pageSize, selected, hidden }));
	const rows = computed(() => tableRows({ sorting, filter, status, priority, page, pageSize, selected: '', hidden }));
	const pages = computed(() => tablePages({ sorting, filter, status, priority, page, pageSize, selected: '', hidden }));
	const statusOptions = computed(() => statusFacets({ sorting, filter, status, priority, page, pageSize, selected: '', hidden }));
	const priorityOptions = computed(() => priorityFacets({ sorting, filter, status, priority, page, pageSize, selected: '', hidden }));
	const statusNone = computed(() => countOf(status) === 0);
	const statusCount = computed(() => String(countOf(status)));
	const statusFewOrNone = computed(() => countOf(status) <= 2);
	const statusCountLabel = computed(() => `${countOf(status)} selected`);
	const priorityNone = computed(() => countOf(priority) === 0);
	const priorityCount = computed(() => String(countOf(priority)));
	const priorityFewOrNone = computed(() => countOf(priority) <= 2);
	const priorityCountLabel = computed(() => `${countOf(priority)} selected`);
	const notFiltered = computed(() => !model.filtered);
	const headerChecked = computed(() => selection.headerChecked);
	const headerState = computed(() => (selection.headerChecked === 'true' ? 'checked' : selection.headerChecked === 'mixed' ? 'indeterminate' : 'unchecked'));
	const noRows = computed(() => model.empty);
	const visibleColumns = computed(() => String(6 - countOf(hidden)));
	const pageLabel = computed(() => model.pageLabel);
	const cannotPrevious = computed(() => !model.canPrevious);
	const cannotNext = computed(() => !model.canNext);
	const pageSizeLabel = computed(() => String(pageSize));
	const titleColumnHidden = computed(() => hasValue(hidden, 'title'));
	const statusColumnHidden = computed(() => hasValue(hidden, 'status'));
	const priorityColumnHidden = computed(() => hasValue(hidden, 'priority'));
	const titleShown = computed(() => (hasValue(hidden, 'title') ? 'false' : 'true'));
	const statusShown = computed(() => (hasValue(hidden, 'status') ? 'false' : 'true'));
	const priorityShown = computed(() => (hasValue(hidden, 'priority') ? 'false' : 'true'));
	const size10 = computed(() => (pageSize === 10 ? 'true' : 'false'));
	const size20 = computed(() => (pageSize === 20 ? 'true' : 'false'));
	const size30 = computed(() => (pageSize === 30 ? 'true' : 'false'));
	const size40 = computed(() => (pageSize === 40 ? 'true' : 'false'));
	const size50 = computed(() => (pageSize === 50 ? 'true' : 'false'));
	const count = computed(() => selection.selectedCount);
	const noSelection = computed(() => selection.selectedCount === 0);
	const countText = computed(() => String(selection.selectedCount));
	const countLabel = computed(() => `${selection.selectedCount} selected`);
	const countNoun = computed(() => (selection.selectedCount > 1 ? 'tasks' : 'task'));
	const toolbarLabel = computed(() => `Bulk actions for ${selection.selectedCount} selected task${selection.selectedCount > 1 ? 's' : ''}`);
	const currentId = computed(() => taskField(current, 'id'));
	const currentLabel = computed(() => taskField(m.at, 'label'));
	const deleteTitle = computed(() => `Delete this task: ${taskField(current, 'id')} ?`);
	const multiNoun = computed(() => (selection.selectedCount > 1 ? 'tasks' : 'task'));
	const multiDisabled = computed(() => confirmValue.trim() !== CONFIRM_WORD);
	const importInvalid = computed(() => (importError ? 'true' : 'false'));
	const importDescribedBy = computed(() => (importError ? 'tasks-import-file-form-item-description tasks-import-file-form-item-message' : 'tasks-import-file-form-item-description'));
	const sheetTitle = computed(() => (isUpdate ? 'Update' : 'Create'));
	const sheetDescription = computed(() => (isUpdate ? 'Update the task by providing necessary info.' : 'Add a new task by providing necessary info.'));
	const titleError = computed(() => errors.title ?? '');
	const statusError = computed(() => errors.status ?? '');
	const labelError = computed(() => errors.label ?? '');
	const priorityError = computed(() => errors.priority ?? '');
	const titleInvalid = computed(() => (errors.title ? 'true' : 'false'));
	const statusInvalid = computed(() => (errors.status ? 'true' : 'false'));
	const labelInvalid = computed(() => (errors.label ? 'true' : 'false'));
	const priorityInvalid = computed(() => (errors.priority ? 'true' : 'false'));
	const titleDescribedBy = computed(() => (errors.title ? 'tasks-form-title-description tasks-form-title-message' : 'tasks-form-title-description'));
	const statusDescribedBy = computed(() => (errors.status ? 'tasks-form-status-description tasks-form-status-message' : 'tasks-form-status-description'));
	const labelDescribedBy = computed(() => (errors.label ? 'tasks-form-label-description tasks-form-label-message' : 'tasks-form-label-description'));
	const priorityDescribedBy = computed(() => (errors.priority ? 'tasks-form-priority-description tasks-form-priority-message' : 'tasks-form-priority-description'));
	const statusValueText = computed(() => statusText(values.status));
	const statusPlaceholder = computed(() => (values.status ? undefined : ''));
	const statusInProgressSelected = computed(() => (values.status === 'in progress' ? 'true' : 'false'));
	const statusBacklogSelected = computed(() => (values.status === 'backlog' ? 'true' : 'false'));
	const statusTodoSelected = computed(() => (values.status === 'todo' ? 'true' : 'false'));
	const statusCanceledSelected = computed(() => (values.status === 'canceled' ? 'true' : 'false'));
	const statusDoneSelected = computed(() => (values.status === 'done' ? 'true' : 'false'));
	const labelOptionList = computed(() => LABEL_OPTIONS.map((o, i) => ({ ...o, checked: o.value === values.label, first: i === 0, tab: o.value === values.label || (!values.label && i === 0) ? '0' : '-1' })));
	const priorityOptionList = computed(() => PRIORITY_OPTIONS.map((o, i) => ({ ...o, checked: o.value === values.priority, first: i === 0, tab: o.value === values.priority || (!values.priority && i === 0) ? '0' : '-1' })));
	const labelItems = computed(() => LABELS.map((l) => ({ ...l, checked: l.value === currentLabel })));

	<Shell active="/tasks" header="search" fixed={true} prefs={prefs}>
		<main data-layout="auto" class="px-4 py-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl flex flex-1 flex-col gap-4 sm:gap-6">
			<div class="flex flex-wrap items-end justify-between gap-2">
				<div>
					<h2 class="text-2xl font-bold tracking-tight">Tasks</h2>
					<p class="text-muted-foreground">Here's a list of your tasks for this month!</p>
				</div>
				<div class="flex gap-2">
					<button data-slot="button" class={btn('outline', 'default', 'space-x-1')} onClick={() => {
						importOpen = true;
						importError = '';
						importSubmitted = false;
						clearFiles('tasks-import-file');
						openDialog('tasks-import-dialog', { onDismiss: () => { importOpen = false; closeDialog('tasks-import-dialog', false); blurActive(); } });
					}}>
						<span>Import</span>
						%%ICON:download:lucide lucide-download%%
					</button>
					<button data-slot="button" class={btn('default', 'default', 'space-x-1')} onClick={() => {
						isUpdate = false;
						values = { title: '', status: '', label: '', priority: '' };
						errors = {};
						submitted = false;
						sheetOpen = true;
						openDialog('tasks-sheet', { onDismiss: () => { if (m.open === '') { sheetOpen = false; closeDialog('tasks-sheet', false); blurActive(); } } });
					}}>
						<span>Create</span>
						%%ICON:plus:lucide lucide-plus%%
					</button>
				</div>
			</div>
			<div class={"max-sm:has-[div[role=\"toolbar\"]]:mb-16 flex flex-1 flex-col gap-4"}>
				<div class="flex items-center justify-between">
					<div class="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">
						<input data-slot="input" class={`${INPUT_BASE} h-8 w-37.5 lg:w-62.5`} placeholder="Filter by title or ID..." value={filter} onInput={(event) => {
							filter = (event.target as HTMLInputElement).value.trim();
							page = 1;
							pushGlobalFilter(filter);
						}} />
						<div class="flex gap-x-2">
							%%MACRO:FACET_TRIGGER:status%%
							%%MACRO:FACET_TRIGGER:priority%%
						</div>
						@if (!notFiltered) {
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 py-2 has-[>svg]:px-3 h-8 px-2 lg:px-3" onClick={() => {
								status = '';
								priority = '';
								page = 1;
								pushFilters('', '');
								filter = '';
								pushGlobalFilter('');
							}}>
								Reset
								%%ICON:cross2:ms-2 h-4 w-4%%
							</button>
						}
					</div>
					<DropdownMenuTrigger menu="view-options" class={viewTriggerClass}>
						%%ICON:mixer:size-4%%
						View
					</DropdownMenuTrigger>
				</div>
				<div class="overflow-hidden rounded-md border">
					<div data-slot="table-container" class="relative w-full overflow-x-auto">
						<table data-slot="table" class="w-full caption-bottom text-sm min-w-xl">
							<thead data-slot="table-header" class="[&_tr]:border-b">
								<tr data-slot="table-row" class={TR}>
									<th data-slot="table-head" class={TH} colspan="1">
										<button type="button" role="checkbox" aria-checked={headerChecked} data-state={headerState} value="on" data-slot="checkbox" class={CHECKBOX} aria-label="Select all" onClick={() => {
											selected = toggleAllOnPage({ sorting, filter, status, priority, page, pageSize, selected, hidden });
											announcement = announcementFor(selectedCount({ sorting, filter, status, priority, page, pageSize, selected, hidden }));
											clearAnnouncementLater(() => { announcement = ''; });
										}}>
											@if (headerChecked === 'true') {
												<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;">%%ICON:check:lucide lucide-check size-3.5%%</span>
											}
										</button>
									</th>
									<th data-slot="table-head" class={TH} colspan="1">
										<div class="">Task</div>
									</th>
									%%MACRO:SORT_HEADER:title%%
									%%MACRO:SORT_HEADER:status%%
									%%MACRO:SORT_HEADER:priority%%
									<th data-slot="table-head" class={TH} colspan="1"></th>
								</tr>
							</thead>
							<tbody data-slot="table-body" class="[&_tr:last-child]:border-0">
								@for (const r of rows; key r.slot) {
									<tr data-slot="table-row" class={TR} hidden={!r.shown} data-state={hasValue(selected, r.key) ? 'selected' : 'false'}>
										<td data-slot="table-cell" class={TD}>
											<button type="button" role="checkbox" aria-checked={hasValue(selected, r.key) ? 'true' : 'false'} data-state={hasValue(selected, r.key) ? 'checked' : 'unchecked'} value="on" data-slot="checkbox" class={CHECKBOX} aria-label="Select row" onClick={() => {
												selected = toggleValue(selected, r.key);
												announcement = announcementFor(selectedCount({ sorting, filter, status, priority, page, pageSize, selected, hidden }));
												clearAnnouncementLater(() => { announcement = ''; });
											}}>
												<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;" hidden={!hasValue(selected, r.key)}>%%ICON:check:lucide lucide-check size-3.5%%</span>
											</button>
										</td>
										<td data-slot="table-cell" class={TD}>
											<div class="w-20">{r.id}</div>
										</td>
										<td data-slot="table-cell" class={`${TD} max-w-0 w-2/3 ps-4`} hidden={titleColumnHidden}>
											<div class="flex space-x-2">
												<span data-slot="badge" class={OUTLINE_BADGE}>{r.labelName}</span>
												<span class="truncate font-medium">{r.title}</span>
											</div>
										</td>
										<td data-slot="table-cell" class={`${TD} ps-4`} hidden={statusColumnHidden}>
											<div class="flex w-25 items-center gap-2">
												%%MACRO:ROW_STATUS_ICON%%
												<span>{r.statusName}</span>
											</div>
										</td>
										<td data-slot="table-cell" class={`${TD} ps-3`} hidden={priorityColumnHidden}>
											<div class="flex items-center gap-2">
												%%MACRO:ROW_PRIORITY_ICON%%
												<span>{r.priorityName}</span>
											</div>
										</td>
										<td data-slot="table-cell" class={TD}>
											<button
												el={m.triggers}
												type="button"
												data-slot="dropdown-menu-trigger"
												class={btn('ghost', 'default', 'flex h-8 w-8 p-0 data-[state=open]:bg-muted')}
												id={`radix-menu-row-actions${r.key}-trigger`}
												aria-haspopup="menu"
												aria-expanded="false"
												aria-controls="radix-menu-row-actions-content"
												data-state="closed"
												data-menu="row-actions"
												onPointerdown={(event) => {
													if (event.button === 0) {
														event.preventDefault();
														m.open = m.open === 'row-actions' && m.at === r.key ? '' : 'row-actions';
														m.at = r.key;
														toggleMenu(m.contents, m.triggers, 'row-actions', m.open === '', event.target, (refocus) => {
															m.open = '';
															closeMenu(m.contents, m.triggers, 'row-actions', refocus);
														});
														trackTrigger(event.target);
													}
												}}
												onKeydown={(event) => {
													if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
														event.preventDefault();
														m.open = 'row-actions';
														m.at = r.key;
														openMenu(m.contents, m.triggers, 'row-actions', 'first', (refocus) => {
															m.open = '';
															closeMenu(m.contents, m.triggers, 'row-actions', refocus);
														}, event.target);
														trackTrigger(event.target);
													}
												}}
											>
												%%ICON:dots:h-4 w-4%%
												<span class="sr-only">Open menu</span>
											</button>
										</td>
									</tr>
								}
								@if (noRows) {
									<tr data-slot="table-row" class={TR}>
										<td data-slot="table-cell" class={`${TD} h-24 text-center`} colspan={visibleColumns}>No results.</td>
									</tr>
								}
							</tbody>
						</table>
					</div>
				</div>
				<div class="flex items-center justify-between overflow-clip px-2 @max-2xl/content:flex-col-reverse @max-2xl/content:gap-4 mt-auto" style="overflow-clip-margin: 1px;">
					<div class="flex w-full items-center justify-between">
						<div class="flex w-25 items-center justify-center text-sm font-medium @2xl/content:hidden">{pageLabel}</div>
						<div class="flex items-center gap-2 @max-2xl/content:flex-row-reverse">
							<DropdownMenuTrigger menu="page-size" haspopup="listbox" role="combobox" aria-autocomplete="none" dir="ltr" data-size="default" class={pageSizeTriggerClass}>
								<span data-slot="select-value" style="pointer-events: none;">{pageSizeLabel}</span>
								%%ICON:chevron-down:lucide lucide-chevron-down size-4 opacity-50%%
							</DropdownMenuTrigger>
							<p class="hidden text-sm font-medium sm:block">Rows per page</p>
						</div>
					</div>
					<div class="flex items-center sm:space-x-6 lg:space-x-8">
						<div class="flex w-25 items-center justify-center text-sm font-medium @max-3xl/content:hidden">{pageLabel}</div>
						<div class="flex items-center space-x-2">
							<button data-slot="button" class={btn('outline', 'default', 'size-8 p-0 @max-md/content:hidden')} disabled={cannotPrevious} onClick={() => { page = 1; pushPagination(page, pageSize); }}>
								<span class="sr-only">Go to first page</span>
								%%ICON:double-left:h-4 w-4%%
							</button>
							<button data-slot="button" class={btn('outline', 'default', 'size-8 p-0')} disabled={cannotPrevious} onClick={() => { page = Math.max(1, page - 1); pushPagination(page, pageSize); }}>
								<span class="sr-only">Go to previous page</span>
								%%ICON:chevron-left:h-4 w-4%%
							</button>
							@for (const p of pages; key p.key) {
								<div class="flex items-center" hidden={!p.shown}>
									<span class="px-1 text-sm text-muted-foreground" hidden={!p.ellipsis}>...</span>
									<button data-slot="button" class={btn(p.current ? 'default' : 'outline', 'default', 'h-8 min-w-8 px-2')} hidden={p.ellipsis} data-page={p.label} onClick={(event) => {
										page = pageOf(event.target);
										pushPagination(page, pageSize);
										keepPageFocus(event.target, page);
									}}>
										<span class="sr-only">{`Go to page ${p.label}`}</span>
										<span>{p.label}</span>
									</button>
								</div>
							}
							<button data-slot="button" class={btn('outline', 'default', 'size-8 p-0')} disabled={cannotNext} onClick={() => { page = Math.min(pageCountFor({ sorting, filter, status, priority, page, pageSize, selected, hidden }), page + 1); pushPagination(page, pageSize); }}>
								<span class="sr-only">Go to next page</span>
								%%ICON:chevron-right-radix:h-4 w-4%%
							</button>
							<button data-slot="button" class={btn('outline', 'default', 'size-8 p-0 @max-md/content:hidden')} disabled={cannotNext} onClick={() => { page = pageCountFor({ sorting, filter, status, priority, page, pageSize, selected, hidden }); pushPagination(page, pageSize); }}>
								<span class="sr-only">Go to last page</span>
								%%ICON:double-right:h-4 w-4%%
							</button>
						</div>
					</div>
				</div>
				<div aria-live="polite" aria-atomic="true" class="sr-only" role="status" hidden={noSelection}>{announcement}</div>
				<div role="toolbar" aria-label={toolbarLabel} aria-describedby="bulk-actions-description" tabindex="-1" class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl transition-all delay-100 duration-300 ease-out hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" hidden={noSelection} onKeydown={(event) => {
					if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
						event.preventDefault();
						const bar = toolbarOf(event.target);
						if (bar) moveToolbarFocus(bar, event.key);
					}
					if (event.key === 'Escape') {
						selected = escapeClears(event) ? '' : selected;
					}
				}}>
					<div class="p-2 shadow-xl rounded-xl border bg-background/95 backdrop-blur-lg supports-backdrop-filter:bg-background/60 flex items-center gap-x-2">
						<button data-slot="tooltip-trigger" class={btn('outline', 'icon', 'size-6 rounded-full')} aria-label="Clear selection" title="Clear selection (Escape)" data-state="closed" onClick={() => { selected = ''; }}>
							%%ICON:x:lucide lucide-x%%
							<span class="sr-only">Clear selection</span>
						</button>
						<div data-orientation="vertical" role="none" data-slot="separator" class={`${SEPARATOR_V} h-5`} aria-hidden="true"></div>
						<div class="flex items-center gap-x-1 text-sm" id="bulk-actions-description">
							<span data-slot="badge" class="inline-flex items-center justify-center border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90 min-w-8 rounded-lg" aria-label={countLabel}>{countText}</span>
							<span class="hidden sm:inline">{countNoun}</span>
							<span>selected</span>
						</div>
						<div data-orientation="vertical" role="none" data-slot="separator" class={`${SEPARATOR_V} h-5`} aria-hidden="true"></div>
						<DropdownMenuTrigger menu="bulk-status" slot="tooltip-trigger" class={bulkTriggerClass} aria-label="Update status" title="Update status">
							%%ICON:circle-arrow-up:lucide lucide-circle-arrow-up%%
							<span class="sr-only">Update status</span>
						</DropdownMenuTrigger>
						<DropdownMenuTrigger menu="bulk-priority" slot="tooltip-trigger" class={bulkTriggerClass} aria-label="Update priority" title="Update priority">
							%%ICON:arrow-up-down:lucide lucide-arrow-up-down%%
							<span class="sr-only">Update priority</span>
						</DropdownMenuTrigger>
						<button data-slot="tooltip-trigger" class={bulkTriggerClass} aria-label="Export tasks" title="Export tasks" data-state="closed" onClick={() => {
							const n = count;
							const id = `export-${Date.now()}`;
							toasts = promiseLoading(toasts, id, 'Exporting tasks...');
							selected = '';
							setTimeout(() => {
								toasts = promiseSuccess(toasts, id, `Exported ${n} task${n > 1 ? 's' : ''} to CSV.`);
								setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
							}, 2000);
						}}>
							%%ICON:download:lucide lucide-download%%
							<span class="sr-only">Export tasks</span>
						</button>
						<button data-slot="tooltip-trigger" class={btn('destructive', 'icon', 'size-8')} aria-label="Delete selected tasks" title="Delete selected tasks" data-state="closed" onClick={() => {
							multiOpen = true;
							openDialog('tasks-multi-delete-dialog', { alert: true, focus: document.getElementById('tasks-multi-delete-input'), onDismiss: () => { multiOpen = false; closeDialog('tasks-multi-delete-dialog', false); blurActive(); } });
						}}>
							%%ICON:trash2:lucide lucide-trash2 lucide-trash-2%%
							<span class="sr-only">Delete selected tasks</span>
						</button>
					</div>
				</div>
			</div>
		</main>

		<div data-state="closed" data-slot="alert-dialog-overlay" class={OVERLAY} style="pointer-events: auto;" hidden={!deleteOpen}></div>
		<div role="alertdialog" id="tasks-delete-dialog" aria-describedby="tasks-delete-description" aria-labelledby="tasks-delete-title" data-state="closed" data-slot="alert-dialog-content" class={`${ALERT_CONTENT} max-w-md`} tabindex="-1" style="pointer-events: auto;" hidden={!deleteOpen}>
			<div data-slot="alert-dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
				<h2 id="tasks-delete-title" data-slot="alert-dialog-title" class="text-lg font-semibold">{deleteTitle}</h2>
				<div id="tasks-delete-description" data-slot="alert-dialog-description" class="text-sm text-muted-foreground">
					You are about to delete a task with the ID <strong>{currentId}</strong>. <span class="block"></span>This action cannot be undone.
				</div>
			</div>
			<div data-slot="alert-dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button type="button" id="tasks-delete-cancel" class={btn('outline', 'default')} onClick={() => { deleteOpen = false; closeDialog('tasks-delete-dialog', false); blurActive(); }}>Cancel</button>
				<button data-slot="button" class={btn('destructive', 'default')} type="button" onClick={() => {
					deleteOpen = false;
					closeDialog('tasks-delete-dialog', false); blurActive();
					blurActive();
					const id = `deleted-${Date.now()}`;
					toasts = message(toasts, id, 'The following task has been deleted:', json(taskAt(current)));
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}}>Delete</button>
			</div>
		</div>

		<div data-state="closed" data-slot="alert-dialog-overlay" class={OVERLAY} style="pointer-events: auto;" hidden={!multiOpen}></div>
		<div role="alertdialog" id="tasks-multi-delete-dialog" aria-describedby="tasks-multi-delete-description" aria-labelledby="tasks-multi-delete-title" data-state="closed" data-slot="alert-dialog-content" class={`${ALERT_CONTENT} max-w-[calc(100%-2rem)]`} tabindex="-1" style="pointer-events: auto;" hidden={!multiOpen}>
			<div data-slot="alert-dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
				<h2 id="tasks-multi-delete-title" data-slot="alert-dialog-title" class="text-lg font-semibold">
					<span class="text-destructive">
						%%ICON:triangle-alert:lucide lucide-triangle-alert me-1 inline-block stroke-destructive%%
						<span>{' Delete '}</span><span>{countText}</span><span>{' '}</span><span>{multiNoun}</span>
					</span>
				</h2>
				<div id="tasks-multi-delete-description" data-slot="alert-dialog-description" class="text-sm text-muted-foreground">
					<form id="tasks-multi-delete-form" class="space-y-4" onSubmit={(event) => {
						event.preventDefault();
						if (confirmValue.trim() === CONFIRM_WORD) {
							const n = count;
							const id = `multi-${Date.now()}`;
							multiOpen = false;
							closeDialog('tasks-multi-delete-dialog', false); blurActive();
							blurActive();
							selected = '';
							toasts = promiseLoading(toasts, id, 'Deleting tasks...');
							setTimeout(() => {
								confirmValue = '';
								toasts = promiseSuccess(toasts, id, `Deleted ${n} ${n > 1 ? 'tasks' : 'task'}`);
								setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
							}, 2000);
						}
					}}>
						<p class="mb-2">Are you sure you want to delete the selected tasks? <span class="block"></span>This action cannot be undone.</p>
						<label data-slot="label" class={LABEL}>
							<span class="">{'Confirm by typing "DELETE":'}</span>
							<input data-slot="input" id="tasks-multi-delete-input" class={INPUT} placeholder={'Type "DELETE" to confirm.'} value={confirmValue} onInput={(event) => { confirmValue = (event.target as HTMLInputElement).value; }} />
						</label>
						<div data-slot="alert" role="alert" class={ALERT_DESTRUCTIVE}>
							<div data-slot="alert-title" class="col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight">Warning!</div>
							<div data-slot="alert-description" class="col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed">Please be careful, this operation can not be rolled back.</div>
						</div>
					</form>
				</div>
			</div>
			<div data-slot="alert-dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button type="button" id="tasks-multi-delete-cancel" class={btn('outline', 'default')} onClick={() => { multiOpen = false; closeDialog('tasks-multi-delete-dialog', false); blurActive(); }}>Cancel</button>
				<button data-slot="button" class={btn('destructive', 'default')} type="submit" form="tasks-multi-delete-form" disabled={multiDisabled}>Delete</button>
			</div>
		</div>

		<div data-state="closed" data-slot="dialog-overlay" class={OVERLAY} hidden={!importOpen}></div>
		<div role="dialog" id="tasks-import-dialog" aria-describedby="tasks-import-description" aria-labelledby="tasks-import-title" data-state="closed" data-slot="dialog-content" class={DIALOG_CONTENT} tabindex="-1" style="pointer-events: auto;" hidden={!importOpen}>
			<div data-slot="dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
				<h2 id="tasks-import-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Import Tasks</h2>
				<p id="tasks-import-description" data-slot="dialog-description" class="text-sm text-muted-foreground">Import tasks quickly from a CSV file.</p>
			</div>
			<form id="task-import-form" onSubmit={(event) => {
				event.preventDefault();
				importSubmitted = true;
				const files = filesIn('tasks-import-file');
				const result = importForm.resolver({ file: files });
				importError = result.file ?? '';
				if (result.file) {
					document.getElementById('tasks-import-file')?.focus();
				} else {
					const id = `import-${Date.now()}`;
					toasts = message(toasts, id, 'You have imported the following file:', fileDetails(files));
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
					importOpen = false;
					closeDialog('tasks-import-dialog', false); blurActive();
				}
			}}>
				<div data-slot="form-item" class="grid gap-2 my-2">
					<label data-slot="form-label" class={FORM_LABEL} data-error={importInvalid} for="tasks-import-file">File</label>
					<input data-slot="form-control" class={FILE_INPUT} accept="text/csv" id="tasks-import-file" aria-describedby={importDescribedBy} aria-invalid={importInvalid} type="file" name="file" onChange={() => {
						if (importSubmitted) importError = importForm.resolver({ file: filesIn('tasks-import-file') }).file ?? '';
					}} />
					@if (importError) {
						<p data-slot="form-message" id="tasks-import-file-form-item-message" class="text-sm text-destructive">{importError}</p>
					}
				</div>
			</form>
			<div data-slot="dialog-footer" class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
				<button data-slot="dialog-close" class={btn('outline', 'default')} type="button" onClick={() => { importOpen = false; closeDialog('tasks-import-dialog', false); blurActive(); }}>Close</button>
				<button data-slot="button" class={btn('default', 'default')} type="submit" form="task-import-form">Import</button>
			</div>
			<button type="button" data-slot="dialog-close" class={DIALOG_CLOSE_X} onClick={() => { importOpen = false; closeDialog('tasks-import-dialog', false); blurActive(); }}>
				%%ICON:x:lucide lucide-x%%
				<span class="sr-only">Close</span>
			</button>
		</div>

		<div data-state="closed" data-slot="sheet-overlay" class={OVERLAY} hidden={!sheetOpen}></div>
		<div role="dialog" id="tasks-sheet" aria-describedby="tasks-sheet-description" aria-labelledby="tasks-sheet-title" data-state="closed" data-slot="sheet-content" class={SHEET_CONTENT} tabindex="-1" style="pointer-events: auto;" hidden={!sheetOpen}>
			<div data-slot="sheet-header" class="flex flex-col gap-1.5 p-4 text-start">
				<h2 id="tasks-sheet-title" data-slot="sheet-title" class="font-semibold text-foreground"><span>{sheetTitle}</span><span>{' Task'}</span></h2>
				<p id="tasks-sheet-description" data-slot="sheet-description" class="text-sm text-muted-foreground"><span>{sheetDescription}</span><span>{"Click save when you're done."}</span></p>
			</div>
			<form id="tasks-form" class="flex-1 space-y-6 overflow-y-auto px-4" novalidate onSubmit={(event) => {
				event.preventDefault();
				submitted = true;
				const result = form.resolver(values);
				errors = result;
				if (Object.keys(result).length > 0) {
					focusFirstError(result);
				} else {
					const data = values;
					sheetOpen = false;
					closeDialog('tasks-sheet', false); blurActive();
					const id = `submitted-${Date.now()}`;
					toasts = message(toasts, id, 'You submitted the following values:', json(data));
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}
			}}>
				<div data-slot="form-item" class="grid gap-2">
					<label data-slot="form-label" class={FORM_LABEL} data-error={titleInvalid} for="tasks-form-title">Title</label>
					<input data-slot="form-control" class={INPUT} placeholder="Enter a title" id="tasks-form-title" aria-describedby={titleDescribedBy} aria-invalid={titleInvalid} value={values.title} name="title" onInput={(event) => {
						values.title = (event.target as HTMLInputElement).value;
						errors = revalidate(form, submitted, values, errors);
					}} />
					@if (titleError) {
						<p data-slot="form-message" id="tasks-form-title-message" class="text-sm text-destructive">{titleError}</p>
					}
				</div>
				<div data-slot="form-item" class="grid gap-2">
					<label data-slot="form-label" class={FORM_LABEL} data-error={statusInvalid} for="tasks-form-status" id="tasks-form-status-label">Status</label>
					<DropdownMenuTrigger menu="tasks-form-status" haspopup="listbox" role="combobox" aria-autocomplete="none" dir="ltr" data-placeholder={statusPlaceholder} slot="form-control" data-size="default" class={selectTriggerClass} aria-labelledby="tasks-form-status-label" aria-describedby={statusDescribedBy} aria-invalid={statusInvalid}>
						<span data-slot="select-value" style="pointer-events: none;">{statusValueText}</span>
						%%ICON:chevron-down:lucide lucide-chevron-down size-4 opacity-50%%
					</DropdownMenuTrigger>
					<select aria-hidden="true" tabindex="-1" style="position: absolute; border: 0px; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; overflow-wrap: normal;" value={values.status}>
						<option value=""></option>
						<option value="in progress">In Progress</option>
						<option value="backlog">Backlog</option>
						<option value="todo">Todo</option>
						<option value="canceled">Canceled</option>
						<option value="done">Done</option>
					</select>
					@if (statusError) {
						<p data-slot="form-message" id="tasks-form-status-message" class="text-sm text-destructive">{statusError}</p>
					}
				</div>
				<div data-slot="form-item" class="grid gap-2 relative">
					<label data-slot="form-label" class={FORM_LABEL} data-error={labelInvalid} for="tasks-form-label">Label</label>
					<div el={labelGroup} role="radiogroup" aria-required="false" dir="ltr" data-slot="form-control" class="gap-3 flex flex-col space-y-1" id="tasks-form-label" aria-describedby={labelDescribedBy} aria-invalid={labelInvalid} tabindex="0" style="outline: none;" onKeydown={(event) => {
						if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
							event.preventDefault();
							const next = radioKey(labelGroup, event.key);
							if (next) {
								values.label = next;
								errors = revalidate(form, submitted, values, errors);
							}
						}
					}}>
						@for (const o of labelOptionList; key o.value) {
							<div data-slot="form-item" class="gap-2 flex items-center">
								<button type="button" role="radio" aria-checked={o.checked ? 'true' : 'false'} data-state={o.checked ? 'checked' : 'unchecked'} value={o.value} data-slot="form-control" class={RADIO} id={o.first ? 'tasks-form-label-first' : `tasks-form-label-${o.value}`} aria-describedby={labelDescribedBy} aria-invalid={labelInvalid} tabindex={o.tab} data-radix-collection-item="" onClick={(event) => {
									values.label = radioValue(event.target);
									errors = revalidate(form, submitted, values, errors);
								}}>
									<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center" hidden={!o.checked}>%%ICON:circle:lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary%%</span>
								</button>
								<input aria-hidden="true" tabindex="-1" type="radio" value={o.value} checked={o.checked} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 16px; height: 16px;" />
								<label data-slot="form-label" class={RADIO_LABEL} data-error={labelInvalid} for={o.first ? 'tasks-form-label-first' : `tasks-form-label-${o.value}`}>{o.label}</label>
							</div>
						}
					</div>
					@if (labelError) {
						<p data-slot="form-message" id="tasks-form-label-message" class="text-sm text-destructive">{labelError}</p>
					}
				</div>
				<div data-slot="form-item" class="grid gap-2 relative">
					<label data-slot="form-label" class={FORM_LABEL} data-error={priorityInvalid} for="tasks-form-priority">Priority</label>
					<div el={priorityGroup} role="radiogroup" aria-required="false" dir="ltr" data-slot="form-control" class="gap-3 flex flex-col space-y-1" id="tasks-form-priority" aria-describedby={priorityDescribedBy} aria-invalid={priorityInvalid} tabindex="0" style="outline: none;" onKeydown={(event) => {
						if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
							event.preventDefault();
							const next = radioKey(priorityGroup, event.key);
							if (next) {
								values.priority = next;
								errors = revalidate(form, submitted, values, errors);
							}
						}
					}}>
						@for (const o of priorityOptionList; key o.value) {
							<div data-slot="form-item" class="gap-2 flex items-center">
								<button type="button" role="radio" aria-checked={o.checked ? 'true' : 'false'} data-state={o.checked ? 'checked' : 'unchecked'} value={o.value} data-slot="form-control" class={RADIO} id={o.first ? 'tasks-form-priority-first' : `tasks-form-priority-${o.value}`} aria-describedby={priorityDescribedBy} aria-invalid={priorityInvalid} tabindex={o.tab} data-radix-collection-item="" onClick={(event) => {
									values.priority = radioValue(event.target);
									errors = revalidate(form, submitted, values, errors);
								}}>
									<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center" hidden={!o.checked}>%%ICON:circle:lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary%%</span>
								</button>
								<input aria-hidden="true" tabindex="-1" type="radio" value={o.value} checked={o.checked} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 16px; height: 16px;" />
								<label data-slot="form-label" class={RADIO_LABEL} data-error={priorityInvalid} for={o.first ? 'tasks-form-priority-first' : `tasks-form-priority-${o.value}`}>{o.label}</label>
							</div>
						}
					</div>
					@if (priorityError) {
						<p data-slot="form-message" id="tasks-form-priority-message" class="text-sm text-destructive">{priorityError}</p>
					}
				</div>
			</form>
			<div data-slot="sheet-footer" class="mt-auto flex flex-col p-4 gap-2">
				<button data-slot="sheet-close" class={btn('outline', 'default')} type="button" onClick={() => { sheetOpen = false; closeDialog('tasks-sheet', false); blurActive(); }}>Close</button>
				<button data-slot="button" class={btn('default', 'default')} form="tasks-form" type="submit">Save changes</button>
			</div>
			<button type="button" class={SHEET_CLOSE_X} onClick={() => { sheetOpen = false; closeDialog('tasks-sheet', false); blurActive(); }}>
				%%ICON:x:lucide lucide-x size-4%%
				<span class="sr-only">Close</span>
			</button>
		</div>

		%%MACRO:FACET_POPOVER:status%%
		%%MACRO:FACET_POPOVER:priority%%
		%%MACRO:SORT_MENU:title%%
		%%MACRO:SORT_MENU:status%%
		%%MACRO:SORT_MENU:priority%%
		<DropdownMenuContent menu="view-options" modal={false} align="end" class="w-37.5">
			<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuCheckboxItem menu="view-options" class="capitalize" checked={titleShown} onSelect={() => { hidden = toggleValue(hidden, 'title'); }}>title</DropdownMenuCheckboxItem>
			<DropdownMenuCheckboxItem menu="view-options" class="capitalize" checked={statusShown} onSelect={() => { hidden = toggleValue(hidden, 'status'); }}>status</DropdownMenuCheckboxItem>
			<DropdownMenuCheckboxItem menu="view-options" class="capitalize" checked={priorityShown} onSelect={() => { hidden = toggleValue(hidden, 'priority'); }}>priority</DropdownMenuCheckboxItem>
		</DropdownMenuContent>
		<DropdownMenuContent menu="row-actions" modal={false} align="end" class="w-40">
			<DropdownMenuItem menu="row-actions" onSelect={() => {
				const task = taskAt(m.at);
				current = m.at;
				isUpdate = true;
				values = { title: task?.title ?? '', status: task?.status ?? '', label: task?.label ?? '', priority: task?.priority ?? '' };
				errors = {};
				submitted = false;
				sheetOpen = true;
				setTimeout(() => openDialog('tasks-sheet', { onDismiss: () => { if (m.open === '') { sheetOpen = false; closeDialog('tasks-sheet', false); blurActive(); } } }));
			}}>Edit</DropdownMenuItem>
			<DropdownMenuItem menu="row-actions" aria-disabled="true" data-disabled="">Make a copy</DropdownMenuItem>
			<DropdownMenuItem menu="row-actions" aria-disabled="true" data-disabled="">Favorite</DropdownMenuItem>
			<DropdownMenuSeparator />
			<div el={subTrigger} role="menuitem" id="tasks-labels-sub-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="tasks-labels-sub" data-state="closed" data-slot="dropdown-menu-sub-trigger" class={SUB_TRIGGER} tabindex="-1" data-orientation="vertical" data-radix-collection-item="" onPointerenter={() => openSub(subTrigger, false)} onClick={() => openSub(subTrigger, false)} onKeydown={(event) => {
				if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					openSub(subTrigger, true);
				}
			}}>
				Labels
				%%ICON:chevron-right:lucide lucide-chevron-right ms-auto size-4%%
			</div>
			<div data-radix-popper-content-wrapper="" dir="ltr" style="position: fixed; left: 0px; top: 0px; min-width: max-content; z-index: 50;" hidden>
				<div el={subContent} data-side="left" data-align="start" role="menu" aria-orientation="vertical" data-state="closed" data-radix-menu-content="" dir="ltr" id="tasks-labels-sub" aria-labelledby="tasks-labels-sub-trigger" data-slot="dropdown-menu-sub-content" class={SUB_CONTENT} tabindex="-1" data-orientation="vertical" onKeydown={(event) => {
					if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
						event.preventDefault();
						event.stopPropagation();
						if (event.key === 'ArrowLeft') closeSub(subTrigger, true);
						else subKey(subContent, event.key);
					}
				}}>
					<div role="group" data-slot="dropdown-menu-radio-group">
						@for (const l of labelItems; key l.value) {
							<div role="menuitemradio" aria-checked={l.checked ? 'true' : 'false'} data-slot="dropdown-menu-radio-item" class={RADIO_ITEM} data-state={l.checked ? 'checked' : 'unchecked'} tabindex="-1" data-orientation="vertical" data-radix-collection-item="" onClick={() => {
								closeSub(subTrigger, false);
								m.open = '';
								closeMenu(m.contents, m.triggers, 'row-actions', true);
							}}>
								<span class="pointer-events-none absolute inset-s-2 flex size-3.5 items-center justify-center">
									<span data-state="checked" hidden={!l.checked}>%%ICON:circle:lucide lucide-circle size-2 fill-current%%</span>
								</span>
								<span>{l.label}</span>
							</div>
						}
					</div>
				</div>
			</div>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="row-actions" onSelect={() => {
				current = m.at;
				deleteOpen = true;
				setTimeout(() => openDialog('tasks-delete-dialog', { alert: true, focus: document.getElementById('tasks-delete-cancel'), onDismiss: () => { deleteOpen = false; closeDialog('tasks-delete-dialog', false); blurActive(); } }));
			}}>
				Delete
				<DropdownMenuShortcut>%%ICON:trash2:lucide lucide-trash2 lucide-trash-2%%</DropdownMenuShortcut>
			</DropdownMenuItem>
		</DropdownMenuContent>
		<DropdownMenuContent menu="page-size" role="listbox" slot="select-content" side="top" align="start">
			<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">
				<SelectItem menu="page-size" selected={size10} onSelect={() => { page = pageAfterResize(page, pageSize, 10); pageSize = 10; pushPagination(page, pageSize); }}>10</SelectItem>
				<SelectItem menu="page-size" selected={size20} onSelect={() => { page = pageAfterResize(page, pageSize, 20); pageSize = 20; pushPagination(page, pageSize); }}>20</SelectItem>
				<SelectItem menu="page-size" selected={size30} onSelect={() => { page = pageAfterResize(page, pageSize, 30); pageSize = 30; pushPagination(page, pageSize); }}>30</SelectItem>
				<SelectItem menu="page-size" selected={size40} onSelect={() => { page = pageAfterResize(page, pageSize, 40); pageSize = 40; pushPagination(page, pageSize); }}>40</SelectItem>
				<SelectItem menu="page-size" selected={size50} onSelect={() => { page = pageAfterResize(page, pageSize, 50); pageSize = 50; pushPagination(page, pageSize); }}>50</SelectItem>
			</div>
		</DropdownMenuContent>
		<DropdownMenuContent menu="tasks-form-status" role="listbox" slot="select-content" align="start">
			<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">
				%%MACRO:STATUS_SELECT_ITEMS%%
			</div>
		</DropdownMenuContent>
		<DropdownMenuContent menu="bulk-status" sideOffset={14}>
			%%MACRO:BULK_STATUS_ITEMS%%
		</DropdownMenuContent>
		<DropdownMenuContent menu="bulk-priority" sideOffset={14}>
			%%MACRO:BULK_PRIORITY_ITEMS%%
		</DropdownMenuContent>
		<Toaster toasts={toasts} extra={true} />
	</Shell>
}
