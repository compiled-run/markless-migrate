// The DOM half of the tasks page: the row menu's Labels submenu, the radio groups' arrow keys, the forms' focus and
// what the import form reads from its file input. The forms' rules are the old app's zod schemas.
import { z } from 'zod';
import { zodResolver } from './parity/hookform-resolvers/index.ts';

export const taskFormSchema = z.object({
	title: z.string().min(1, 'Title is required.'),
	status: z.string().min(1, 'Please select a status.'),
	label: z.string().min(1, 'Please select a label.'),
	priority: z.string().min(1, 'Please choose a priority.'),
});
export type TaskForm = z.infer<typeof taskFormSchema>;
export const taskFormResolver = zodResolver(taskFormSchema);

export const importSchema = z.object({
	file: z
		.custom<FileList | undefined>()
		.refine((files) => !!files && files.length > 0, { message: 'Please upload a file.' })
		.refine((files) => ['text/csv'].includes(files?.[0]?.type ?? ''), 'Please upload csv format.'),
});
export const importResolver = zodResolver(importSchema);

export const CONFIRM_WORD = 'DELETE';

/** The files the import form's input holds. */
export function filesIn(id: string): FileList | undefined {
	const input = document.getElementById(id) as HTMLInputElement | null;
	return input?.files ?? undefined;
}

export function clearFiles(id: string): void {
	const input = document.getElementById(id) as HTMLInputElement | null;
	if (input) input.value = '';
}

/** showSubmittedData for the import: the first file's name, size and type. */
export function fileDetails(files: FileList | undefined): string {
	const file = files?.[0];
	return file ? JSON.stringify({ name: file.name, size: file.size, type: file.type }, null, 2) : '';
}

/** react-hook-form's shouldFocusError: the first field, in the form's order, with an error. */
export function focusFirstError(errors: Partial<Record<keyof TaskForm, string>>): void {
	const order: (keyof TaskForm)[] = ['title', 'status', 'label', 'priority'];
	const first = order.find((name) => errors[name]);
	if (!first) return;
	const el = first === 'status' ? document.querySelector<HTMLElement>('button[data-menu="tasks-form-status"]') : document.getElementById(first === 'title' ? 'tasks-form-title' : `tasks-form-${first}-first`);
	el?.focus();
}

/** Radix RadioGroup's roving focus: the arrows move to the next or previous item (wrapping) and check it. */
export function radioKey(group: HTMLElement | null, key: string): string | undefined {
	if (!group) return undefined;
	const radios = [...group.querySelectorAll<HTMLElement>('[role=radio]')];
	const at = radios.indexOf(document.activeElement as HTMLElement);
	if (at < 0) return undefined;
	const step = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 0;
	if (!step) return undefined;
	const next = radios[(at + step + radios.length) % radios.length];
	next.focus();
	return next.getAttribute('value') ?? undefined;
}

/** Radix's DropdownMenuSubContent beside its trigger: to the right when it fits, else to the left. */
export function openSub(trigger: HTMLElement | null, focusFirst: boolean): void {
	const wrapper = trigger?.nextElementSibling as HTMLElement | null;
	const content = wrapper?.firstElementChild as HTMLElement | null;
	if (!trigger || !wrapper || !content) return;
	wrapper.hidden = false;
	const anchor = trigger.getBoundingClientRect();
	const box = content.getBoundingClientRect();
	const right = anchor.right + box.width <= innerWidth;
	const parent = wrapper.parentElement?.closest('[data-radix-popper-content-wrapper]')?.getBoundingClientRect() ?? { left: 0, top: 0 };
	const x = right ? anchor.right : anchor.left - box.width;
	const y = Math.min(anchor.top - 5, innerHeight - box.height);
	content.dataset.side = right ? 'right' : 'left';
	wrapper.style.transform = `translate(${Math.round(x - parent.left)}px, ${Math.round(y - parent.top)}px)`;
	trigger.setAttribute('aria-expanded', 'true');
	trigger.dataset.state = 'open';
	content.dataset.state = 'open';
	if (focusFirst) content.querySelector<HTMLElement>('[role=menuitemradio]')?.focus();
	else trigger.focus();
}

export function closeSub(trigger: HTMLElement | null, refocus: boolean): void {
	const wrapper = trigger?.nextElementSibling as HTMLElement | null;
	if (!trigger || !wrapper) return;
	wrapper.hidden = true;
	trigger.setAttribute('aria-expanded', 'false');
	trigger.dataset.state = 'closed';
	if (refocus) trigger.focus();
}

/** The Labels submenu's own keys: the arrows stay inside it (looping off, as Radix's), ArrowLeft goes back to its trigger. */
export function subKey(content: HTMLElement | null, key: string): void {
	if (!content) return;
	const items = [...content.querySelectorAll<HTMLElement>('[role=menuitemradio]')];
	const at = items.indexOf(document.activeElement as HTMLElement);
	if (key === 'ArrowDown') items[Math.min(at + 1, items.length - 1)]?.focus();
	else if (key === 'ArrowUp') items[Math.max(at - 1, 0)]?.focus();
	else if (key === 'Home') items[0]?.focus();
	else if (key === 'End') items[items.length - 1]?.focus();
}

/** The row actions trigger that opened the menu shows it open until the menu's wrapper is hidden again. */
export function trackTrigger(source: EventTarget | null): void {
	const trigger = source instanceof Element ? (source.closest('[data-menu=row-actions]') as HTMLElement | null) : null;
	const wrapper = document.querySelector<HTMLElement>('[data-menu-wrapper=row-actions]');
	if (!trigger || !wrapper) return;
	for (const other of document.querySelectorAll<HTMLElement>('button[data-menu=row-actions][data-state=open]')) {
		other.setAttribute('aria-expanded', 'false');
		other.dataset.state = 'closed';
	}
	const sync = () => {
		const open = !wrapper.hidden;
		trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
		trigger.dataset.state = open ? 'open' : 'closed';
		if (!open) observer.disconnect();
	};
	const observer = new MutationObserver(sync);
	observer.observe(wrapper, { attributes: true, attributeFilter: ['hidden'] });
	sync();
}

/** cmdk selects the item a press lands on. */
export function selectPressed(target: EventTarget | null): void {
	const item = target instanceof Element ? target.closest<HTMLElement>('[cmdk-item]') : null;
	const root = item?.closest('[cmdk-root]');
	if (!item || !root) return;
	for (const el of root.querySelectorAll<HTMLElement>('[cmdk-item]')) {
		el.setAttribute('aria-selected', String(el === item));
		el.setAttribute('data-selected', String(el === item));
	}
}

/** The page number a pagination button carries. */
export function pageOf(target: EventTarget | null): number {
	const button = target instanceof Element ? target.closest<HTMLElement>('[data-page]') : null;
	return Number(button?.dataset.page ?? 1) || 1;
}

export function toolbarOf(target: EventTarget | null): HTMLElement | null {
	return target instanceof Element ? target.closest<HTMLElement>('[role=toolbar]') : null;
}

export function blurActive(): void {
	(document.activeElement as HTMLElement | null)?.blur();
}

export function radioValue(target: EventTarget | null): string {
	const radio = target instanceof Element ? target.closest('[role=radio]') : null;
	return radio?.getAttribute('value') ?? '';
}

let announceTimer: ReturnType<typeof setTimeout> | undefined;

/** DataTableBulkActions' effect: each change of the count restarts the 3 s before the announcement is cleared. */
export function clearAnnouncementLater(clear: () => void): void {
	clearTimeout(announceTimer);
	announceTimer = setTimeout(clear, 3000);
}

/** A numbered page button React keyed by number and position: when its slot now shows another number, the old button is gone and focus with it. */
export function keepPageFocus(target: EventTarget | null, clicked: number): void {
	const button = target instanceof Element ? target.closest<HTMLElement>('[data-page]') : null;
	setTimeout(() => {
		if (button && button.dataset.page !== String(clicked) && document.activeElement === button) button.blur();
	}, 50);
}
