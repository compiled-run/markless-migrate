// The account date picker's month grid and year dropdown, drawn into the page when the picker opens and after each
// change made from it. react-day-picker renders them only while the popover is open (Radix's Presence), so the page
// carries no per-day bindings: a bound grid, as an @for or as fixed slots, makes every page load carry the page's
// client render code. The weeks are added and removed as react-day-picker renders them (four to six); the cells of
// the weeks kept are updated in place, so the focused day keeps its focus.
import { holdTransitions, monthGrid, years, type CalendarDay, type GridInput } from './calendar.ts';

const DAY_BUTTON = "items-center justify-center whitespace-nowrap rounded-md text-sm transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-accent-foreground [&>span]:text-xs [&>span]:opacity-70 rdp-day rdp-day_button";

/** Gives the element exactly these attributes, in this order, as a new mount renders them. */
function apply(el: Element, attributes: readonly (readonly [string, string | undefined])[]): void {
	const wanted = attributes.filter((entry): entry is readonly [string, string] => entry[1] !== undefined);
	const names = el.getAttributeNames();
	if (names.length === wanted.length && wanted.every(([name], i) => names[i] === name)) {
		for (const [name, value] of wanted) if (el.getAttribute(name) !== value) el.setAttribute(name, value);
		return;
	}
	for (const name of names) el.removeAttribute(name);
	for (const [name, value] of wanted) el.setAttribute(name, value);
}

function cell(): HTMLTableCellElement {
	const td = document.createElement('td');
	td.append(document.createElement('button'));
	return td;
}

function paintDay(td: HTMLTableCellElement, d: CalendarDay): void {
	apply(td, [
		['class', d.tdClass],
		['role', 'gridcell'],
		['aria-selected', d.selected ? 'true' : undefined],
		['data-day', d.iso],
		['data-month', d.month],
		['data-selected', d.selected ? 'true' : undefined],
		['data-disabled', d.disabled ? 'true' : undefined],
		['data-outside', d.outside ? 'true' : undefined],
		['data-focused', d.focused ? 'true' : undefined],
		['data-today', d.today ? 'true' : undefined],
	]);
	const button = td.firstElementChild as HTMLButtonElement;
	apply(button, [
		['data-slot', 'button'],
		['class', DAY_BUTTON],
		['data-day', d.localeDate],
		['data-selected-single', d.selected ? 'true' : undefined],
		['type', 'button'],
		['disabled', d.disabled ? '' : undefined],
		['tabindex', d.tabindex],
		['aria-label', d.label],
	]);
	if (button.textContent !== d.day) button.textContent = d.day;
}

/** Draws the month grid into the calendar's tbody, with transitions held off as a new mount of the old grid has them. */
export function paintGrid(tbody: HTMLElement | null, input: GridInput): void {
	if (!tbody) return;
	holdTransitions();
	const weeks = monthGrid(input);
	while (tbody.children.length > weeks.length) tbody.lastElementChild?.remove();
	while (tbody.children.length < weeks.length) {
		const tr = document.createElement('tr');
		tr.setAttribute('class', 'mt-2 flex w-full rdp-week');
		for (let i = 0; i < 7; i++) tr.append(cell());
		tbody.append(tr);
	}
	weeks.forEach((week, w) => {
		const tr = tbody.children[w];
		week.days.forEach((d, i) => paintDay(tr.children[i] as HTMLTableCellElement, d));
	});
}

/** Fills the year dropdown with the navigation range and selects the shown year (as React's controlled select does, by the option's selected property alone). */
export function paintYears(select: HTMLSelectElement | null, nowMs: number, year: number): void {
	if (!select) return;
	const list = years(new Date(nowMs)).map(String);
	if (select.options.length !== list.length || select.options[0]?.value !== list[0]) {
		select.replaceChildren(
			...list.map((y) => {
				const option = document.createElement('option');
				option.value = y;
				option.textContent = y;
				return option;
			}),
		);
	}
	select.value = String(year);
}
