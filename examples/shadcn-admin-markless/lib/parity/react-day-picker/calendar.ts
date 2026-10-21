// Parity port of react-day-picker 9 as the account form uses it (shadcn's calendar.tsx: mode single, captionLayout
// dropdown, outside days shown, a disabled matcher): the month grid with its modifiers, labels and focus target, the
// dropdown ranges and keyboard moves. Dates are plain `yyyy-mm-dd` strings in local time.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BASE_DAY = 'group/day relative aspect-square h-full w-full p-0 text-center select-none [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md rdp-day';

export interface CalendarDay {
	readonly iso: string;
	readonly day: string;
	readonly localeDate: string;
	readonly label: string;
	readonly tdClass: string;
	readonly outside: boolean;
	readonly month: string | undefined;
	readonly disabled: boolean;
	readonly today: boolean;
	readonly selected: boolean;
	readonly focused: boolean;
	readonly tabindex: string;
}

export interface CalendarWeek {
	readonly key: string;
	readonly days: readonly CalendarDay[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (iso: string): Date => {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d);
};

function ordinal(n: number): string {
	const s = n % 100;
	if (s >= 11 && s <= 13) return `${n}th`;
	return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

/** date-fns format(date, 'PPPP') in en-US. */
export function longDate(d: Date): string {
	return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
}

/** date-fns format(date, 'MMM d, yyyy'): the date picker's trigger text. */
export function shortDate(iso: string): string {
	if (!iso) return '';
	const d = dateOf(iso);
	return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

export function monthYear(year: number, month: number): string {
	return `${MONTHS[month]} ${year}`;
}

export function monthShort(month: number): string {
	return MONTHS[month].slice(0, 3);
}

/** The DatePicker's matcher: after now, or before 1900-01-01. */
export function isDisabled(iso: string, now: Date): boolean {
	const d = dateOf(iso);
	return d.getTime() > now.getTime() || d.getTime() < new Date(1900, 0, 1).getTime();
}

/** The dropdown caption's navigation range: 100 years back from the start of this year to the end of this year. */
export function navRange(now: Date): { readonly startYear: number; readonly endYear: number } {
	return { startYear: now.getFullYear() - 100, endYear: now.getFullYear() };
}

export function years(now: Date): number[] {
	const { startYear, endYear } = navRange(now);
	return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
}

export interface GridInput {
	readonly year: number;
	readonly month: number;
	readonly selected: string;
	readonly focused: string;
	readonly lastFocused: string;
	readonly nowMs: number;
}

export function monthGrid({ year, month, selected, focused, lastFocused, nowMs }: GridInput): CalendarWeek[] {
	const now = new Date(nowMs);
	const todayIso = isoOf(now);
	const first = new Date(year, month, 1);
	const last = new Date(year, month + 1, 0);
	const start = new Date(year, month, 1 - first.getDay());
	const end = new Date(year, month, last.getDate() + (6 - last.getDay()));
	const days: Omit<CalendarDay, 'tabindex'>[] = [];
	for (let d = new Date(start); d.getTime() <= end.getTime(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
		const iso = isoOf(d);
		const outside = d.getMonth() !== month;
		const disabled = isDisabled(iso, now);
		const today = iso === todayIso;
		const isSelected = iso === selected;
		const isFocused = iso === focused;
		const classes = [BASE_DAY];
		if (isFocused) classes.push('rdp-focused');
		if (disabled) classes.push('text-muted-foreground opacity-50 rdp-disabled');
		if (outside) classes.push('text-muted-foreground aria-selected:text-muted-foreground rdp-outside');
		if (today) classes.push('rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none rdp-today');
		if (isSelected) classes.push('rdp-selected');
		let label = longDate(d);
		if (today) label = `Today, ${label}`;
		if (isSelected) label = `${label}, selected`;
		days.push({ iso, day: String(d.getDate()), localeDate: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`, label, tdClass: classes.join(' '), outside, month: outside ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : undefined, disabled, today, selected: isSelected, focused: isFocused });
	}
	const focusable = days.filter((d) => !d.disabled && !d.outside);
	const target = focusable.find((d) => d.iso === lastFocused) ?? focusable.find((d) => d.selected) ?? focusable.find((d) => d.today) ?? focusable[0];
	const weeks: CalendarWeek[] = [];
	for (let i = 0; i < days.length; i += 7) {
		weeks.push({ key: days[i].iso, days: days.slice(i, i + 7).map((d) => ({ ...d, tabindex: d === target ? '0' : '-1' })) });
	}
	return weeks;
}

// shadcn's Calendar hands react-day-picker an inline Root component, so every render of the old calendar mounts its
// whole grid anew and no day's transition-all runs when the calendar's state changes. The port updates the grid in
// place: a state change made from the calendar applies with its transitions held off for two frames, as a new mount does.
const HOLD = '[data-slot=calendar],[data-slot=calendar] *{transition:none!important}';
let holds = 0;
let held: HTMLStyleElement | undefined;
export function holdTransitions(): void {
	held ??= Object.assign(document.createElement('style'), { textContent: HOLD });
	if (holds++ === 0) document.head.append(held);
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			if (--holds === 0) held?.remove();
		}),
	);
}

/** react-day-picker's getNextFocus: the day a key moves focus to, skipping disabled days, within the navigation range. */
export function nextFocus(from: string, key: string, shift: boolean, nowMs: number): string | undefined {
	const now = new Date(nowMs);
	const { startYear, endYear } = navRange(now);
	const move = (d: Date): Date => {
		const y = d.getFullYear();
		const m = d.getMonth();
		const day = d.getDate();
		const clampDay = (yy: number, mm: number) => new Date(yy, mm, Math.min(day, new Date(yy, mm + 1, 0).getDate()));
		switch (key) {
			case 'ArrowLeft':
				return shift ? clampDay(y, m - 1) : new Date(y, m, day - 1);
			case 'ArrowRight':
				return shift ? clampDay(y, m + 1) : new Date(y, m, day + 1);
			case 'ArrowDown':
				return shift ? clampDay(y + 1, m) : new Date(y, m, day + 7);
			case 'ArrowUp':
				return shift ? clampDay(y - 1, m) : new Date(y, m, day - 7);
			case 'PageUp':
				return shift ? clampDay(y - 1, m) : clampDay(y, m - 1);
			case 'PageDown':
				return shift ? clampDay(y + 1, m) : clampDay(y, m + 1);
			case 'Home':
				return new Date(y, m, day - d.getDay());
			default:
				return new Date(y, m, day + (6 - d.getDay()));
		}
	};
	let d = move(dateOf(from));
	for (let attempt = 0; attempt < 366; attempt++) {
		if (d.getFullYear() < startYear || d.getFullYear() > endYear) return undefined;
		if (!isDisabled(isoOf(d), now)) return isoOf(d);
		if (key === 'Home' || key === 'End') return undefined;
		d = move(d);
	}
	return undefined;
}
