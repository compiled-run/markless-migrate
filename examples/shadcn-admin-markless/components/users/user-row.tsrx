// One row slot of the users table (features/users/components/users-columns.tsx), bound to the slot's entry in
// the table model. The page renders a fixed number of slots and shows or hides them: Markless 0.4.0 does not
// update an @for whose list comes from a function, nor add rows that carry bound attributes.
import { computed, state } from '@markless/core';
import { closeMenu, openMenu, toggleMenu } from '../../lib/parity/radix-ui-react-dropdown-menu/behaviour.ts';
import { menus } from '../../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { field, type RowView } from '../../lib/parity/tanstack-react-table/users-table.ts';

const CELL = 'p-2 align-middle whitespace-nowrap *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted';
const CHECKBOX = 'peer size-4 shrink-0 rounded-lg border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary translate-y-0.5';

export type UserRowProps = {
	readonly rows: readonly RowView[];
	readonly slot: number;
	readonly onToggle: () => void;
};

export function UserRow({ rows, slot, onToggle }: UserRowProps) @{
	const rowHidden = computed(() => !field(rows, slot, 'shown'));
	const rowState = computed(() => field(rows, slot, 'rowState'));
	const rowCheckState = computed(() => field(rows, slot, 'checkState'));
	const rowAriaChecked = computed(() => field(rows, slot, 'ariaChecked'));
	const rowUnchecked = computed(() => !field(rows, slot, 'selected'));
	const rowUsername = computed(() => field(rows, slot, 'username'));
	const rowFullName = computed(() => field(rows, slot, 'fullName'));
	const rowEmail = computed(() => field(rows, slot, 'email'));
	const rowPhone = computed(() => field(rows, slot, 'phone'));
	const rowStatus = computed(() => field(rows, slot, 'status'));
	const rowStatusClass = computed(() => field(rows, slot, 'statusClass'));
	const rowRole = computed(() => field(rows, slot, 'role'));
	// The row's own trigger, not DropdownMenuTrigger: Markless 0.4.0 can bind a nested component's handlers to the wrong instance.
	const m = menus();
	let inst = state(`-${slot}`);
	const rowTriggerId = computed(() => `radix-menu-row-actions${inst}-trigger`);
	const rowMenuExpanded = computed(() => (m.open === 'row-actions' && m.at === inst ? 'true' : 'false'));
	const rowMenuState = computed(() => (m.open === 'row-actions' && m.at === inst ? 'open' : 'closed'));

	<tr data-slot="table-row" class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted group/row" data-state={rowState} hidden={rowHidden}>
		<td data-slot="table-cell" class={`${CELL} inset-s-0 z-10 rounded-tl-[inherit] max-md:sticky`}>
			<button type="button" role="checkbox" aria-checked={rowAriaChecked} data-state={rowCheckState} value="on" data-slot="checkbox" class={CHECKBOX} aria-label="Select row" onClick={() => { onToggle(); }}>
				<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;" hidden={rowUnchecked}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
				</span>
			</button>
		</td>
		<td data-slot="table-cell" class={`${CELL} drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.1)] dark:drop-shadow-[0_1px_2px_rgb(255_255_255_/_0.1)] inset-s-6 ps-0.5 max-md:sticky @4xl/content:table-cell @4xl/content:drop-shadow-none`}>
			<div class="truncate max-w-36 ps-3">{rowUsername}</div>
		</td>
		<td data-slot="table-cell" class={`${CELL} w-36`}>
			<div class="truncate max-w-36">{rowFullName}</div>
		</td>
		<td data-slot="table-cell" data-col="email" class={CELL}>
			<div class="w-fit ps-2 text-nowrap">{rowEmail}</div>
		</td>
		<td data-slot="table-cell" data-col="phoneNumber" class={CELL}>
			<div>{rowPhone}</div>
		</td>
		<td data-slot="table-cell" class={CELL}>
			<div class="flex space-x-2">
				<span data-slot="badge" class={rowStatusClass}>{rowStatus}</span>
			</div>
		</td>
		<td data-slot="table-cell" class={CELL}>
			<div class="flex items-center gap-x-2" data-role={rowRole}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield text-muted-foreground role-superadmin" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-check text-muted-foreground role-admin" aria-hidden="true"><path d="m16 11 2 2 4-4" /><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users text-muted-foreground role-manager" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></svg>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card text-muted-foreground role-cashier" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
				<span class="text-sm capitalize">{rowRole}</span>
			</div>
		</td>
		<td data-slot="table-cell" class={CELL}>
			<button
				el={m.triggers}
				type="button"
				data-slot="dropdown-menu-trigger"
				class="items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 has-[>svg]:px-3 flex h-8 w-8 p-0 data-[state=open]:bg-muted"
				id={rowTriggerId}
				aria-haspopup="menu"
				aria-expanded={rowMenuExpanded}
				aria-controls="radix-menu-row-actions-content"
				data-state={rowMenuState}
				data-menu="row-actions"
				onPointerdown={(event) => {
					if (event.button === 0) {
						event.preventDefault();
						m.open = m.open === 'row-actions' && m.at === inst ? '' : 'row-actions';
						m.at = inst;
						toggleMenu(m.contents, m.triggers, 'row-actions', m.open === '', event.target, (refocus) => {
							m.open = '';
							closeMenu(m.contents, m.triggers, 'row-actions', refocus);
						});
					}
				}}
				onKeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
						event.preventDefault();
						m.open = 'row-actions';
						m.at = inst;
						openMenu(m.contents, m.triggers, 'row-actions', 'first', (refocus) => {
							m.open = '';
							closeMenu(m.contents, m.triggers, 'row-actions', refocus);
						}, event.target);
					}
				}}
			>
				<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4"><path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM12.5 8.625C13.1213 8.625 13.625 8.12132 13.625 7.5C13.625 6.87868 13.1213 6.375 12.5 6.375C11.8787 6.375 11.375 6.87868 11.375 7.5C11.375 8.12132 11.8787 8.625 12.5 8.625Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				<span class="sr-only">Open menu</span>
			</button>
		</td>
	</tr>
}
