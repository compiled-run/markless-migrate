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
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" aria-hidden="true"><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg>
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
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
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
							<DropdownMenuTrigger menu="filter-status" haspopup="dialog" slot="popover-trigger" class={facetTriggerClass}>
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-4"><path d="M7.49991 0.876892C3.84222 0.876892 0.877075 3.84204 0.877075 7.49972C0.877075 11.1574 3.84222 14.1226 7.49991 14.1226C11.1576 14.1226 14.1227 11.1574 14.1227 7.49972C14.1227 3.84204 11.1576 0.876892 7.49991 0.876892ZM1.82707 7.49972C1.82707 4.36671 4.36689 1.82689 7.49991 1.82689C10.6329 1.82689 13.1727 4.36671 13.1727 7.49972C13.1727 10.6327 10.6329 13.1726 7.49991 13.1726C4.36689 13.1726 1.82707 10.6327 1.82707 7.49972ZM7.50003 4C7.77617 4 8.00003 4.22386 8.00003 4.5V7H10.5C10.7762 7 11 7.22386 11 7.5C11 7.77614 10.7762 8 10.5 8H8.00003V10.5C8.00003 10.7761 7.77617 11 7.50003 11C7.22389 11 7.00003 10.7761 7.00003 10.5V8H4.50003C4.22389 8 4.00003 7.77614 4.00003 7.5C4.00003 7.22386 4.22389 7 4.50003 7H7.00003V4.5C7.00003 4.22386 7.22389 4 7.50003 4Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								Status
								<div data-orientation="vertical" role="none" data-slot="separator" class={`${SEPARATOR_V} mx-2 h-4`} hidden={statusNone}></div>
								<span data-slot="badge" class={badge('rounded-sm px-1 font-normal lg:hidden')} hidden={statusNone}>{statusCount}</span>
								<div class="hidden space-x-1 lg:flex" hidden={statusNone}>
									<span data-slot="badge" class={badge('rounded-sm px-1 font-normal')} hidden={statusFewOrNone}>{statusCountLabel}</span>
									@for (const option of statusOptions; key option.value) {
										<span data-slot="badge" class={badge('rounded-sm px-1 font-normal')} hidden={!option.selected || !statusFewOrNone}>{option.label}</span>
									}
								</div>
							</DropdownMenuTrigger>
							<DropdownMenuTrigger menu="filter-priority" haspopup="dialog" slot="popover-trigger" class={facetTriggerClass}>
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-4"><path d="M7.49991 0.876892C3.84222 0.876892 0.877075 3.84204 0.877075 7.49972C0.877075 11.1574 3.84222 14.1226 7.49991 14.1226C11.1576 14.1226 14.1227 11.1574 14.1227 7.49972C14.1227 3.84204 11.1576 0.876892 7.49991 0.876892ZM1.82707 7.49972C1.82707 4.36671 4.36689 1.82689 7.49991 1.82689C10.6329 1.82689 13.1727 4.36671 13.1727 7.49972C13.1727 10.6327 10.6329 13.1726 7.49991 13.1726C4.36689 13.1726 1.82707 10.6327 1.82707 7.49972ZM7.50003 4C7.77617 4 8.00003 4.22386 8.00003 4.5V7H10.5C10.7762 7 11 7.22386 11 7.5C11 7.77614 10.7762 8 10.5 8H8.00003V10.5C8.00003 10.7761 7.77617 11 7.50003 11C7.22389 11 7.00003 10.7761 7.00003 10.5V8H4.50003C4.22389 8 4.00003 7.77614 4.00003 7.5C4.00003 7.22386 4.22389 7 4.50003 7H7.00003V4.5C7.00003 4.22386 7.22389 4 7.50003 4Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								Priority
								<div data-orientation="vertical" role="none" data-slot="separator" class={`${SEPARATOR_V} mx-2 h-4`} hidden={priorityNone}></div>
								<span data-slot="badge" class={badge('rounded-sm px-1 font-normal lg:hidden')} hidden={priorityNone}>{priorityCount}</span>
								<div class="hidden space-x-1 lg:flex" hidden={priorityNone}>
									<span data-slot="badge" class={badge('rounded-sm px-1 font-normal')} hidden={priorityFewOrNone}>{priorityCountLabel}</span>
									@for (const option of priorityOptions; key option.value) {
										<span data-slot="badge" class={badge('rounded-sm px-1 font-normal')} hidden={!option.selected || !priorityFewOrNone}>{option.label}</span>
									}
								</div>
							</DropdownMenuTrigger>
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
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
							</button>
						}
					</div>
					<DropdownMenuTrigger menu="view-options" class={viewTriggerClass}>
						<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-4"><path d="M5.5 3C4.67157 3 4 3.67157 4 4.5C4 5.32843 4.67157 6 5.5 6C6.32843 6 7 5.32843 7 4.5C7 3.67157 6.32843 3 5.5 3ZM3 5C3.01671 5 3.03323 4.99918 3.04952 4.99758C3.28022 6.1399 4.28967 7 5.5 7C6.71033 7 7.71978 6.1399 7.95048 4.99758C7.96677 4.99918 7.98329 5 8 5H13.5C13.7761 5 14 4.77614 14 4.5C14 4.22386 13.7761 4 13.5 4H8C7.98329 4 7.96677 4.00082 7.95048 4.00242C7.71978 2.86009 6.71033 2 5.5 2C4.28967 2 3.28022 2.86009 3.04952 4.00242C3.03323 4.00082 3.01671 4 3 4H1.5C1.22386 4 1 4.22386 1 4.5C1 4.77614 1.22386 5 1.5 5H3ZM11.9505 10.9976C11.7198 12.1399 10.7103 13 9.5 13C8.28967 13 7.28022 12.1399 7.04952 10.9976C7.03323 10.9992 7.01671 11 7 11H1.5C1.22386 11 1 10.7761 1 10.5C1 10.2239 1.22386 10 1.5 10H7C7.01671 10 7.03323 10.0008 7.04952 10.0024C7.28022 8.8601 8.28967 8 9.5 8C10.7103 8 11.7198 8.8601 11.9505 10.0024C11.9668 10.0008 11.9833 10 12 10H13.5C13.7761 10 14 10.2239 14 10.5C14 10.7761 13.7761 11 13.5 11H12C11.9833 11 11.9668 10.9992 11.9505 10.9976ZM8 10.5C8 9.67157 8.67157 9 9.5 9C10.3284 9 11 9.67157 11 10.5C11 11.3284 10.3284 12 9.5 12C8.67157 12 8 11.3284 8 10.5Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
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
												<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
											}
										</button>
									</th>
									<th data-slot="table-head" class={TH} colspan="1">
										<div class="">Task</div>
									</th>
									<th data-slot="table-head" class={`${TH} ps-1 max-w-0 w-2/3`} colspan="1" hidden={titleColumnHidden}>
											<div class="flex items-center space-x-2">
												<DropdownMenuTrigger menu="sort-title" class={sortTriggerClass}>
													<span>Title</span>
													<svg hidden={sorting !== 'title:desc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
													<svg hidden={sorting !== 'title:asc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
													<svg hidden={sorting === 'title:asc' || sorting === 'title:desc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.35753 11.9939 7.64245 11.9939 7.81819 11.8182L10.0682 9.56819Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
												</DropdownMenuTrigger>
											</div>
									</th>
									<th data-slot="table-head" class={`${TH} ps-1`} colspan="1" hidden={statusColumnHidden}>
											<div class="flex items-center space-x-2">
												<DropdownMenuTrigger menu="sort-status" class={sortTriggerClass}>
													<span>Status</span>
													<svg hidden={sorting !== 'status:desc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
													<svg hidden={sorting !== 'status:asc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
													<svg hidden={sorting === 'status:asc' || sorting === 'status:desc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.35753 11.9939 7.64245 11.9939 7.81819 11.8182L10.0682 9.56819Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
												</DropdownMenuTrigger>
											</div>
									</th>
									<th data-slot="table-head" class={`${TH} ps-1`} colspan="1" hidden={priorityColumnHidden}>
											<div class="flex items-center space-x-2">
												<DropdownMenuTrigger menu="sort-priority" class={sortTriggerClass}>
													<span>Priority</span>
													<svg hidden={sorting !== 'priority:desc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
													<svg hidden={sorting !== 'priority:asc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
													<svg hidden={sorting === 'priority:asc' || sorting === 'priority:desc'} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.35753 11.9939 7.64245 11.9939 7.81819 11.8182L10.0682 9.56819Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
												</DropdownMenuTrigger>
											</div>
									</th>
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
												<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;" hidden={!hasValue(selected, r.key)}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
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
												<svg hidden={r.status !== 'backlog'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
												<svg hidden={r.status !== 'todo'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg>
												<svg hidden={r.status !== 'in progress'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" /></svg>
												<svg hidden={r.status !== 'done'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
												<svg hidden={r.status !== 'canceled'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="m2 2 20 20" /><path d="M8.35 2.69A10 10 0 0 1 21.3 15.65" /><path d="M19.08 19.08A10 10 0 1 1 4.92 4.92" /></svg>
												<span>{r.statusName}</span>
											</div>
										</td>
										<td data-slot="table-cell" class={`${TD} ps-3`} hidden={priorityColumnHidden}>
											<div class="flex items-center gap-2">
												<svg hidden={r.priority !== 'low'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
												<svg hidden={r.priority !== 'medium'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
												<svg hidden={r.priority !== 'high'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
												<svg hidden={r.priority !== 'critical'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
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
												<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM12.5 8.625C13.1213 8.625 13.625 8.12132 13.625 7.5C13.625 6.87868 13.1213 6.375 12.5 6.375C11.8787 6.375 11.375 6.87868 11.375 7.5C11.375 8.12132 11.8787 8.625 12.5 8.625Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
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
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
							</DropdownMenuTrigger>
							<p class="hidden text-sm font-medium sm:block">Rows per page</p>
						</div>
					</div>
					<div class="flex items-center sm:space-x-6 lg:space-x-8">
						<div class="flex w-25 items-center justify-center text-sm font-medium @max-3xl/content:hidden">{pageLabel}</div>
						<div class="flex items-center space-x-2">
							<button data-slot="button" class={btn('outline', 'default', 'size-8 p-0 @max-md/content:hidden')} disabled={cannotPrevious} onClick={() => { page = 1; pushPagination(page, pageSize); }}>
								<span class="sr-only">Go to first page</span>
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M6.85355 3.85355C7.04882 3.65829 7.04882 3.34171 6.85355 3.14645C6.65829 2.95118 6.34171 2.95118 6.14645 3.14645L2.14645 7.14645C1.95118 7.34171 1.95118 7.65829 2.14645 7.85355L6.14645 11.8536C6.34171 12.0488 6.65829 12.0488 6.85355 11.8536C7.04882 11.6583 7.04882 11.3417 6.85355 11.1464L3.20711 7.5L6.85355 3.85355ZM12.8536 3.85355C13.0488 3.65829 13.0488 3.34171 12.8536 3.14645C12.6583 2.95118 12.3417 2.95118 12.1464 3.14645L8.14645 7.14645C7.95118 7.34171 7.95118 7.65829 8.14645 7.85355L12.1464 11.8536C12.3417 12.0488 12.6583 12.0488 12.8536 11.8536C13.0488 11.6583 13.0488 11.3417 12.8536 11.1464L9.20711 7.5L12.8536 3.85355Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
							</button>
							<button data-slot="button" class={btn('outline', 'default', 'size-8 p-0')} disabled={cannotPrevious} onClick={() => { page = Math.max(1, page - 1); pushPagination(page, pageSize); }}>
								<span class="sr-only">Go to previous page</span>
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M8.84182 3.13514C9.04327 3.32401 9.05348 3.64042 8.86462 3.84188L5.43521 7.49991L8.86462 11.1579C9.05348 11.3594 9.04327 11.6758 8.84182 11.8647C8.64036 12.0535 8.32394 12.0433 8.13508 11.8419L4.38508 7.84188C4.20477 7.64955 4.20477 7.35027 4.38508 7.15794L8.13508 3.15794C8.32394 2.95648 8.64036 2.94628 8.84182 3.13514Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
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
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M6.1584 3.13508C6.35985 2.94621 6.67627 2.95642 6.86514 3.15788L10.6151 7.15788C10.7954 7.3502 10.7954 7.64949 10.6151 7.84182L6.86514 11.8418C6.67627 12.0433 6.35985 12.0535 6.1584 11.8646C5.95694 11.6757 5.94673 11.3593 6.1356 11.1579L9.565 7.49985L6.1356 3.84182C5.94673 3.64036 5.95694 3.32394 6.1584 3.13508Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
							</button>
							<button data-slot="button" class={btn('outline', 'default', 'size-8 p-0 @max-md/content:hidden')} disabled={cannotNext} onClick={() => { page = pageCountFor({ sorting, filter, status, priority, page, pageSize, selected, hidden }); pushPagination(page, pageSize); }}>
								<span class="sr-only">Go to last page</span>
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M2.14645 11.1464C1.95118 11.3417 1.95118 11.6583 2.14645 11.8536C2.34171 12.0488 2.65829 12.0488 2.85355 11.8536L6.85355 7.85355C7.04882 7.65829 7.04882 7.34171 6.85355 7.14645L2.85355 3.14645C2.65829 2.95118 2.34171 2.95118 2.14645 3.14645C1.95118 3.34171 1.95118 3.65829 2.14645 3.85355L5.79289 7.5L2.14645 11.1464ZM8.14645 11.1464C7.95118 11.3417 7.95118 11.6583 8.14645 11.8536C8.34171 12.0488 8.65829 12.0488 8.85355 11.8536L12.8536 7.85355C13.0488 7.65829 13.0488 7.34171 12.8536 7.14645L8.85355 3.14645C8.65829 2.95118 8.34171 2.95118 8.14645 3.14645C7.95118 3.34171 7.95118 3.65829 8.14645 3.85355L11.7929 7.5L8.14645 11.1464Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
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
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
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
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-arrow-up" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m16 12-4-4-4 4" /><path d="M12 16V8" /></svg>
							<span class="sr-only">Update status</span>
						</DropdownMenuTrigger>
						<DropdownMenuTrigger menu="bulk-priority" slot="tooltip-trigger" class={bulkTriggerClass} aria-label="Update priority" title="Update priority">
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down" aria-hidden="true"><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></svg>
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
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" aria-hidden="true"><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg>
							<span class="sr-only">Export tasks</span>
						</button>
						<button data-slot="tooltip-trigger" class={btn('destructive', 'icon', 'size-8')} aria-label="Delete selected tasks" title="Delete selected tasks" data-state="closed" onClick={() => {
							multiOpen = true;
							openDialog('tasks-multi-delete-dialog', { alert: true, focus: document.getElementById('tasks-multi-delete-input'), onDismiss: () => { multiOpen = false; closeDialog('tasks-multi-delete-dialog', false); blurActive(); } });
						}}>
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
							<span class="sr-only">Delete selected tasks</span>
						</button>
					</div>
				</div>
			</div>
		</main>

		<div data-state="closed" data-slot="alert-dialog-overlay" class={OVERLAY} style="pointer-events: auto;" hidden></div>
		<div role="alertdialog" id="tasks-delete-dialog" aria-describedby="tasks-delete-description" aria-labelledby="tasks-delete-title" data-state="closed" data-slot="alert-dialog-content" class={`${ALERT_CONTENT} max-w-md`} tabindex="-1" style="pointer-events: auto;" hidden>
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

		<div data-state="closed" data-slot="alert-dialog-overlay" class={OVERLAY} style="pointer-events: auto;" hidden></div>
		<div role="alertdialog" id="tasks-multi-delete-dialog" aria-describedby="tasks-multi-delete-description" aria-labelledby="tasks-multi-delete-title" data-state="closed" data-slot="alert-dialog-content" class={`${ALERT_CONTENT} max-w-[calc(100%-2rem)]`} tabindex="-1" style="pointer-events: auto;" hidden>
			<div data-slot="alert-dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
				<h2 id="tasks-multi-delete-title" data-slot="alert-dialog-title" class="text-lg font-semibold">
					<span class="text-destructive">
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert me-1 inline-block stroke-destructive" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
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

		<div data-state="closed" data-slot="dialog-overlay" class={OVERLAY} hidden></div>
		<div role="dialog" id="tasks-import-dialog" aria-describedby="tasks-import-description" aria-labelledby="tasks-import-title" data-state="closed" data-slot="dialog-content" class={DIALOG_CONTENT} tabindex="-1" style="pointer-events: auto;" hidden>
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
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
				<span class="sr-only">Close</span>
			</button>
		</div>

		<div data-state="closed" data-slot="sheet-overlay" class={OVERLAY} hidden></div>
		<div role="dialog" id="tasks-sheet" aria-describedby="tasks-sheet-description" aria-labelledby="tasks-sheet-title" data-state="closed" data-slot="sheet-content" class={SHEET_CONTENT} tabindex="-1" style="pointer-events: auto;" hidden>
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
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
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
									<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center" hidden={!o.checked}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg></span>
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
									<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center" hidden={!o.checked}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg></span>
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
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x size-4" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
				<span class="sr-only">Close</span>
			</button>
		</div>

		<PopoverContent menu="filter-status" align="start" class="w-50 p-0">
			<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground" cmdk-root="" id="filter-status-command" onKeydown={(event) => {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
					moveIn(document.getElementById('filter-status-command'), event.key);
				}
				const option = event.key === 'Enter' ? chosenIn(document.getElementById('filter-status-command')) : undefined;
				if (option) {
					status = option === 'clear' ? '' : toggleValue(status, option);
					page = 1;
					pushFilters(status, priority);
				}
			}}>
				<label cmdk-label="" for="filter-status-input" id="filter-status-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
				<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0 opacity-50" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
					<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Status" cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="filter-status-list" aria-labelledby="filter-status-label" id="filter-status-input" type="text" value="" onInput={(event) => filterIn(document.getElementById('filter-status-command'), (event.target as HTMLInputElement).value)} />
				</div>
				<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="filter-status-list" onClick={(event) => {
					selectPressed(event.target);
					const option = chosenIn(document.getElementById('filter-status-command'), event.target);
					if (option) {
						status = option === 'clear' ? '' : toggleValue(status, option);
						page = 1;
						pushFilters(status, priority);
					}
				}}>
					<div cmdk-list-sizer="">
						<div cmdk-empty="" role="presentation" data-slot="command-empty" class="py-6 text-center text-sm" hidden>No results found.</div>
						<div data-slot="command-group" class={COMMAND_GROUP} cmdk-group="" role="presentation" data-value="undefined">
							<div cmdk-group-items="" role="group">
								@for (const option of statusOptions; key option.value) {
									<div data-slot="command-item" class={COMMAND_ITEM} id={`filter-status-${option.value.replace(' ', '-')}`} cmdk-item="" role="option" aria-disabled="false" data-disabled="false" data-value={option.label + option.count} data-option={option.value}>
										<div class={option.selected ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'}>
											<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
										</div>
										<svg hidden={option.value !== 'backlog'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
									<svg hidden={option.value !== 'todo'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg>
									<svg hidden={option.value !== 'in progress'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" /></svg>
									<svg hidden={option.value !== 'done'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
									<svg hidden={option.value !== 'canceled'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="m2 2 20 20" /><path d="M8.35 2.69A10 10 0 0 1 21.3 15.65" /><path d="M19.08 19.08A10 10 0 1 1 4.92 4.92" /></svg>
										<span>{option.label}</span>
										<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={option.count === ''}>{option.count}</span>
									</div>
								}
							</div>
						</div>
						<div data-slot="command-separator" class="-mx-1 h-px bg-border" cmdk-separator={statusNone ? undefined : ''} role="separator" hidden={statusNone}></div>
						<div data-slot="command-group" class={COMMAND_GROUP} cmdk-group="" role="presentation" data-value="undefined" hidden={statusNone}>
							<div cmdk-group-items="" role="group">
								<div data-slot="command-item" class={`${COMMAND_ITEM} justify-center text-center`} id="filter-status-clear" cmdk-item={statusNone ? undefined : ''} role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Clear filters" data-option="clear">Clear filters</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</PopoverContent>
		<PopoverContent menu="filter-priority" align="start" class="w-50 p-0">
			<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground" cmdk-root="" id="filter-priority-command" onKeydown={(event) => {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
					moveIn(document.getElementById('filter-priority-command'), event.key);
				}
				const option = event.key === 'Enter' ? chosenIn(document.getElementById('filter-priority-command')) : undefined;
				if (option) {
					priority = option === 'clear' ? '' : toggleValue(priority, option);
					page = 1;
					pushFilters(status, priority);
				}
			}}>
				<label cmdk-label="" for="filter-priority-input" id="filter-priority-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
				<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0 opacity-50" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
					<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Priority" cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="filter-priority-list" aria-labelledby="filter-priority-label" id="filter-priority-input" type="text" value="" onInput={(event) => filterIn(document.getElementById('filter-priority-command'), (event.target as HTMLInputElement).value)} />
				</div>
				<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="filter-priority-list" onClick={(event) => {
					selectPressed(event.target);
					const option = chosenIn(document.getElementById('filter-priority-command'), event.target);
					if (option) {
						priority = option === 'clear' ? '' : toggleValue(priority, option);
						page = 1;
						pushFilters(status, priority);
					}
				}}>
					<div cmdk-list-sizer="">
						<div cmdk-empty="" role="presentation" data-slot="command-empty" class="py-6 text-center text-sm" hidden>No results found.</div>
						<div data-slot="command-group" class={COMMAND_GROUP} cmdk-group="" role="presentation" data-value="undefined">
							<div cmdk-group-items="" role="group">
								@for (const option of priorityOptions; key option.value) {
									<div data-slot="command-item" class={COMMAND_ITEM} id={`filter-priority-${option.value.replace(' ', '-')}`} cmdk-item="" role="option" aria-disabled="false" data-disabled="false" data-value={option.label + option.count} data-option={option.value}>
										<div class={option.selected ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'}>
											<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
										</div>
										<svg hidden={option.value !== 'low'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
									<svg hidden={option.value !== 'medium'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
									<svg hidden={option.value !== 'high'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
									<svg hidden={option.value !== 'critical'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
										<span>{option.label}</span>
										<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={option.count === ''}>{option.count}</span>
									</div>
								}
							</div>
						</div>
						<div data-slot="command-separator" class="-mx-1 h-px bg-border" cmdk-separator={priorityNone ? undefined : ''} role="separator" hidden={priorityNone}></div>
						<div data-slot="command-group" class={COMMAND_GROUP} cmdk-group="" role="presentation" data-value="undefined" hidden={priorityNone}>
							<div cmdk-group-items="" role="group">
								<div data-slot="command-item" class={`${COMMAND_ITEM} justify-center text-center`} id="filter-priority-clear" cmdk-item={priorityNone ? undefined : ''} role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Clear filters" data-option="clear">Clear filters</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</PopoverContent>
		<DropdownMenuContent menu="sort-title" align="start">
			<DropdownMenuItem menu="sort-title" onSelect={() => { sorting = 'title:asc'; }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Asc
			</DropdownMenuItem>
			<DropdownMenuItem menu="sort-title" onSelect={() => { sorting = 'title:desc'; }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Desc
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="sort-title" onSelect={() => { hidden = hasValue(hidden, 'title') ? hidden : toggleValue(hidden, 'title'); }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M13.3536 2.35355C13.5488 2.15829 13.5488 1.84171 13.3536 1.64645C13.1583 1.45118 12.8417 1.45118 12.6464 1.64645L10.6828 3.61012C9.70652 3.21671 8.63759 3 7.5 3C4.30786 3 1.65639 4.70638 0.0760002 7.23501C-0.0253338 7.39715 -0.0253334 7.60288 0.0760014 7.76501C0.902945 9.08812 2.02314 10.1861 3.36061 10.9323L1.64645 12.6464C1.45118 12.8417 1.45118 13.1583 1.64645 13.3536C1.84171 13.5488 2.15829 13.5488 2.35355 13.3536L4.31723 11.3899C5.29348 11.7833 6.36241 12 7.5 12C10.6921 12 13.3436 10.2936 14.924 7.76501C15.0253 7.60288 15.0253 7.39715 14.924 7.23501C14.0971 5.9119 12.9769 4.81391 11.6394 4.06771L13.3536 2.35355ZM9.90428 4.38861C9.15332 4.1361 8.34759 4 7.5 4C4.80285 4 2.52952 5.37816 1.09622 7.50001C1.87284 8.6497 2.89609 9.58106 4.09974 10.1931L9.90428 4.38861ZM5.09572 10.6114L10.9003 4.80685C12.1039 5.41894 13.1272 6.35031 13.9038 7.50001C12.4705 9.62183 10.1971 11 7.5 11C6.65241 11 5.84668 10.8639 5.09572 10.6114Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Hide
			</DropdownMenuItem>
		</DropdownMenuContent>
		<DropdownMenuContent menu="sort-status" align="start">
			<DropdownMenuItem menu="sort-status" onSelect={() => { sorting = 'status:asc'; }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Asc
			</DropdownMenuItem>
			<DropdownMenuItem menu="sort-status" onSelect={() => { sorting = 'status:desc'; }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Desc
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="sort-status" onSelect={() => { hidden = hasValue(hidden, 'status') ? hidden : toggleValue(hidden, 'status'); }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M13.3536 2.35355C13.5488 2.15829 13.5488 1.84171 13.3536 1.64645C13.1583 1.45118 12.8417 1.45118 12.6464 1.64645L10.6828 3.61012C9.70652 3.21671 8.63759 3 7.5 3C4.30786 3 1.65639 4.70638 0.0760002 7.23501C-0.0253338 7.39715 -0.0253334 7.60288 0.0760014 7.76501C0.902945 9.08812 2.02314 10.1861 3.36061 10.9323L1.64645 12.6464C1.45118 12.8417 1.45118 13.1583 1.64645 13.3536C1.84171 13.5488 2.15829 13.5488 2.35355 13.3536L4.31723 11.3899C5.29348 11.7833 6.36241 12 7.5 12C10.6921 12 13.3436 10.2936 14.924 7.76501C15.0253 7.60288 15.0253 7.39715 14.924 7.23501C14.0971 5.9119 12.9769 4.81391 11.6394 4.06771L13.3536 2.35355ZM9.90428 4.38861C9.15332 4.1361 8.34759 4 7.5 4C4.80285 4 2.52952 5.37816 1.09622 7.50001C1.87284 8.6497 2.89609 9.58106 4.09974 10.1931L9.90428 4.38861ZM5.09572 10.6114L10.9003 4.80685C12.1039 5.41894 13.1272 6.35031 13.9038 7.50001C12.4705 9.62183 10.1971 11 7.5 11C6.65241 11 5.84668 10.8639 5.09572 10.6114Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Hide
			</DropdownMenuItem>
		</DropdownMenuContent>
		<DropdownMenuContent menu="sort-priority" align="start">
			<DropdownMenuItem menu="sort-priority" onSelect={() => { sorting = 'priority:asc'; }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Asc
			</DropdownMenuItem>
			<DropdownMenuItem menu="sort-priority" onSelect={() => { sorting = 'priority:desc'; }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Desc
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem menu="sort-priority" onSelect={() => { hidden = hasValue(hidden, 'priority') ? hidden : toggleValue(hidden, 'priority'); }}>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M13.3536 2.35355C13.5488 2.15829 13.5488 1.84171 13.3536 1.64645C13.1583 1.45118 12.8417 1.45118 12.6464 1.64645L10.6828 3.61012C9.70652 3.21671 8.63759 3 7.5 3C4.30786 3 1.65639 4.70638 0.0760002 7.23501C-0.0253338 7.39715 -0.0253334 7.60288 0.0760014 7.76501C0.902945 9.08812 2.02314 10.1861 3.36061 10.9323L1.64645 12.6464C1.45118 12.8417 1.45118 13.1583 1.64645 13.3536C1.84171 13.5488 2.15829 13.5488 2.35355 13.3536L4.31723 11.3899C5.29348 11.7833 6.36241 12 7.5 12C10.6921 12 13.3436 10.2936 14.924 7.76501C15.0253 7.60288 15.0253 7.39715 14.924 7.23501C14.0971 5.9119 12.9769 4.81391 11.6394 4.06771L13.3536 2.35355ZM9.90428 4.38861C9.15332 4.1361 8.34759 4 7.5 4C4.80285 4 2.52952 5.37816 1.09622 7.50001C1.87284 8.6497 2.89609 9.58106 4.09974 10.1931L9.90428 4.38861ZM5.09572 10.6114L10.9003 4.80685C12.1039 5.41894 13.1272 6.35031 13.9038 7.50001C12.4705 9.62183 10.1971 11 7.5 11C6.65241 11 5.84668 10.8639 5.09572 10.6114Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				Hide
			</DropdownMenuItem>
		</DropdownMenuContent>
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
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ms-auto size-4" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
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
									<span data-state="checked" hidden={!l.checked}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle size-2 fill-current" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg></span>
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
				<DropdownMenuShortcut><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></DropdownMenuShortcut>
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
				<SelectItem menu="tasks-form-status" selected={statusInProgressSelected} onSelect={() => { values.status = 'in progress'; errors = revalidate(form, submitted, values, errors); }}>In Progress</SelectItem>
				<SelectItem menu="tasks-form-status" selected={statusBacklogSelected} onSelect={() => { values.status = 'backlog'; errors = revalidate(form, submitted, values, errors); }}>Backlog</SelectItem>
				<SelectItem menu="tasks-form-status" selected={statusTodoSelected} onSelect={() => { values.status = 'todo'; errors = revalidate(form, submitted, values, errors); }}>Todo</SelectItem>
				<SelectItem menu="tasks-form-status" selected={statusCanceledSelected} onSelect={() => { values.status = 'canceled'; errors = revalidate(form, submitted, values, errors); }}>Canceled</SelectItem>
				<SelectItem menu="tasks-form-status" selected={statusDoneSelected} onSelect={() => { values.status = 'done'; errors = revalidate(form, submitted, values, errors); }}>Done</SelectItem>
			</div>
		</DropdownMenuContent>
		<DropdownMenuContent menu="bulk-status" sideOffset={14}>
			<DropdownMenuItem menu="bulk-status" defaultValue="backlog" onSelect={() => {
				const n = count;
				const id = `bulk-status-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating status...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Status updated to "backlog" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
				Backlog
			</DropdownMenuItem>
			<DropdownMenuItem menu="bulk-status" defaultValue="todo" onSelect={() => {
				const n = count;
				const id = `bulk-status-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating status...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Status updated to "todo" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg>
				Todo
			</DropdownMenuItem>
			<DropdownMenuItem menu="bulk-status" defaultValue="in progress" onSelect={() => {
				const n = count;
				const id = `bulk-status-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating status...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Status updated to "in progress" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" /></svg>
				In Progress
			</DropdownMenuItem>
			<DropdownMenuItem menu="bulk-status" defaultValue="done" onSelect={() => {
				const n = count;
				const id = `bulk-status-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating status...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Status updated to "done" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
				Done
			</DropdownMenuItem>
			<DropdownMenuItem menu="bulk-status" defaultValue="canceled" onSelect={() => {
				const n = count;
				const id = `bulk-status-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating status...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Status updated to "canceled" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="m2 2 20 20" /><path d="M8.35 2.69A10 10 0 0 1 21.3 15.65" /><path d="M19.08 19.08A10 10 0 1 1 4.92 4.92" /></svg>
				Canceled
			</DropdownMenuItem>
		</DropdownMenuContent>
		<DropdownMenuContent menu="bulk-priority" sideOffset={14}>
			<DropdownMenuItem menu="bulk-priority" defaultValue="low" onSelect={() => {
				const n = count;
				const id = `bulk-priority-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating priority...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Priority updated to "low" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
				Low
			</DropdownMenuItem>
			<DropdownMenuItem menu="bulk-priority" defaultValue="medium" onSelect={() => {
				const n = count;
				const id = `bulk-priority-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating priority...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Priority updated to "medium" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
				Medium
			</DropdownMenuItem>
			<DropdownMenuItem menu="bulk-priority" defaultValue="high" onSelect={() => {
				const n = count;
				const id = `bulk-priority-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating priority...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Priority updated to "high" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
				High
			</DropdownMenuItem>
			<DropdownMenuItem menu="bulk-priority" defaultValue="critical" onSelect={() => {
				const n = count;
				const id = `bulk-priority-${Date.now()}`;
				toasts = promiseLoading(toasts, id, 'Updating priority...');
				selected = '';
				setTimeout(() => {
					toasts = promiseSuccess(toasts, id, `Priority updated to "critical" for ${n} task${n > 1 ? 's' : ''}.`);
					setTimeout(() => { toasts = expired(toasts, id); }, DURATION);
				}, 2000);
			}}>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
				Critical
			</DropdownMenuItem>
		</DropdownMenuContent>
		<Toaster toasts={toasts} extra={true} />
	</Shell>
}
