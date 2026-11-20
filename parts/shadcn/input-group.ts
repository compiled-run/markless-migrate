// shadcn/ui's InputGroupAddon: a click on the addon, not on a button in it, focuses the first input of its group.
const ADDON = '[data-slot="input-group-addon"]';

export function click(target: Element): boolean {
	const addon = target.closest<HTMLElement>(ADDON);
	if (!addon || target.closest('button')) return false;
	addon.parentElement?.querySelector<HTMLInputElement>('input')?.focus();
	// Not claimed: another part may answer the same click (a combobox's addon).
	return false;
}
