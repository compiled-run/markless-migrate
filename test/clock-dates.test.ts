import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthNamesIn, rewrite } from '../parts/clock.ts';
import { clockMarks, type ClockText } from '../src/convert/clock.ts';
import { LATER } from '../src/convert/day-picker.ts';
import { DEFAULT_FREEZE } from '../src/check/freeze.ts';

const text = (path: string, value: string, chart?: true): ClockText => ({ path, sig: `p|${path}`, nth: 0, t: 0, text: value, ...(chart ? { chart: 0 } : {}) });

// The same page read at the capture clock (2026-01-15 12:00 UTC), behind UTC, and at LATER (2027-05-20).
test('a date that moves a day back behind UTC is a fixed instant; one that moves with the clock is days from today or this year', () => {
	const marks = clockMarks(
		[text('0', 'June 01, 2025'), text('1', 'published on January 17, 2026.'), text('2', 'January 20 – February 9, 2026'), text('3', 'Released March 3, 2024'), text('4', 'Apr 2', true)],
		[text('0', 'May 31, 2025'), text('1', 'published on January 17, 2026.'), text('2', 'January 20 – February 9, 2026'), text('3', 'Released March 3, 2024'), text('4', 'Apr 1', true)],
		[text('0', 'June 01, 2025'), text('1', 'published on May 22, 2027.'), text('2', 'January 20 – February 9, 2027'), text('3', 'Released March 3, 2024'), text('4', 'Apr 2', true)],
		{ t0: DEFAULT_FREEZE.time, t1: LATER },
	);
	assert.deepEqual(marks, [
		{ sig: 'p|0', nth: 0, rules: [{ x: 'June 01, 2025', at: Date.UTC(2025, 5, 1) }] },
		{ sig: 'p|1', nth: 0, rules: [{ x: 'January 17, 2026', in: 2 }] },
		{ sig: 'p|2', nth: 0, rules: [{ x: 'February 9, 2026', year: [0, 1, 9] }] },
		{ sig: '', nth: 0, chart: 0, rules: [{ '*': 2026 }] },
	]);
});

test('each rule writes its date for the visitor: the instant in their time zone, today plus days, this year', () => {
	const now = new Date(2026, 9, 24, 15).getTime();
	assert.equal(rewrite('published on January 17, 2026.', [{ x: 'January 17, 2026', in: 2 }], now), 'published on October 26, 2026.');
	assert.equal(rewrite('January 20 – February 9, 2026', [{ x: 'February 9, 2026', year: [0, 1, 9] }], new Date(2027, 2, 1).getTime()), 'January 20 – February 9, 2027');
	const local = new Date(Date.UTC(2025, 5, 1));
	assert.equal(rewrite('June 01, 2025', [{ x: 'June 01, 2025', at: Date.UTC(2025, 5, 1) }]), `${['May', 'June'][local.getMonth() - 4]} ${String(local.getDate()).padStart(2, '0')}, 2025`, 'in this process\'s time zone');
	assert.equal(rewrite('Fri, Apr 5, 2024 Page Views', [{ '*': 2026 }]), `${local.getTimezoneOffset() > 0 ? 'Thu, Apr 4' : 'Fri, Apr 5'}, 2024 Page Views`, 'a chart region writes every date in it, its weekday too');
	assert.equal(rewrite('Updated Jan 3', [{ x: 'Jan 4', in: 1 }], now), 'Updated Jan 3', 'a date no rule names is left');
});

test('"May" names its month in either form: a chart region writes it as its other dates name theirs', () => {
	const zone = process.env.TZ;
	process.env.TZ = 'America/Chicago';
	try {
		assert.equal(monthNamesIn('Apr 5 Apr 21 May 8 Jun 29'), 'short');
		assert.equal(monthNamesIn('July 15, 2024 May 2'), 'long');
		assert.equal(monthNamesIn('May 8'), undefined, 'May alone does not tell');
		assert.equal(rewrite('May 1, 2024', [{ '*': 2026 }], Date.now(), 'short'), 'Apr 30, 2024');
		assert.equal(rewrite('May 1, 2024', [{ '*': 2026 }], Date.now(), 'long'), 'April 30, 2024');
		assert.equal(rewrite('May 1, 2024', [{ '*': 2026 }]), 'April 30, 2024', 'with nothing to tell, as before');
	} finally {
		if (zone === undefined) delete process.env.TZ;
		else process.env.TZ = zone;
	}
});
