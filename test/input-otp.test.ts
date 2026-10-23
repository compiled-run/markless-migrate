import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attr, body, parseDocument, walk } from '../src/convert/dom.ts';
import { OtpPlan } from '../src/convert/otp.ts';
import { emitElement } from '../src/convert/tsrx.ts';
import { accept, mirror } from '../parts/input-otp.ts';

const FIELD = '<body><div data-input-otp-container="true" class="c"><div data-slot="input-otp-slot" data-active="false">1</div><div data-slot="input-otp-slot" data-active="false"></div><div style="position:absolute"><input data-slot="input-otp" data-input-otp="true" maxlength="2" value="1" data-input-otp-mss="0" data-input-otp-mse="0"></div></div><p class="t">You entered: 1</p></body>';

test('an input-otp field is state: slots show the value and mark the mirrored selection, the empty active slot shows the caret', () => {
	const doc = parseDocument(FIELD);
	const all = [...walk(body(doc))];
	const container = all.find((el) => attr(el, 'data-input-otp-container') !== undefined)!;
	const text = all.find((el) => attr(el, 'class') === 't')!;
	const plan = new OtpPlan();
	const placed = plan.add([{ sig: 'c', nth: 0, caret: '<i class="caret"></i>', texts: [{ sig: 't', nth: 0, empty: 'Enter it.', filled: 'You entered: 12', typed: '12' }] }], (sig) => (sig === 'c' ? container : text), (html) => html);
	assert.equal(placed, 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.deepEqual(plan.bind(container)?.declare, ['let otp0 = state("1");', 'let otp0s = state(0);', 'let otp0e = state(0);', 'let otp0f = state(false);']);
	assert.match(out, /onMmotp=\{\(event\) => \{ const d = .*otp0 = d\.v; otp0s = d\.s; otp0e = d\.e; otp0f = d\.f; \}\}/);
	assert.match(out, /data-active=\{otp0f && \(\(otp0s === otp0e && 1 === otp0s\) \|\| \(1 >= otp0s && 1 < otp0e\)\) \? "true" : "false"\}>\{otp0\.charAt\(1\)\}@if \(.* && otp0\.length <= 1\) \{ <i class="caret"><\/i> \}<\/div>/);
	assert.match(out, /value=\{otp0\} data-input-otp-placeholder-shown=\{otp0\.length === 0 \? "true" : undefined\} data-input-otp-mss=\{otp0s === -1 \? undefined : otp0s\}/);
	assert.doesNotMatch(out, /value="1"/);
	assert.match(out, /<p class="t">\{otp0 === "" \? "Enter it\." : "You entered: " \+ otp0 \+ ""\}<\/p>/);
});

test('a disabled field, or one whose slots do not match its length, is left as the old page showed it', () => {
	const doc = parseDocument(FIELD.replace('maxlength="2"', 'maxlength="2" disabled'));
	const container = [...walk(body(doc))].find((el) => attr(el, 'data-input-otp-container') !== undefined)!;
	assert.equal(new OtpPlan().add([{ sig: 'c', nth: 0, texts: [] }], () => container, (h) => h), 0);
	const short = parseDocument(FIELD.replace('maxlength="2"', 'maxlength="6"'));
	const other = [...walk(body(short))].find((el) => attr(el, 'data-input-otp-container') !== undefined)!;
	assert.equal(new OtpPlan().add([{ sig: 'c', nth: 0, texts: [] }], () => other, (h) => h), 0);
});

test('input-otp keeps a change its pattern accepts, cut to the length, and undoes one it refuses', () => {
	assert.equal(accept('123', '12', 6, '^\\d+$'), '123');
	assert.equal(accept('12a', '12', 6, '^\\d+$'), '12');
	assert.equal(accept('1234567', '', 6, null), '123456');
	assert.equal(accept('', '12', 6, '^\\d+$'), '', 'emptying is always allowed');
});

test('the mirrored selection selects the slot under a single caret, as input-otp does', () => {
	const none = [null, null, null] as const;
	assert.deepEqual(mirror('12', 2, 2, 'none', 6, none), { start: 2, end: 2, direction: 'none' }, 'typing at the end: the next slot');
	assert.deepEqual(mirror('123456', 6, 6, 'none', 6, none), { start: 5, end: 6, direction: 'backward', select: [5, 6, 'backward'] }, 'a full field: the last slot');
	assert.deepEqual(mirror('123', 0, 0, 'none', 6, none), { start: 0, end: 1, direction: 'forward', select: [0, 1, 'forward'] });
	assert.deepEqual(mirror('123', 1, 1, 'none', 6, [2, 3, 'forward']), { start: 0, end: 1, direction: 'backward', select: [0, 1, 'backward'] }, 'moving back from a selected slot selects the one before');
	assert.deepEqual(mirror('123', 2, 2, 'none', 6, [1, 2, 'forward']), { start: 2, end: 3, direction: 'forward', select: [2, 3, 'forward'] });
	assert.deepEqual(mirror('', 0, 0, 'none', 6, none), { start: 0, end: 0, direction: 'none' }, 'an empty field keeps the caret');
});
