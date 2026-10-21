// One row slot of the tasks table (features/tasks/components/tasks-columns.tsx), bound to the slot's entry in the
// table model. The page renders a fixed number of slots and shows or hides them, as the users table does: an @for
// whose rows carry bound attributes makes every page load carry the page's whole client render code.
import { computed } from '@markless/core';
import { closeMenu, openMenu, toggleMenu } from '../../lib/parity/radix-ui-react-dropdown-menu/behaviour.ts';
import { menus } from '../../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { hasValue, slotField, type RowView } from '../../lib/parity/tanstack-react-table/tasks-table.ts';
import { trackTrigger } from '../../lib/tasks-behaviour.ts';
import { btn, CHECKBOX, OUTLINE_BADGE, TD, TR } from '../../lib/tasks-ui.ts';

export type TaskRowProps = {
	readonly rows: readonly RowView[];
	readonly slot: number;
	readonly selected: string;
	readonly hidden: string;
	readonly onToggle: () => void;
};

export function TaskRow({ rows, slot, selected, hidden, onToggle }: TaskRowProps) @{
	const m = menus();
	const rowHidden = computed(() => !slotField(rows, slot, 'shown'));
	const rowKey = computed(() => slotField(rows, slot, 'key'));
	const rowSelected = computed(() => hasValue(selected, slotField(rows, slot, 'key')));
	const rowState = computed(() => (rowSelected ? 'selected' : 'false'));
	const rowAriaChecked = computed(() => (rowSelected ? 'true' : 'false'));
	const rowCheckState = computed(() => (rowSelected ? 'checked' : 'unchecked'));
	const rowId = computed(() => slotField(rows, slot, 'id'));
	const rowLabelName = computed(() => slotField(rows, slot, 'labelName'));
	const rowTitle = computed(() => slotField(rows, slot, 'title'));
	const rowStatus = computed(() => slotField(rows, slot, 'status'));
	const rowStatusName = computed(() => slotField(rows, slot, 'statusName'));
	const rowPriority = computed(() => slotField(rows, slot, 'priority'));
	const rowPriorityName = computed(() => slotField(rows, slot, 'priorityName'));
	const titleHidden = computed(() => hasValue(hidden, 'title'));
	const statusHidden = computed(() => hasValue(hidden, 'status'));
	const priorityHidden = computed(() => hasValue(hidden, 'priority'));
	const triggerId = computed(() => `radix-menu-row-actions${slotField(rows, slot, 'key')}-trigger`);
	const triggerClass = computed(() => btn('ghost', 'default', 'flex h-8 w-8 p-0 data-[state=open]:bg-muted'));

	<tr data-slot="table-row" class={TR} hidden={rowHidden} data-state={rowState}>
		<td data-slot="table-cell" class={TD}>
			<button type="button" role="checkbox" aria-checked={rowAriaChecked} data-state={rowCheckState} value="on" data-slot="checkbox" class={CHECKBOX} aria-label="Select row" onClick={() => { onToggle(); }}>
				<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;" hidden={!rowSelected}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
			</button>
		</td>
		<td data-slot="table-cell" class={TD}>
			<div class="w-20">{rowId}</div>
		</td>
		<td data-slot="table-cell" class={`${TD} max-w-0 w-2/3 ps-4`} hidden={titleHidden}>
			<div class="flex space-x-2">
				<span data-slot="badge" class={OUTLINE_BADGE}>{rowLabelName}</span>
				<span class="truncate font-medium">{rowTitle}</span>
			</div>
		</td>
		<td data-slot="table-cell" class={`${TD} ps-4`} hidden={statusHidden}>
			<div class="flex w-25 items-center gap-2">
				<svg hidden={rowStatus !== 'backlog'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
				<svg hidden={rowStatus !== 'todo'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg>
				<svg hidden={rowStatus !== 'in progress'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" /></svg>
				<svg hidden={rowStatus !== 'done'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
				<svg hidden={rowStatus !== 'canceled'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="m2 2 20 20" /><path d="M8.35 2.69A10 10 0 0 1 21.3 15.65" /><path d="M19.08 19.08A10 10 0 1 1 4.92 4.92" /></svg>
				<span>{rowStatusName}</span>
			</div>
		</td>
		<td data-slot="table-cell" class={`${TD} ps-3`} hidden={priorityHidden}>
			<div class="flex items-center gap-2">
				<svg hidden={rowPriority !== 'low'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
				<svg hidden={rowPriority !== 'medium'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
				<svg hidden={rowPriority !== 'high'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
				<svg hidden={rowPriority !== 'critical'} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
				<span>{rowPriorityName}</span>
			</div>
		</td>
		<td data-slot="table-cell" class={TD}>
			<button
				el={m.triggers}
				type="button"
				data-slot="dropdown-menu-trigger"
				class={triggerClass}
				id={triggerId}
				aria-haspopup="menu"
				aria-expanded="false"
				aria-controls="radix-menu-row-actions-content"
				data-state="closed"
				data-menu="row-actions"
				onPointerdown={(event) => {
					if (event.button === 0) {
						event.preventDefault();
						const key = rowKey;
						m.open = m.open === 'row-actions' && m.at === key ? '' : 'row-actions';
						m.at = key;
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
						m.at = rowKey;
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
