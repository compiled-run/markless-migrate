// The users page (features/users): the table over @tanstack/table-core (lib/users-table.ts), its toolbar,
// faceted filters, column menus, pagination and bulk actions, the row actions menu and the delete dialog.
// Written by deploy/shadcn-admin/scripts/gen-users.py from the old app's rendered DOM: the rows and page
// buttons are fixed slots (Markless 0.4.0 does not update an @for over a computed list), one UserRow per row.
import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Shell } from '../components/layout/shell.tsrx';
import { UserRow } from '../components/users/user-row.tsrx';
import { chosenIn, filterIn, moveIn } from '../lib/parity/cmdk/behaviour.ts';
import { DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger, menus, PopoverContent, SelectItem } from '../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { DURATION, expired, message, promiseLoading, promiseSuccess, type Toast } from '../lib/parity/sonner/index.ts';
import { Toaster } from '../lib/parity/sonner/toaster.tsrx';
import { closeConfirm, escapeClears, moveToolbarFocus, openConfirm } from '../lib/users-behaviour.ts';
import { announcementFor, countOf, field, deleteSummary, facet, fromSearch, hasValue, hiddenColumns, lastPage, pageAtSlot, pageField, pushSearch, rowSlot, tableModel, toggleAllOnPage, toggleRow, toggleValue, userAt } from '../lib/parity/tanstack-react-table/users-table.ts';

export default function Users({ url }: PageProps) @{
	const initial = fromSearch(url.search);
	let sorting = state('');
	let username = state(initial.username);
	let status = state(initial.status);
	let role = state(initial.role);
	let page = state(initial.page);
	let pageSize = state(initial.pageSize);
	let selected = state('');
	let hidden = state('');
	const m = menus();
	let deleteOpen = state(false);
	let deleteValue = state('');
	let deleteName = state('');
	let deleteRole = state('');
	let announcement = state('');
	let toasts = state<Toast[]>([]);

	const model = computed(() => tableModel({ sorting, username, status, role, page, pageSize, selected, hidden }));
	const rows = computed(() => model.rows);
	const tableClass = computed(() => `w-full caption-bottom text-sm ${hiddenColumns(hidden)}`);
	const headerChecked = computed(() => model.headerChecked);
	const headerState = computed(() => model.headerState);
	const headerUnchecked = computed(() => model.headerChecked === 'false');
	const hasRows = computed(() => field(model.rows, 0, 'shown') === true);
	const notFiltered = computed(() => !model.filtered);
	const pageLabel = computed(() => model.pageLabel);
	const cannotPrevious = computed(() => !model.canPrevious);
	const cannotNext = computed(() => !model.canNext);
	const pageSizeLabel = computed(() => String(pageSize));
	const usernameNotAsc = computed(() => sorting !== 'username:asc');
	const usernameNotDesc = computed(() => sorting !== 'username:desc');
	const usernameSorted = computed(() => sorting === 'username:asc' || sorting === 'username:desc');
	const emailNotAsc = computed(() => sorting !== 'email:asc');
	const emailNotDesc = computed(() => sorting !== 'email:desc');
	const emailSorted = computed(() => sorting === 'email:asc' || sorting === 'email:desc');
	const emailShown = computed(() => (hasValue(hidden, 'email') ? 'false' : 'true'));
	const phoneShown = computed(() => (hasValue(hidden, 'phoneNumber') ? 'false' : 'true'));
	const size10 = computed(() => (pageSize === 10 ? 'true' : 'false'));
	const size20 = computed(() => (pageSize === 20 ? 'true' : 'false'));
	const size30 = computed(() => (pageSize === 30 ? 'true' : 'false'));
	const size40 = computed(() => (pageSize === 40 ? 'true' : 'false'));
	const size50 = computed(() => (pageSize === 50 ? 'true' : 'false'));
	const noSelection = computed(() => countOf(selected) === 0);
	const selectedCount = computed(() => String(countOf(selected)));
	const selectedCountLabel = computed(() => `${countOf(selected)} selected`);
	const selectedNoun = computed(() => (countOf(selected) > 1 ? 'users' : 'user'));
	const toolbarLabel = computed(() => `Bulk actions for ${countOf(selected)} selected user${countOf(selected) > 1 ? 's' : ''}`);
	const deleteClosed = computed(() => !deleteOpen);
	const deleteState = computed(() => (deleteOpen ? 'open' : 'closed'));
	const deleteDisabled = computed(() => deleteValue.trim() !== deleteName);
	const deleteRoleUpper = computed(() => deleteRole.toUpperCase());
	const statusNone = computed(() => countOf(status) === 0);
	const statusCount = computed(() => String(countOf(status)));
	const statusFewOrNone = computed(() => countOf(status) <= 2);
	const statusCountLabel = computed(() => `${countOf(status)} selected`);
	const statusActiveNoBadge = computed(() => countOf(status) > 2 || !hasValue(status, 'active'));
	const statusActiveBoxClass = computed(() => (hasValue(status, 'active') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));
	const statusActiveFacet = computed(() => facet(model, 'status', 'active'));
	const statusActiveNoFacet = computed(() => facet(model, 'status', 'active') === '');
	const statusActiveValue = computed(() => 'Active' + facet(model, 'status', 'active'));
	const statusInactiveNoBadge = computed(() => countOf(status) > 2 || !hasValue(status, 'inactive'));
	const statusInactiveBoxClass = computed(() => (hasValue(status, 'inactive') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));
	const statusInactiveFacet = computed(() => facet(model, 'status', 'inactive'));
	const statusInactiveNoFacet = computed(() => facet(model, 'status', 'inactive') === '');
	const statusInactiveValue = computed(() => 'Inactive' + facet(model, 'status', 'inactive'));
	const statusInvitedNoBadge = computed(() => countOf(status) > 2 || !hasValue(status, 'invited'));
	const statusInvitedBoxClass = computed(() => (hasValue(status, 'invited') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));
	const statusInvitedFacet = computed(() => facet(model, 'status', 'invited'));
	const statusInvitedNoFacet = computed(() => facet(model, 'status', 'invited') === '');
	const statusInvitedValue = computed(() => 'Invited' + facet(model, 'status', 'invited'));
	const statusSuspendedNoBadge = computed(() => countOf(status) > 2 || !hasValue(status, 'suspended'));
	const statusSuspendedBoxClass = computed(() => (hasValue(status, 'suspended') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));
	const statusSuspendedFacet = computed(() => facet(model, 'status', 'suspended'));
	const statusSuspendedNoFacet = computed(() => facet(model, 'status', 'suspended') === '');
	const statusSuspendedValue = computed(() => 'Suspended' + facet(model, 'status', 'suspended'));
	const roleNone = computed(() => countOf(role) === 0);
	const roleCount = computed(() => String(countOf(role)));
	const roleFewOrNone = computed(() => countOf(role) <= 2);
	const roleCountLabel = computed(() => `${countOf(role)} selected`);
	const roleSuperadminNoBadge = computed(() => countOf(role) > 2 || !hasValue(role, 'superadmin'));
	const roleSuperadminBoxClass = computed(() => (hasValue(role, 'superadmin') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));
	const roleSuperadminFacet = computed(() => facet(model, 'role', 'superadmin'));
	const roleSuperadminNoFacet = computed(() => facet(model, 'role', 'superadmin') === '');
	const roleSuperadminValue = computed(() => 'Superadmin' + facet(model, 'role', 'superadmin'));
	const roleAdminNoBadge = computed(() => countOf(role) > 2 || !hasValue(role, 'admin'));
	const roleAdminBoxClass = computed(() => (hasValue(role, 'admin') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));
	const roleAdminFacet = computed(() => facet(model, 'role', 'admin'));
	const roleAdminNoFacet = computed(() => facet(model, 'role', 'admin') === '');
	const roleAdminValue = computed(() => 'Admin' + facet(model, 'role', 'admin'));
	const roleManagerNoBadge = computed(() => countOf(role) > 2 || !hasValue(role, 'manager'));
	const roleManagerBoxClass = computed(() => (hasValue(role, 'manager') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));
	const roleManagerFacet = computed(() => facet(model, 'role', 'manager'));
	const roleManagerNoFacet = computed(() => facet(model, 'role', 'manager') === '');
	const roleManagerValue = computed(() => 'Manager' + facet(model, 'role', 'manager'));
	const roleCashierNoBadge = computed(() => countOf(role) > 2 || !hasValue(role, 'cashier'));
	const roleCashierBoxClass = computed(() => (hasValue(role, 'cashier') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));
	const roleCashierFacet = computed(() => facet(model, 'role', 'cashier'));
	const roleCashierNoFacet = computed(() => facet(model, 'role', 'cashier') === '');
	const roleCashierValue = computed(() => 'Cashier' + facet(model, 'role', 'cashier'));
	const page0Hidden = computed(() => !pageField(model.pages, 0, 'shown'));
	const page0Ellipsis = computed(() => pageField(model.pages, 0, 'ellipsis') === true);
	const page0NotEllipsis = computed(() => pageField(model.pages, 0, 'ellipsis') !== true);
	const page0Class = computed(() => pageField(model.pages, 0, 'className'));
	const page0Label = computed(() => `Go to page ${pageField(model.pages, 0, 'label')}`);
	const page0Number = computed(() => pageField(model.pages, 0, 'label'));
	const page1Hidden = computed(() => !pageField(model.pages, 1, 'shown'));
	const page1Ellipsis = computed(() => pageField(model.pages, 1, 'ellipsis') === true);
	const page1NotEllipsis = computed(() => pageField(model.pages, 1, 'ellipsis') !== true);
	const page1Class = computed(() => pageField(model.pages, 1, 'className'));
	const page1Label = computed(() => `Go to page ${pageField(model.pages, 1, 'label')}`);
	const page1Number = computed(() => pageField(model.pages, 1, 'label'));
	const page2Hidden = computed(() => !pageField(model.pages, 2, 'shown'));
	const page2Ellipsis = computed(() => pageField(model.pages, 2, 'ellipsis') === true);
	const page2NotEllipsis = computed(() => pageField(model.pages, 2, 'ellipsis') !== true);
	const page2Class = computed(() => pageField(model.pages, 2, 'className'));
	const page2Label = computed(() => `Go to page ${pageField(model.pages, 2, 'label')}`);
	const page2Number = computed(() => pageField(model.pages, 2, 'label'));
	const page3Hidden = computed(() => !pageField(model.pages, 3, 'shown'));
	const page3Ellipsis = computed(() => pageField(model.pages, 3, 'ellipsis') === true);
	const page3NotEllipsis = computed(() => pageField(model.pages, 3, 'ellipsis') !== true);
	const page3Class = computed(() => pageField(model.pages, 3, 'className'));
	const page3Label = computed(() => `Go to page ${pageField(model.pages, 3, 'label')}`);
	const page3Number = computed(() => pageField(model.pages, 3, 'label'));
	const page4Hidden = computed(() => !pageField(model.pages, 4, 'shown'));
	const page4Ellipsis = computed(() => pageField(model.pages, 4, 'ellipsis') === true);
	const page4NotEllipsis = computed(() => pageField(model.pages, 4, 'ellipsis') !== true);
	const page4Class = computed(() => pageField(model.pages, 4, 'className'));
	const page4Label = computed(() => `Go to page ${pageField(model.pages, 4, 'label')}`);
	const page4Number = computed(() => pageField(model.pages, 4, 'label'));
	const page5Hidden = computed(() => !pageField(model.pages, 5, 'shown'));
	const page5Ellipsis = computed(() => pageField(model.pages, 5, 'ellipsis') === true);
	const page5NotEllipsis = computed(() => pageField(model.pages, 5, 'ellipsis') !== true);
	const page5Class = computed(() => pageField(model.pages, 5, 'className'));
	const page5Label = computed(() => `Go to page ${pageField(model.pages, 5, 'label')}`);
	const page5Number = computed(() => pageField(model.pages, 5, 'label'));
	const page6Hidden = computed(() => !pageField(model.pages, 6, 'shown'));
	const page6Ellipsis = computed(() => pageField(model.pages, 6, 'ellipsis') === true);
	const page6NotEllipsis = computed(() => pageField(model.pages, 6, 'ellipsis') !== true);
	const page6Class = computed(() => pageField(model.pages, 6, 'className'));
	const page6Label = computed(() => `Go to page ${pageField(model.pages, 6, 'label')}`);
	const page6Number = computed(() => pageField(model.pages, 6, 'label'));

	<Shell active="/users" topNav={false}>
		<main data-layout="auto" class="px-4 py-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl flex flex-1 flex-col gap-4 sm:gap-6">
			<div class="flex flex-wrap items-end justify-between gap-2">
				<div>
					<h2 class="text-2xl font-bold tracking-tight">User List</h2>
					<p class="text-muted-foreground">Manage your users and their roles here.</p>
				</div>
				<div class="flex gap-2">
					<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3 space-x-1">
						<span>Invite User</span>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mail-plus" aria-hidden="true"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><path d="M19 16v6" /><path d="M16 19h6" /></svg>
					</button>
					<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3 space-x-1">
						<span>Add User</span>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-plus" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
					</button>
				</div>
			</div>
			<div class={"max-sm:has-[div[role=\"toolbar\"]]:mb-16 flex flex-1 flex-col gap-4"}>
				<div class="flex items-center justify-between">
					<div class="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2" data-trailing-hidden="">
						<input data-slot="input" class="flex min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 h-8 w-37.5 lg:w-62.5" placeholder="Filter users..." value={username} onInput={(event) => { username = (event.target as HTMLInputElement).value; page = 1; pushSearch({ username, status, role, page, pageSize }); }} />
						<div class="flex gap-x-2">
					<DropdownMenuTrigger menu="filter-status" haspopup="dialog" slot="popover-trigger" class="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 h-8 border-dashed">
						<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-4"><path d="M7.49991 0.876892C3.84222 0.876892 0.877075 3.84204 0.877075 7.49972C0.877075 11.1574 3.84222 14.1226 7.49991 14.1226C11.1576 14.1226 14.1227 11.1574 14.1227 7.49972C14.1227 3.84204 11.1576 0.876892 7.49991 0.876892ZM1.82707 7.49972C1.82707 4.36671 4.36689 1.82689 7.49991 1.82689C10.6329 1.82689 13.1727 4.36671 13.1727 7.49972C13.1727 10.6327 10.6329 13.1726 7.49991 13.1726C4.36689 13.1726 1.82707 10.6327 1.82707 7.49972ZM7.50003 4C7.77617 4 8.00003 4.22386 8.00003 4.5V7H10.5C10.7762 7 11 7.22386 11 7.5C11 7.77614 10.7762 8 10.5 8H8.00003V10.5C8.00003 10.7761 7.77617 11 7.50003 11C7.22389 11 7.00003 10.7761 7.00003 10.5V8H4.50003C4.22389 8 4.00003 7.77614 4.00003 7.5C4.00003 7.22386 4.22389 7 4.50003 7H7.00003V4.5C7.00003 4.22386 7.22389 4 7.50003 4Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
						Status
						<div data-orientation="vertical" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px mx-2 h-4" hidden={statusNone}></div>
						<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal lg:hidden" hidden={statusNone}>{statusCount}</span>
						<div class="hidden space-x-1 lg:flex" hidden={statusNone}>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={statusFewOrNone}>{statusCountLabel}</span>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={statusActiveNoBadge}>Active</span>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={statusInactiveNoBadge}>Inactive</span>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={statusInvitedNoBadge}>Invited</span>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={statusSuspendedNoBadge}>Suspended</span>
						</div>
					</DropdownMenuTrigger>
					<DropdownMenuTrigger menu="filter-role" haspopup="dialog" slot="popover-trigger" class="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 h-8 border-dashed">
						<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-4"><path d="M7.49991 0.876892C3.84222 0.876892 0.877075 3.84204 0.877075 7.49972C0.877075 11.1574 3.84222 14.1226 7.49991 14.1226C11.1576 14.1226 14.1227 11.1574 14.1227 7.49972C14.1227 3.84204 11.1576 0.876892 7.49991 0.876892ZM1.82707 7.49972C1.82707 4.36671 4.36689 1.82689 7.49991 1.82689C10.6329 1.82689 13.1727 4.36671 13.1727 7.49972C13.1727 10.6327 10.6329 13.1726 7.49991 13.1726C4.36689 13.1726 1.82707 10.6327 1.82707 7.49972ZM7.50003 4C7.77617 4 8.00003 4.22386 8.00003 4.5V7H10.5C10.7762 7 11 7.22386 11 7.5C11 7.77614 10.7762 8 10.5 8H8.00003V10.5C8.00003 10.7761 7.77617 11 7.50003 11C7.22389 11 7.00003 10.7761 7.00003 10.5V8H4.50003C4.22389 8 4.00003 7.77614 4.00003 7.5C4.00003 7.22386 4.22389 7 4.50003 7H7.00003V4.5C7.00003 4.22386 7.22389 4 7.50003 4Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
						Role
						<div data-orientation="vertical" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px mx-2 h-4" hidden={roleNone}></div>
						<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal lg:hidden" hidden={roleNone}>{roleCount}</span>
						<div class="hidden space-x-1 lg:flex" hidden={roleNone}>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={roleFewOrNone}>{roleCountLabel}</span>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={roleSuperadminNoBadge}>Superadmin</span>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={roleAdminNoBadge}>Admin</span>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={roleManagerNoBadge}>Manager</span>
							<span data-slot="badge" class="inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal" hidden={roleCashierNoBadge}>Cashier</span>
						</div>
					</DropdownMenuTrigger>
						</div>
						<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 py-2 has-[>svg]:px-3 h-8 px-2 lg:px-3" hidden={notFiltered} onClick={() => { username = ''; status = ''; role = ''; page = 1; pushSearch({ username, status, role, page, pageSize }); }}>
							Reset
							<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
						</button>
					</div>
					<DropdownMenuTrigger menu="view-options" class="items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 ms-auto hidden h-8 lg:flex">
						<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-4"><path d="M5.5 3C4.67157 3 4 3.67157 4 4.5C4 5.32843 4.67157 6 5.5 6C6.32843 6 7 5.32843 7 4.5C7 3.67157 6.32843 3 5.5 3ZM3 5C3.01671 5 3.03323 4.99918 3.04952 4.99758C3.28022 6.1399 4.28967 7 5.5 7C6.71033 7 7.71978 6.1399 7.95048 4.99758C7.96677 4.99918 7.98329 5 8 5H13.5C13.7761 5 14 4.77614 14 4.5C14 4.22386 13.7761 4 13.5 4H8C7.98329 4 7.96677 4.00082 7.95048 4.00242C7.71978 2.86009 6.71033 2 5.5 2C4.28967 2 3.28022 2.86009 3.04952 4.00242C3.03323 4.00082 3.01671 4 3 4H1.5C1.22386 4 1 4.22386 1 4.5C1 4.77614 1.22386 5 1.5 5H3ZM11.9505 10.9976C11.7198 12.1399 10.7103 13 9.5 13C8.28967 13 7.28022 12.1399 7.04952 10.9976C7.03323 10.9992 7.01671 11 7 11H1.5C1.22386 11 1 10.7761 1 10.5C1 10.2239 1.22386 10 1.5 10H7C7.01671 10 7.03323 10.0008 7.04952 10.0024C7.28022 8.8601 8.28967 8 9.5 8C10.7103 8 11.7198 8.8601 11.9505 10.0024C11.9668 10.0008 11.9833 10 12 10H13.5C13.7761 10 14 10.2239 14 10.5C14 10.7761 13.7761 11 13.5 11H12C11.9833 11 11.9668 10.9992 11.9505 10.9976ZM8 10.5C8 9.67157 8.67157 9 9.5 9C10.3284 9 11 9.67157 11 10.5C11 11.3284 10.3284 12 9.5 12C8.67157 12 8 11.3284 8 10.5Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
						View
					</DropdownMenuTrigger>
				</div>
				<div class="overflow-hidden rounded-md border">
					<div data-slot="table-container" class="relative w-full overflow-x-auto">
						<table data-slot="table" class={tableClass}>
							<thead data-slot="table-header" class="[&_tr]:border-b">
								<tr data-slot="table-row" class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted group/row">
									<th data-slot="table-head" class="h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted inset-s-0 z-10 rounded-tl-[inherit] max-md:sticky" colspan="1">
										<button type="button" role="checkbox" aria-checked={headerChecked} data-state={headerState} value="on" data-slot="checkbox" class="peer size-4 shrink-0 rounded-lg border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary translate-y-0.5" aria-label="Select all" onClick={() => { selected = toggleAllOnPage({ sorting, username, status, role, page, pageSize, selected, hidden }); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }}>
											<span data-state={headerState} data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;" hidden={headerUnchecked}>
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
											</span>
										</button>
									</th>
									<th data-slot="table-head" class="h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.1)] dark:drop-shadow-[0_1px_2px_rgb(255_255_255_/_0.1)] inset-s-6 ps-0.5 max-md:sticky @4xl/content:table-cell @4xl/content:drop-shadow-none" colspan="1">
								<div class="flex items-center space-x-2">
									<DropdownMenuTrigger menu="sort-username" class="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 h-8 data-[state=open]:bg-accent">
										<span>Username</span>
										<svg hidden={usernameNotDesc} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
										<svg hidden={usernameNotAsc} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
										<svg hidden={usernameSorted} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.35753 11.9939 7.64245 11.9939 7.81819 11.8182L10.0682 9.56819Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									</DropdownMenuTrigger>
								</div>
									</th>
									<th data-slot="table-head" class="h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted w-36" colspan="1">
										<div class="">Name</div>
									</th>
									<th data-slot="table-head" data-col="email" class="h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted" colspan="1">
								<div class="flex items-center space-x-2">
									<DropdownMenuTrigger menu="sort-email" class="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 h-8 data-[state=open]:bg-accent">
										<span>Email</span>
										<svg hidden={emailNotDesc} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
										<svg hidden={emailNotAsc} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
										<svg hidden={emailSorted} width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4"><path d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.35753 11.9939 7.64245 11.9939 7.81819 11.8182L10.0682 9.56819Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									</DropdownMenuTrigger>
								</div>
									</th>
									<th data-slot="table-head" data-col="phoneNumber" class="h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted" colspan="1">
										<div class="">Phone Number</div>
									</th>
									<th data-slot="table-head" class="h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted" colspan="1">
										<div class="">Status</div>
									</th>
									<th data-slot="table-head" class="h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted" colspan="1">
										<div class="">Role</div>
									</th>
									<th data-slot="table-head" class="h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted" colspan="1"></th>
								</tr>
							</thead>
							<tbody data-slot="table-body" class="[&_tr:last-child]:border-0">
								<UserRow rows={rows} slot={0} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 0); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={1} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 1); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={2} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 2); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={3} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 3); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={4} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 4); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={5} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 5); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={6} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 6); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={7} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 7); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={8} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 8); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={9} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 9); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={10} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 10); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={11} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 11); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={12} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 12); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={13} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 13); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={14} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 14); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={15} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 15); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={16} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 16); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={17} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 17); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={18} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 18); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={19} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 19); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={20} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 20); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={21} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 21); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={22} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 22); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={23} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 23); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={24} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 24); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={25} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 25); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={26} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 26); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={27} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 27); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={28} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 28); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={29} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 29); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={30} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 30); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={31} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 31); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={32} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 32); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={33} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 33); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={34} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 34); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={35} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 35); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={36} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 36); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={37} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 37); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={38} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 38); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={39} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 39); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={40} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 40); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={41} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 41); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={42} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 42); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={43} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 43); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={44} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 44); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={45} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 45); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={46} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 46); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={47} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 47); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={48} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 48); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
								<UserRow rows={rows} slot={49} onToggle={() => { selected = toggleRow({ sorting, username, status, role, page, pageSize, selected, hidden }, 49); announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000); }} />
							</tbody>
							<tbody data-slot="table-body" hidden={hasRows}>
								<tr data-slot="table-row" class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
									<td data-slot="table-cell" class="p-2 align-middle whitespace-nowrap *:[[role=checkbox]]:translate-y-0.5 h-24 text-center" colspan="8">No results.</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
				<div class="flex items-center justify-between overflow-clip px-2 @max-2xl/content:flex-col-reverse @max-2xl/content:gap-4 mt-auto" style="overflow-clip-margin: 1px;">
					<div class="flex w-full items-center justify-between">
						<div class="flex w-25 items-center justify-center text-sm font-medium @2xl/content:hidden">{pageLabel}</div>
						<div class="flex items-center gap-2 @max-2xl/content:flex-row-reverse">
							<DropdownMenuTrigger menu="page-size" haspopup="listbox" role="combobox" aria-autocomplete="none" dir="ltr" data-size="default" class="flex items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground h-8 w-17.5">
								<span data-slot="select-value" style="pointer-events: none;">{pageSizeLabel}</span>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
							</DropdownMenuTrigger>
							<p class="hidden text-sm font-medium sm:block">Rows per page</p>
						</div>
					</div>
					<div class="flex items-center sm:space-x-6 lg:space-x-8">
						<div class="flex w-25 items-center justify-center text-sm font-medium @max-3xl/content:hidden">{pageLabel}</div>
						<div class="flex items-center space-x-2">
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 has-[>svg]:px-3 size-8 p-0 @max-md/content:hidden" disabled={cannotPrevious} onClick={() => { page = 1; pushSearch({ username, status, role, page, pageSize }); }}>
								<span class="sr-only">Go to first page</span>
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M6.85355 3.85355C7.04882 3.65829 7.04882 3.34171 6.85355 3.14645C6.65829 2.95118 6.34171 2.95118 6.14645 3.14645L2.14645 7.14645C1.95118 7.34171 1.95118 7.65829 2.14645 7.85355L6.14645 11.8536C6.34171 12.0488 6.65829 12.0488 6.85355 11.8536C7.04882 11.6583 7.04882 11.3417 6.85355 11.1464L3.20711 7.5L6.85355 3.85355ZM12.8536 3.85355C13.0488 3.65829 13.0488 3.34171 12.8536 3.14645C12.6583 2.95118 12.3417 2.95118 12.1464 3.14645L8.14645 7.14645C7.95118 7.34171 7.95118 7.65829 8.14645 7.85355L12.1464 11.8536C12.3417 12.0488 12.6583 12.0488 12.8536 11.8536C13.0488 11.6583 13.0488 11.3417 12.8536 11.1464L9.20711 7.5L12.8536 3.85355Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
							</button>
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 has-[>svg]:px-3 size-8 p-0" disabled={cannotPrevious} onClick={() => { page = Math.max(1, page - 1); pushSearch({ username, status, role, page, pageSize }); }}>
								<span class="sr-only">Go to previous page</span>
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M8.84182 3.13514C9.04327 3.32401 9.05348 3.64042 8.86462 3.84188L5.43521 7.49991L8.86462 11.1579C9.05348 11.3594 9.04327 11.6758 8.84182 11.8647C8.64036 12.0535 8.32394 12.0433 8.13508 11.8419L4.38508 7.84188C4.20477 7.64955 4.20477 7.35027 4.38508 7.15794L8.13508 3.15794C8.32394 2.95648 8.64036 2.94628 8.84182 3.13514Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
							</button>
					<div class="flex items-center" hidden={page0Hidden}>
						<span class="px-1 text-sm text-muted-foreground" hidden={page0NotEllipsis}>...</span>
						<button data-slot="button" class={page0Class} hidden={page0Ellipsis} onClick={() => { page = pageAtSlot({ sorting, username, status, role, page, pageSize, selected, hidden }, 0); pushSearch({ username, status, role, page, pageSize }); }}>
							<span class="sr-only">{page0Label}</span>
							<span>{page0Number}</span>
						</button>
					</div>
					<div class="flex items-center" hidden={page1Hidden}>
						<span class="px-1 text-sm text-muted-foreground" hidden={page1NotEllipsis}>...</span>
						<button data-slot="button" class={page1Class} hidden={page1Ellipsis} onClick={() => { page = pageAtSlot({ sorting, username, status, role, page, pageSize, selected, hidden }, 1); pushSearch({ username, status, role, page, pageSize }); }}>
							<span class="sr-only">{page1Label}</span>
							<span>{page1Number}</span>
						</button>
					</div>
					<div class="flex items-center" hidden={page2Hidden}>
						<span class="px-1 text-sm text-muted-foreground" hidden={page2NotEllipsis}>...</span>
						<button data-slot="button" class={page2Class} hidden={page2Ellipsis} onClick={() => { page = pageAtSlot({ sorting, username, status, role, page, pageSize, selected, hidden }, 2); pushSearch({ username, status, role, page, pageSize }); }}>
							<span class="sr-only">{page2Label}</span>
							<span>{page2Number}</span>
						</button>
					</div>
					<div class="flex items-center" hidden={page3Hidden}>
						<span class="px-1 text-sm text-muted-foreground" hidden={page3NotEllipsis}>...</span>
						<button data-slot="button" class={page3Class} hidden={page3Ellipsis} onClick={() => { page = pageAtSlot({ sorting, username, status, role, page, pageSize, selected, hidden }, 3); pushSearch({ username, status, role, page, pageSize }); }}>
							<span class="sr-only">{page3Label}</span>
							<span>{page3Number}</span>
						</button>
					</div>
					<div class="flex items-center" hidden={page4Hidden}>
						<span class="px-1 text-sm text-muted-foreground" hidden={page4NotEllipsis}>...</span>
						<button data-slot="button" class={page4Class} hidden={page4Ellipsis} onClick={() => { page = pageAtSlot({ sorting, username, status, role, page, pageSize, selected, hidden }, 4); pushSearch({ username, status, role, page, pageSize }); }}>
							<span class="sr-only">{page4Label}</span>
							<span>{page4Number}</span>
						</button>
					</div>
					<div class="flex items-center" hidden={page5Hidden}>
						<span class="px-1 text-sm text-muted-foreground" hidden={page5NotEllipsis}>...</span>
						<button data-slot="button" class={page5Class} hidden={page5Ellipsis} onClick={() => { page = pageAtSlot({ sorting, username, status, role, page, pageSize, selected, hidden }, 5); pushSearch({ username, status, role, page, pageSize }); }}>
							<span class="sr-only">{page5Label}</span>
							<span>{page5Number}</span>
						</button>
					</div>
					<div class="flex items-center" hidden={page6Hidden}>
						<span class="px-1 text-sm text-muted-foreground" hidden={page6NotEllipsis}>...</span>
						<button data-slot="button" class={page6Class} hidden={page6Ellipsis} onClick={() => { page = pageAtSlot({ sorting, username, status, role, page, pageSize, selected, hidden }, 6); pushSearch({ username, status, role, page, pageSize }); }}>
							<span class="sr-only">{page6Label}</span>
							<span>{page6Number}</span>
						</button>
					</div>
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 has-[>svg]:px-3 size-8 p-0" disabled={cannotNext} onClick={() => { page = Math.min(lastPage({ sorting, username, status, role, page, pageSize, selected, hidden }), page + 1); pushSearch({ username, status, role, page, pageSize }); }}>
								<span class="sr-only">Go to next page</span>
								<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M6.1584 3.13508C6.35985 2.94621 6.67627 2.95642 6.86514 3.15788L10.6151 7.15788C10.7954 7.3502 10.7954 7.64949 10.6151 7.84182L6.86514 11.8418C6.67627 12.0433 6.35985 12.0535 6.1584 11.8646C5.95694 11.6757 5.94673 11.3593 6.1356 11.1579L9.565 7.49985L6.1356 3.84182C5.94673 3.64036 5.95694 3.32394 6.1584 3.13508Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
							</button>
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 has-[>svg]:px-3 size-8 p-0 @max-md/content:hidden" disabled={cannotNext} onClick={() => { page = lastPage({ sorting, username, status, role, page, pageSize, selected, hidden }); pushSearch({ username, status, role, page, pageSize }); }}>
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
						moveToolbarFocus(event.currentTarget as HTMLElement, event.key);
					}
					if (event.key === 'Escape') {
						selected = escapeClears(event) ? '' : selected;
					}
				}}>
					<div class="p-2 shadow-xl rounded-xl border bg-background/95 backdrop-blur-lg supports-backdrop-filter:bg-background/60 flex items-center gap-x-2">
						<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-6 rounded-full" aria-label="Clear selection" title="Clear selection (Escape)" data-state="closed" onClick={() => { selected = ''; }}>
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
							<span class="sr-only">Clear selection</span>
						</button>
						<div data-orientation="vertical" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px h-5" aria-hidden="true"></div>
						<div class="flex items-center gap-x-1 text-sm" id="bulk-actions-description">
							<span data-slot="badge" class="inline-flex items-center justify-center border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90 min-w-8 rounded-lg" aria-label={selectedCountLabel}>{selectedCount}</span>
							<span class="hidden sm:inline">{selectedNoun}</span>
							<span>selected</span>
						</div>
						<div data-orientation="vertical" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px h-5" aria-hidden="true"></div>
				<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-8" aria-label="Invite selected users" title="Invite selected users" data-state="closed" onClick={() => {
					const count = countOf(selected);
					const id = `bulk-${Date.now()}`;
					toasts = promiseLoading(toasts, id, 'Inviting users...');
					selected = '';
					setTimeout(() => {
						toasts = promiseSuccess(toasts, id, `Invited ${count} user${count > 1 ? 's' : ''}`);
						setTimeout(() => {
							toasts = expired(toasts, id);
						}, DURATION);
					}, 2000);
				}}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mail" aria-hidden="true"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" /><rect x="2" y="4" width="20" height="16" rx="2" /></svg>
					<span class="sr-only">Invite selected users</span>
				</button>
				<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-8" aria-label="Activate selected users" title="Activate selected users" data-state="closed" onClick={() => {
					const count = countOf(selected);
					const id = `bulk-${Date.now()}`;
					toasts = promiseLoading(toasts, id, 'Activating users...');
					selected = '';
					setTimeout(() => {
						toasts = promiseSuccess(toasts, id, `Activated ${count} user${count > 1 ? 's' : ''}`);
						setTimeout(() => {
							toasts = expired(toasts, id);
						}, DURATION);
					}, 2000);
				}}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-check" aria-hidden="true"><path d="m16 11 2 2 4-4" /><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
					<span class="sr-only">Activate selected users</span>
				</button>
				<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-8" aria-label="Deactivate selected users" title="Deactivate selected users" data-state="closed" onClick={() => {
					const count = countOf(selected);
					const id = `bulk-${Date.now()}`;
					toasts = promiseLoading(toasts, id, 'Deactivating users...');
					selected = '';
					setTimeout(() => {
						toasts = promiseSuccess(toasts, id, `Deactivated ${count} user${count > 1 ? 's' : ''}`);
						setTimeout(() => {
							toasts = expired(toasts, id);
						}, DURATION);
					}, 2000);
				}}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-x" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" x2="22" y1="8" y2="13" /><line x1="22" x2="17" y1="8" y2="13" /></svg>
					<span class="sr-only">Deactivate selected users</span>
				</button>
				<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 size-8" aria-label="Delete selected users" title="Delete selected users" data-state="closed" onClick={() => {}}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
					<span class="sr-only">Delete selected users</span>
				</button>
					</div>
				</div>
			</div>
		</main>
		<div data-state={deleteState} data-slot="alert-dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" style="pointer-events: auto;" hidden={deleteClosed}></div>
		<div role="alertdialog" id="users-delete-dialog" aria-describedby="users-delete-description" aria-labelledby="users-delete-title" data-state={deleteState} data-slot="alert-dialog-content" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg" tabindex="-1" style="pointer-events: auto;" hidden={deleteClosed} onKeydown={(event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				deleteOpen = false;
				closeConfirm();
			}
		}}>
			<div data-slot="alert-dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
				<h2 id="users-delete-title" data-slot="alert-dialog-title" class="text-lg font-semibold">
					<span class="text-destructive">
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert me-1 inline-block stroke-destructive" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
						{' '}Delete User
					</span>
				</h2>
				<div id="users-delete-description" data-slot="alert-dialog-description" class="text-sm text-muted-foreground">
					<form id="users-delete-form" class="space-y-4" onSubmit={(event) => {
						event.preventDefault();
						if (deleteValue.trim() === deleteName) {
							deleteOpen = false;
							closeConfirm();
							const id = `deleted-${Date.now()}`;
							toasts = message(toasts, id, 'The following user has been deleted:', deleteSummary(userAt({ sorting, username, status, role, page, pageSize, selected, hidden }, rowSlot(m.at))));
							setTimeout(() => {
								toasts = expired(toasts, id);
							}, DURATION);
						}
					}}>
						<p class="mb-2">
							<span>Are you sure you want to delete </span>
							<span class="font-bold">{deleteName}</span>
							<span>?</span>
							<span class="block"></span>
							<span>This action will permanently remove the user with the role of </span>
							<span class="font-bold">{deleteRoleUpper}</span>
							<span> from the system. This cannot be undone.</span>
						</p>
						<label data-slot="label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 my-2">
							Username:
							<input data-slot="input" id="users-delete-input" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40" placeholder="Enter username to confirm deletion." value={deleteValue} onInput={(event) => { deleteValue = (event.target as HTMLInputElement).value; }} />
						</label>
						<div data-slot="alert" role="alert" class="relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90">
							<div data-slot="alert-title" class="col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight">Warning!</div>
							<div data-slot="alert-description" class="col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed">Please be careful, this operation can not be rolled back.</div>
						</div>
					</form>
				</div>
			</div>
			<div data-slot="alert-dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button type="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3" onClick={() => { deleteOpen = false; closeConfirm(); }}>Cancel</button>
				<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 h-9 px-4 py-2 has-[>svg]:px-3" type="submit" form="users-delete-form" disabled={deleteDisabled}>Delete</button>
			</div>
		</div>
	<PopoverContent menu="filter-status" align="start" class="z-50 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 w-50 p-0">
		<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground" cmdk-root="" id="filter-status-command" onKeydown={(event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
				event.preventDefault();
				moveIn(document.getElementById('filter-status-command'), event.key);
			}
			if (event.key === 'Enter') {
				event.preventDefault();
			}
			const option = event.key === 'Enter' ? chosenIn(document.getElementById('filter-status-command')) : undefined;
			if (option) {
				status = option === 'clear' ? '' : toggleValue(status, option);
				page = 1;
				pushSearch({ username, status, role, page, pageSize });
			}
		}}>
			<label cmdk-label="" for="filter-status-input" id="filter-status-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
			<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search size-4 shrink-0 opacity-50" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
				<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Status" cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="filter-status-list" aria-labelledby="filter-status-label" id="filter-status-input" type="text" value="" onInput={(event) => filterIn(document.getElementById('filter-status-command'), (event.target as HTMLInputElement).value)} />
			</div>
			<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="filter-status-list" onClick={(event) => {
				const option = chosenIn(document.getElementById('filter-status-command'), event.target);
				if (option) {
					status = option === 'clear' ? '' : toggleValue(status, option);
					page = 1;
					pushSearch({ username, status, role, page, pageSize });
				}
			}}>
				<div cmdk-list-sizer="">
					<div cmdk-empty="" role="presentation" class="py-6 text-center text-sm" data-slot="command-empty" hidden>No results found.</div>
					<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="undefined">
						<div cmdk-group-items="" role="group">
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="filter-status-active" cmdk-item="" role="option" aria-disabled="false" aria-selected="true" data-disabled="false" data-selected="true" data-value={statusActiveValue} data-option="active">
								<div class={statusActiveBoxClass}>
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								</div>
								<span>Active</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={statusActiveNoFacet}>{statusActiveFacet}</span>
							</div>
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="filter-status-inactive" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value={statusInactiveValue} data-option="inactive">
								<div class={statusInactiveBoxClass}>
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								</div>
								<span>Inactive</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={statusInactiveNoFacet}>{statusInactiveFacet}</span>
							</div>
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="filter-status-invited" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value={statusInvitedValue} data-option="invited">
								<div class={statusInvitedBoxClass}>
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								</div>
								<span>Invited</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={statusInvitedNoFacet}>{statusInvitedFacet}</span>
							</div>
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="filter-status-suspended" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value={statusSuspendedValue} data-option="suspended">
								<div class={statusSuspendedBoxClass}>
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								</div>
								<span>Suspended</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={statusSuspendedNoFacet}>{statusSuspendedFacet}</span>
							</div>
						</div>
					</div>
					<div data-slot="command-separator" class="-mx-1 h-px bg-border" cmdk-separator="" role="separator" hidden={statusNone}></div>
					<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="undefined" hidden={statusNone}>
						<div cmdk-group-items="" role="group">
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground justify-center text-center" id="filter-status-clear" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Clear filters" data-option="clear">Clear filters</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</PopoverContent>
	<PopoverContent menu="filter-role" align="start" class="z-50 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 w-50 p-0">
		<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground" cmdk-root="" id="filter-role-command" onKeydown={(event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
				event.preventDefault();
				moveIn(document.getElementById('filter-role-command'), event.key);
			}
			if (event.key === 'Enter') {
				event.preventDefault();
			}
			const option = event.key === 'Enter' ? chosenIn(document.getElementById('filter-role-command')) : undefined;
			if (option) {
				role = option === 'clear' ? '' : toggleValue(role, option);
				page = 1;
				pushSearch({ username, status, role, page, pageSize });
			}
		}}>
			<label cmdk-label="" for="filter-role-input" id="filter-role-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
			<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search size-4 shrink-0 opacity-50" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
				<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Role" cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="filter-role-list" aria-labelledby="filter-role-label" id="filter-role-input" type="text" value="" onInput={(event) => filterIn(document.getElementById('filter-role-command'), (event.target as HTMLInputElement).value)} />
			</div>
			<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="filter-role-list" onClick={(event) => {
				const option = chosenIn(document.getElementById('filter-role-command'), event.target);
				if (option) {
					role = option === 'clear' ? '' : toggleValue(role, option);
					page = 1;
					pushSearch({ username, status, role, page, pageSize });
				}
			}}>
				<div cmdk-list-sizer="">
					<div cmdk-empty="" role="presentation" class="py-6 text-center text-sm" data-slot="command-empty" hidden>No results found.</div>
					<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="undefined">
						<div cmdk-group-items="" role="group">
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="filter-role-superadmin" cmdk-item="" role="option" aria-disabled="false" aria-selected="true" data-disabled="false" data-selected="true" data-value={roleSuperadminValue} data-option="superadmin">
								<div class={roleSuperadminBoxClass}>
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								</div>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield size-4 text-muted-foreground" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
								<span>Superadmin</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={roleSuperadminNoFacet}>{roleSuperadminFacet}</span>
							</div>
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="filter-role-admin" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value={roleAdminValue} data-option="admin">
								<div class={roleAdminBoxClass}>
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								</div>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-check size-4 text-muted-foreground" aria-hidden="true"><path d="m16 11 2 2 4-4" /><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
								<span>Admin</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={roleAdminNoFacet}>{roleAdminFacet}</span>
							</div>
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="filter-role-manager" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value={roleManagerValue} data-option="manager">
								<div class={roleManagerBoxClass}>
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								</div>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users size-4 text-muted-foreground" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></svg>
								<span>Manager</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={roleManagerNoFacet}>{roleManagerFacet}</span>
							</div>
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="filter-role-cashier" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value={roleCashierValue} data-option="cashier">
								<div class={roleCashierBoxClass}>
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-background"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
								</div>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card size-4 text-muted-foreground" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
								<span>Cashier</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={roleCashierNoFacet}>{roleCashierFacet}</span>
							</div>
						</div>
					</div>
					<div data-slot="command-separator" class="-mx-1 h-px bg-border" cmdk-separator="" role="separator" hidden={roleNone}></div>
					<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="undefined" hidden={roleNone}>
						<div cmdk-group-items="" role="group">
							<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground justify-center text-center" id="filter-role-clear" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Clear filters" data-option="clear">Clear filters</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</PopoverContent>
	<DropdownMenuContent menu="sort-username" align="start">
		<DropdownMenuItem menu="sort-username" onSelect={() => { sorting = 'username:asc'; }}>
			<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
			Asc
		</DropdownMenuItem>
		<DropdownMenuItem menu="sort-username" onSelect={() => { sorting = 'username:desc'; }}>
			<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
			Desc
		</DropdownMenuItem>
	</DropdownMenuContent>
	<DropdownMenuContent menu="sort-email" align="start">
		<DropdownMenuItem menu="sort-email" onSelect={() => { sorting = 'email:asc'; }}>
			<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711L8 12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
			Asc
		</DropdownMenuItem>
		<DropdownMenuItem menu="sort-email" onSelect={() => { sorting = 'email:desc'; }}>
			<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5L8 11.2929L11.1464 8.14645C11.3417 7.95118 11.6583 7.95118 11.8536 8.14645C12.0488 8.34171 12.0488 8.65829 11.8536 8.85355L7.85355 12.8536C7.75979 12.9473 7.63261 13 7.5 13C7.36739 13 7.24021 12.9473 7.14645 12.8536L3.14645 8.85355C2.95118 8.65829 2.95118 8.34171 3.14645 8.14645C3.34171 7.95118 3.65829 7.95118 3.85355 8.14645L7 11.2929L7 2.5C7 2.22386 7.22386 2 7.5 2Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
			Desc
		</DropdownMenuItem>
		<DropdownMenuSeparator />
		<DropdownMenuItem menu="sort-email" onSelect={() => { hidden = hasValue(hidden, 'email') ? hidden : toggleValue(hidden, 'email'); }}>
			<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-muted-foreground/70"><path d="M13.3536 2.35355C13.5488 2.15829 13.5488 1.84171 13.3536 1.64645C13.1583 1.45118 12.8417 1.45118 12.6464 1.64645L10.6828 3.61012C9.70652 3.21671 8.63759 3 7.5 3C4.30786 3 1.65639 4.70638 0.0760002 7.23501C-0.0253338 7.39715 -0.0253334 7.60288 0.0760014 7.76501C0.902945 9.08812 2.02314 10.1861 3.36061 10.9323L1.64645 12.6464C1.45118 12.8417 1.45118 13.1583 1.64645 13.3536C1.84171 13.5488 2.15829 13.5488 2.35355 13.3536L4.31723 11.3899C5.29348 11.7833 6.36241 12 7.5 12C10.6921 12 13.3436 10.2936 14.924 7.76501C15.0253 7.60288 15.0253 7.39715 14.924 7.23501C14.0971 5.9119 12.9769 4.81391 11.6394 4.06771L13.3536 2.35355ZM9.90428 4.38861C9.15332 4.1361 8.34759 4 7.5 4C4.80285 4 2.52952 5.37816 1.09622 7.50001C1.87284 8.6497 2.89609 9.58106 4.09974 10.1931L9.90428 4.38861ZM5.09572 10.6114L10.9003 4.80685C12.1039 5.41894 13.1272 6.35031 13.9038 7.50001C12.4705 9.62183 10.1971 11 7.5 11C6.65241 11 5.84668 10.8639 5.09572 10.6114Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
			Hide
		</DropdownMenuItem>
	</DropdownMenuContent>
	<DropdownMenuContent menu="view-options" modal={false} align="end" class="w-37.5">
		<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
		<DropdownMenuSeparator />
		<DropdownMenuCheckboxItem menu="view-options" class="capitalize" checked={emailShown} onSelect={() => { hidden = toggleValue(hidden, 'email'); }}>email</DropdownMenuCheckboxItem>
		<DropdownMenuCheckboxItem menu="view-options" class="capitalize" checked={phoneShown} onSelect={() => { hidden = toggleValue(hidden, 'phoneNumber'); }}>phoneNumber</DropdownMenuCheckboxItem>
	</DropdownMenuContent>
	<DropdownMenuContent menu="row-actions" modal={false} align="end" class="w-40">
		<DropdownMenuItem menu="row-actions" onSelect={() => {}}>
			Edit
			<DropdownMenuShortcut><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-pen" aria-hidden="true"><path d="M11.5 15H7a4 4 0 0 0-4 4v2" /><path d="M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" /><circle cx="10" cy="7" r="4" /></svg></DropdownMenuShortcut>
		</DropdownMenuItem>
		<DropdownMenuSeparator />
		<DropdownMenuItem menu="row-actions" class="text-red-500!" onSelect={() => {
			const user = userAt({ sorting, username, status, role, page, pageSize, selected, hidden }, rowSlot(m.at));
			deleteName = user ? user.username : '';
			deleteRole = user ? user.role : '';
			deleteValue = '';
			deleteOpen = true;
			openConfirm();
		}}>
			Delete
			<DropdownMenuShortcut><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></DropdownMenuShortcut>
		</DropdownMenuItem>
	</DropdownMenuContent>
	<DropdownMenuContent menu="page-size" role="listbox" slot="select-content" side="top" align="start" class="relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1 p-0">
		<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">
			<SelectItem menu="page-size" selected={size10} onSelect={() => { page = Math.floor(((page - 1) * pageSize) / 10) + 1; pageSize = 10; pushSearch({ username, status, role, page, pageSize }); }}>10</SelectItem>
			<SelectItem menu="page-size" selected={size20} onSelect={() => { page = Math.floor(((page - 1) * pageSize) / 20) + 1; pageSize = 20; pushSearch({ username, status, role, page, pageSize }); }}>20</SelectItem>
			<SelectItem menu="page-size" selected={size30} onSelect={() => { page = Math.floor(((page - 1) * pageSize) / 30) + 1; pageSize = 30; pushSearch({ username, status, role, page, pageSize }); }}>30</SelectItem>
			<SelectItem menu="page-size" selected={size40} onSelect={() => { page = Math.floor(((page - 1) * pageSize) / 40) + 1; pageSize = 40; pushSearch({ username, status, role, page, pageSize }); }}>40</SelectItem>
			<SelectItem menu="page-size" selected={size50} onSelect={() => { page = Math.floor(((page - 1) * pageSize) / 50) + 1; pageSize = 50; pushSearch({ username, status, role, page, pageSize }); }}>50</SelectItem>
		</div>
	</DropdownMenuContent>
		<Toaster toasts={toasts} extra={true} />
	</Shell>
}
