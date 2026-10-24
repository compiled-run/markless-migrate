// The React Aria calendar port's state: what useCalendarState and useRangeCalendarState do with keys, presses and
// paging, and the labels a page writes for what was chosen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { racCalendarModel, racCalendarNext, racCalendarView, racDateLabel, type CalendarMessages, type RacCalendarConfig, type RacCalendarView } from '../parts/react-aria/calendar.ts';

const MSGS: CalendarMessages = { next: 'Next', previous: 'Previous', todayDate: 'Today, {date}', todayDateSelected: 'Today, {date} selected', dateSelected: '{date} selected', selectedDateDescription: 'Selected Date: {date}', selectedRangeDescription: 'Selected Range: {dateRange}', dateRange: '{startDate} to {endDate}', minimumDate: 'First available date', maximumDate: 'Last available date' };
const single: RacCalendarConfig = { locale: 'en-US', cal: 'gregory', tz: 'UTC', months: 1, value: { y: 2026, m: 0, d: 15 }, msgs: MSGS };
const TODAY = '2026-01-20';

const cells = (config: RacCalendarConfig, view: RacCalendarView) => racCalendarModel(config, view).months.flatMap((m) => m.weeks.flatMap((w) => w.days));
const key = (config: RacCalendarConfig, view: RacCalendarView, k: string, shift = false) => racCalendarNext(config, view, { t: 'key', key: k, shift });
// The calendar's root: a press that set the anchor is told from the one that finishes the range by it.
const ROOT = {};
const click = (config: RacCalendarConfig, view: RacCalendarView, date: string) => (['start', 'up', 'click'] as const).reduce((v, phase) => racCalendarNext(config, v, { t: 'press', date, month: Number(date.slice(5, 7)) - 1, phase, pointer: 'mouse' }, ROOT), view);

test('a calendar opens on its value: its month, the value selected and the tab stop', () => {
	const view = racCalendarView(single, TODAY);
	const model = racCalendarModel(single, view);
	assert.equal(model.months[0]!.heading, 'January 2026');
	const selected = cells(single, view).filter((c) => c.ariaSelected === 'true');
	assert.deepEqual(selected.map((c) => c.key), ['2026-01-15']);
	assert.deepEqual(cells(single, view).filter((c) => c.tabindex === '0').map((c) => c.key), ['2026-01-15']);
	assert.ok(cells(single, view).find((c) => c.key === TODAY)?.today);
});

test('arrows, PageDown and End move the focused day as useCalendarState does, paging the month when it leaves', () => {
	let view = racCalendarView(single, TODAY);
	view = key(single, view, 'ArrowRight');
	assert.equal(view.f, '2026-01-16');
	view = key(single, view, 'ArrowDown');
	assert.equal(view.f, '2026-01-23');
	view = key(single, view, 'PageDown');
	assert.equal(view.f, '2026-02-23');
	assert.equal(racCalendarModel(single, view).months[0]!.heading, 'February 2026');
	view = key(single, view, 'PageUp', true);
	assert.equal(view.f, '2025-02-23');
	view = key(single, view, 'End');
	assert.equal(view.f, '2025-02-28');
});

test('a press chooses the day; Enter chooses the focused one', () => {
	let view = click(single, racCalendarView(single, TODAY), '2026-01-08');
	assert.deepEqual(view.v, ['2026-01-08']);
	view = key(single, key(single, view, 'ArrowRight'), 'Enter');
	assert.deepEqual(view.v, ['2026-01-09']);
});

test('a range calendar anchors on the first press and commits on the second, in either order', () => {
	const range: RacCalendarConfig = { ...single, value: undefined, range: true, rangeValue: null };
	let view = click(range, racCalendarView(range, TODAY), '2026-01-12');
	assert.equal(view.a, '2026-01-12');
	view = click(range, view, '2026-01-05');
	assert.equal(view.a ?? null, null);
	assert.deepEqual(view.r, ['2026-01-05', '2026-01-12']);
	const inRange = cells(range, view).filter((c) => c.selected);
	assert.equal(inRange.length, 8);
	assert.ok(cells(range, view).find((c) => c.key === '2026-01-05')?.selectionStart);
});

test('a chosen day is written the way the page wrote it', () => {
	assert.equal(racDateLabel({ loc: 'en-US', opts: { dateStyle: 'long' } }, ['2026-01-06']), 'January 6, 2026');
	assert.equal(racDateLabel({ loc: 'en-US', opts: { dateStyle: 'long' }, range: 'format' }, ['2026-01-04', '2026-01-09']), 'January 4\u2009–\u20099, 2026');
	assert.equal(racDateLabel({ loc: 'ar-u-nu-latn', opts: { dateStyle: 'long' } }, ['2026-01-06']), '6 يناير 2026');
});
