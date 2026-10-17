// The DOM half of the users page: the bulk actions toolbar's arrow keys, and the confirm dialog's modality.
const DIALOG = 'users-delete-dialog';
let opener: HTMLElement | null = null;

/** DataTableBulkActions' handleKeyDown: the arrows, Home and End move between the toolbar's buttons, wrapping. */
export function moveToolbarFocus(toolbar: HTMLElement, key: string): void {
	const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button')];
	if (!buttons.length) return;
	const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
	const next = key === 'Home' ? 0 : key === 'End' ? buttons.length - 1 : key === 'ArrowRight' ? (at + 1) % buttons.length : at <= 0 ? buttons.length - 1 : at - 1;
	buttons[next]?.focus();
}

/** Radix AlertDialog opening from a row's actions menu: the page stops taking pointer input, and focus ends on the
 * page itself (the menu hands focus back to its trigger as it closes, and the dialog's focus scope then lets it go). */
export function openConfirm(): void {
	opener = document.activeElement as HTMLElement | null;
	document.body.style.pointerEvents = 'none';
	const field = document.getElementById(`${DIALOG.replace('-dialog', '-input')}`) as HTMLInputElement | null;
	if (field) field.value = '';
	setTimeout(() => (document.activeElement as HTMLElement | null)?.blur());
}

export function closeConfirm(): void {
	document.body.style.pointerEvents = '';
	opener?.focus();
	opener = null;
}

/** Escape on the toolbar clears the selection unless it was meant for one of its menus. */
export function escapeClears(event: KeyboardEvent): boolean {
	const target = event.target as HTMLElement | null;
	return !target?.closest('[data-slot=dropdown-menu-trigger], [data-slot=dropdown-menu-content]');
}
