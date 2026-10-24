import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayOfDate, dayPickerModel, dayPickerNext, dayPickerSet, dayPickerView, type DayPickerConfig, type DayPickerView, type LocaleTable } from '../parts/day-picker.ts';
import { pruneLocale, whenOf } from '../src/convert/day-picker.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
// date-fns enUS, as the converter reads it from the old page.
const EN: LocaleTable = {
	ws: 0,
	fwcd: 1,
	full: 'EEEE, MMMM do, y',
	months: { 'wide:formatting': MONTHS, 'wide:standalone': MONTHS, 'abbreviated:standalone': MONTHS.map((m) => m.slice(0, 3)) },
	days: { 'wide:formatting': DAYS, 'wide:standalone': DAYS, 'short:standalone': DAYS.map((d) => d.slice(0, 2)) },
	ord: Array.from({ length: 31 }, (_, i) => ordinal(i + 1)),
};
const CLS = { day: 'day', today: 'is-today', outside: 'is-outside', selected: 'is-selected', disabled: 'is-disabled', range_start: 'rs', range_end: 're', range_middle: 'rm', focused: 'is-focused' };
const base: DayPickerConfig = { loc: EN, mode: 'single', interactive: true, n: 1, caption: 'label', outside: true, cls: CLS };
const day = (y: number, m: number, d: number) => dayOfDate(new Date(y, m, d));
const JAN_15 = day(2026, 0, 15);

const cells = (config: DayPickerConfig, view: DayPickerView) => dayPickerModel(config, view).months.flatMap((m) => m.weeks.flatMap((w) => w.days));
const cell = (config: DayPickerConfig, view: DayPickerView, iso: string) => cells(config, view).find((d) => d.iso === iso && !d.outside)!;
const place = (config: DayPickerConfig, view: DayPickerView, iso: string) => {
	const model = dayPickerModel(config, view);
	for (const month of model.months) for (const week of month.weeks) for (const d of week.days) if (d.iso === iso && !d.outside) return { n: d.n, m: d.m };
	throw new Error(`${iso} is not shown`);
};

test('a month renders as DayPicker renders it: whole weeks, outside days, today, labels and the focus target', () => {
	const view = dayPickerView(base, JAN_15);
	const model = dayPickerModel(base, view);
	assert.equal(model.months.length, 1);
	const month = model.months[0]!;
	assert.equal(month.caption, 'January 2026');
	assert.equal(month.grid, 'January 2026');
	assert.equal(month.weeks.length, 5);
	const first = month.weeks[0]!.days[0]!;
	assert.deepEqual([first.iso, first.dataMonth, first.outside, first.cls], ['2025-12-28', '2025-12', 'true', 'day is-outside']);
	const today = cell(base, view, '2026-01-15');
	assert.equal(today.label, 'Today, Thursday, January 15th, 2026');
	assert.equal(today.today, 'true');
	assert.equal(today.tabindex, '0');
	assert.equal(cell(base, view, '2026-01-16').tabindex, '-1');
	assert.equal(model.prevDisabled, undefined);
});

test('single selection: a click selects the day, a second click on it clears it', () => {
	let view = dayPickerView(base, JAN_15);
	view = dayPickerNext(base, view, { t: 'day', ...place(base, view, '2026-01-20') });
	const picked = cell(base, view, '2026-01-20');
	assert.deepEqual([picked.selected, picked.ariaSelected, picked.cls, picked.label, picked.tabindex], ['true', 'true', 'day is-focused is-selected', 'Tuesday, January 20th, 2026, selected', '0']);
	view = dayPickerNext(base, view, { t: 'day', ...place(base, view, '2026-01-20') });
	assert.equal(cell(base, view, '2026-01-20').selected, undefined);
});

test('range selection follows addToRange: start, end, and the days between', () => {
	const config: DayPickerConfig = { ...base, mode: 'range', shadcn: true };
	let view = dayPickerView(config, JAN_15);
	view = dayPickerNext(config, view, { t: 'day', ...place(config, view, '2026-01-10') });
	assert.deepEqual([cell(config, view, '2026-01-10').rangeStart, cell(config, view, '2026-01-10').rangeEnd], ['true', 'true']);
	view = dayPickerNext(config, view, { t: 'day', ...place(config, view, '2026-01-14') });
	const middle = cell(config, view, '2026-01-12');
	assert.deepEqual([middle.rangeMiddle, middle.single, middle.cls], ['true', 'false', 'day is-selected rm']);
	assert.equal(cell(config, view, '2026-01-14').rangeEnd, 'true');
	assert.equal(cell(config, view, '2026-01-20').rangeStart, 'false');
});

test('navigation: Next and Previous move a month; a year dropdown ends navigation at the end of this year', () => {
	let view = dayPickerView(base, JAN_15);
	view = dayPickerNext(base, view, { t: 'nav', dir: 1 });
	assert.equal(dayPickerModel(base, view).months[0]!.caption, 'February 2026');
	view = dayPickerNext(base, view, { t: 'nav', dir: -1 });
	view = dayPickerNext(base, view, { t: 'nav', dir: -1 });
	assert.equal(dayPickerModel(base, view).months[0]!.caption, 'December 2025');
	const dropdown: DayPickerConfig = { ...base, caption: 'dropdown' };
	let d = dayPickerView(dropdown, JAN_15);
	const model = dayPickerModel(dropdown, d);
	assert.equal(model.months[0]!.yearOptions.length, 101);
	assert.equal(model.months[0]!.yearOptions[0]!.value, '1926');
	d = dayPickerNext(dropdown, d, { t: 'select', m: 0, k: 0, v: 11 });
	const december = dayPickerModel(dropdown, d);
	assert.equal(december.months[0]!.caption, 'December 2026');
	assert.deepEqual([december.nextDisabled, december.nextTabindex], ['true', '-1']);
	assert.equal(dayPickerNext(dropdown, d, { t: 'nav', dir: 1 }).m, d.m);
});

test('keys move the focused day, across months, past disabled days', () => {
	const config: DayPickerConfig = { ...base, disabled: [{ from: { y: 2026, m: 0, d: 31 }, to: { y: 2026, m: 1, d: 2 } }] };
	let view = dayPickerView(config, JAN_15);
	view = dayPickerNext(config, view, { t: 'focus', ...place(config, view, '2026-01-30') });
	view = dayPickerNext(config, view, { t: 'key', key: 'ArrowRight', shift: false });
	assert.equal(view.f?.[0], day(2026, 1, 3));
	assert.equal(dayPickerModel(config, view).months[0]!.caption, 'February 2026');
	assert.equal(cell(config, view, '2026-02-03').focused, 'true');
	// Home on a week whose Sunday is disabled finds nothing to focus (getNextFocus gives up), as DayPicker does.
	assert.equal(dayPickerNext(config, view, { t: 'key', key: 'Home', shift: false }).f?.[0], day(2026, 1, 3));
	view = dayPickerNext(config, view, { t: 'key', key: 'ArrowDown', shift: false });
	view = dayPickerNext(config, view, { t: 'key', key: 'Home', shift: false });
	assert.equal(view.f?.[0], day(2026, 1, 8));
	view = dayPickerNext(config, view, { t: 'key', key: 'PageDown', shift: false });
	assert.equal(dayPickerModel(config, view).months[0]!.caption, 'March 2026');
	const rtl = dayPickerNext({ ...config, rtl: true }, view, { t: 'key', key: 'ArrowLeft', shift: false });
	assert.equal(rtl.f?.[0], day(2026, 2, 9));
});

test('a Jalali calendar counts months as date-fns-jalali does', () => {
	const fa: DayPickerConfig = { ...base, cal: 'jalali', loc: { ...EN, ws: 6 }, digits: ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'], month: { y: 2025, m: 5, d: 12 } };
	const model = dayPickerModel(fa, dayPickerView(fa, JAN_15));
	const days = model.months[0]!.weeks.flatMap((w) => w.days).filter((d) => !d.outside);
	assert.equal(days.length, 31);
	assert.equal(days[0]!.iso, '۱۴۰۴-۰۳-۰۱');
	assert.equal(days[0]!.n, day(2025, 4, 22));
	assert.equal(model.months[0]!.weeks[0]!.days[0]!.iso, '۱۴۰۴-۰۲-۲۷');
});

test('dates read at two clocks: fixed, days from today, or per component', () => {
	assert.deepEqual(whenOf([2026, 0, 12], [2026, 0, 12]), { y: 2026, m: 0, d: 12 });
	assert.deepEqual(whenOf([2026, 0, 15], [2027, 4, 20]), { t: 0 });
	assert.deepEqual(whenOf([2026, 0, 16], [2027, 4, 21]), { t: 1 });
	assert.deepEqual(whenOf([2026, 1, 12], [2027, 1, 12]), { y: 0, m: 1, d: 12, ry: 1 });
	assert.deepEqual(whenOf([2026, 0, 1], [2027, 4, 1]), { y: 0, m: 0, d: 1, ry: 1, rm: 1 });
});

test('the locale keeps only the names the calendar formats with', () => {
	const pruned = pruneLocale({ ...EN, months: { ...EN.months, 'narrow:formatting': [] }, days: { ...EN.days, 'narrow:standalone': [] } });
	assert.deepEqual(Object.keys(pruned.months).sort(), ['wide:formatting', 'wide:standalone']);
	assert.deepEqual(Object.keys(pruned.days).sort(), ['short:standalone', 'wide:formatting', 'wide:standalone']);
	assert.equal(pruned.ord.length, 31);
});

test("a blur from a day React no longer renders is not DayPicker's: the last focused day stays", () => {
	let view = dayPickerView(base, JAN_15);
	view = dayPickerNext(base, view, { t: 'focus', ...place(base, view, '2026-01-30') });
	view = dayPickerNext(base, view, { t: 'key', key: 'PageDown', shift: false });
	// The browser's focus left the Jan 30 button, which React unmounted with January.
	const afterMove = dayPickerNext(base, view, { t: 'blur' });
	assert.deepEqual([afterMove.f?.[0], afterMove.lf], [day(2026, 1, 28), null]);
	// Tabbing away from a day still shown is DayPicker's blur.
	const shown = dayPickerNext(base, dayPickerNext(base, view, { t: 'focus', ...place(base, view, '2026-02-10') }), { t: 'blur' });
	assert.deepEqual([shown.f, shown.lf?.[0]], [null, day(2026, 1, 10)]);
});

test('a preset button sets the selection and the month it falls in', () => {
	const view = dayPickerView(base, JAN_15);
	const set = dayPickerSet(base, view, { s: [{ t: 20 }], m: 'selected' });
	assert.equal(set.s[0], day(2026, 1, 4));
	assert.equal(dayPickerModel(base, set).months[0]!.caption, 'February 2026');
});

test("a dropdown's selected attribute stays on the first month React rendered; a remount's render writes none", () => {
	const dropdown: DayPickerConfig = { ...base, caption: 'dropdown' };
	const marked = (config: DayPickerConfig) => dayPickerModel(config, dayPickerNext(config, dayPickerView(config, JAN_15), { t: 'nav', dir: 1 })).months[0]!.monthOptions.find((o) => o.selected === '')?.value;
	assert.equal(marked(dropdown), '0');
	assert.equal(marked({ ...dropdown, remountMonth: true }), undefined);
});
