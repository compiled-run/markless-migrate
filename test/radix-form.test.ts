// The Radix Form port driven in a real browser over the markup convert's RadixFormPlan writes, against what
// @radix-ui/react-form 0.1.8 (radix-ui 1.4.3) does with the same fields: when a control is validated (its invalid event,
// its native change), which messages then show, the attributes it and its field and label carry, and focus on submit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';

const PART = join(import.meta.dirname, '..', 'parts', 'radix', 'form.ts');

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

interface Msg {
	readonly field: string;
	readonly match: string;
	readonly text: string;
}
const msg = (field: string, match: string, text: string): Msg => ({ field, match, text });
const field = (name: string, input: string, messages: readonly Msg[], all: Msg[], id = `radix-${name}`) =>
	`<div data-slot="form-field" data-f="${name}"><label data-slot="form-label" data-f="${name}" for="${id}">${name}</label><input title="" data-slot="form-control" data-mm-rf-control="" data-f="${name}" id="${id}" name="${name}" ${input} />${messages.map((m) => `<!--m${all.push(m) - 1}-->`).join('')}</div>`;

// The Cypress story's form (apps/storybook/stories/form.stories.tsx), as convert writes it: each message an arm at its
// place, here a comment the stand-in for Markless renders the arm after.
function story(): { html: string; messages: Msg[] } {
	const all: Msg[] = [];
	const html = `<form data-slot="form" data-mm-rf="rf_test" onsubmit="event.preventDefault(); window.submitted = Object.fromEntries(new FormData(this))">
${field('name', 'type="text" required', [msg('name', 'valueMissing', 'This value is missing'), msg('name', 'valid', 'valid!')], all)}
${field('age', 'type="number" min="0" max="99" step="1"', [msg('age', 'rangeOverflow', 'This value is too large'), msg('age', 'rangeUnderflow', 'This value is too small'), msg('age', 'stepMismatch', 'This value does not match the required step')], all)}
${field('email', 'type="email"', [msg('email', 'typeMismatch', 'This value does not match the required type')], all)}
${field('password', 'type="password" minlength="8" maxlength="16"', [msg('password', 'tooShort', 'This value is too short')], all)}
${field('secret', 'type="text"', [msg('secret', '#0', 'This value is not valid')], all)}
${field('asyncSecret', 'type="text"', [msg('asyncSecret', '#1', 'This value is not valid')], all)}
${field('country', 'type="text" pattern="France|Spain"', [msg('country', 'patternMismatch', 'Country should be "France" or "Spain"')], all, 'my-country')}
<button type="submit" data-slot="form-submit">submit</button><button type="reset">reset</button></form>`;
	return { html, messages: all };
}

// The story's matchers, as the generated module of the old source's functions exports them.
const MATCHERS = `export const matchers = [(value) => value !== 'shush', async (value) => { await new Promise((r) => setTimeout(r, 100)); return value !== 'shush'; }];`;

// What Markless renders from the form's state: each shown message after its place, the flags and the descriptions.
const STAND_IN = `const form = document.querySelector('[data-mm-rf]');
const places = [];
const walker = document.createTreeWalker(form, NodeFilter.SHOW_COMMENT);
while (walker.nextNode()) places.push(walker.currentNode);
const shown = new Map();
form.addEventListener('mmradixform', (event) => {
	const view = event.detail;
	MESSAGES.forEach((m, k) => {
		if (view.s[k] && !shown.has(k)) { const span = document.createElement('span'); span.id = 'radix-m' + k; span.setAttribute('data-slot', 'form-message'); span.textContent = m.text; places[k].after(span); shown.set(k, span); }
		if (!view.s[k] && shown.has(k)) { shown.get(k).remove(); shown.delete(k); }
	});
	for (const el of form.querySelectorAll('[data-f]')) {
		const f = el.getAttribute('data-f');
		for (const [attr, value] of [['data-valid', view.v[f]], ['data-invalid', view.i[f]], ...(el.tagName === 'INPUT' ? [['aria-describedby', view.d[f]]] : [])]) value === undefined ? el.removeAttribute(attr) : el.setAttribute(attr, value);
	}
});`;

async function open(made = story()): Promise<Page> {
	const page = await browser.newPage();
	const js = (text: string) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	const messages = made.messages.map((m, k) => ({ field: m.field, id: `radix-m${k}`, ...(m.match.startsWith('#') ? { matcher: Number(m.match.slice(1)) } : { match: m.match }) }));
	const fields = [...new Set(made.messages.map((m) => m.field))];
	await page.route('http://form.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${made.html}<script type="module">const MESSAGES = ${JSON.stringify(made.messages)};\n${STAND_IN}\nimport { mount } from '/radix/form.js'; mount(form); window.ready = true;</script></body></html>` });
		if (path === '/radix/form.js') return route.fulfill({ contentType: 'text/javascript', body: js(await readFile(PART, 'utf8')) });
		if (path === '/radix-forms.ts') return route.fulfill({ contentType: 'text/javascript', body: `export const FORMS = { rf_test: { fields: ${JSON.stringify(fields)}, messages: ${JSON.stringify(messages)}, described: {}, matchers: () => import('/matchers.js').then((m) => m.matchers) } };` });
		if (path === '/matchers.js') return route.fulfill({ contentType: 'text/javascript', body: MATCHERS });
		return route.fulfill({ status: 404, body: '' });
	});
	await page.goto('http://form.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	return page;
}

/** The field's shown messages, the control's describedby, and the valid/invalid attributes on field, label and control. */
async function state(page: Page, name: string) {
	return page.evaluate((name) => {
		const fieldEl = document.querySelector(`div[data-f="${name}"]`)!;
		const control = fieldEl.querySelector('input')!;
		const label = fieldEl.querySelector('label')!;
		const spans = [...fieldEl.querySelectorAll(':scope > span')];
		const flags = (el: Element) => `${el.getAttribute('data-valid') ?? '-'}/${el.getAttribute('data-invalid') ?? '-'}`;
		return {
			messages: spans.map((s) => s.textContent),
			ids: spans.map((s) => s.id),
			describedby: control.getAttribute('aria-describedby'),
			attrs: [flags(fieldEl), flags(label), flags(control)].join(' '),
			order: [...fieldEl.children].map((c) => c.tagName.toLowerCase()).join(','),
		};
	}, name);
}

test('a submit with a missing value shows valueMissing, describes the control with it and focuses the first invalid control', async () => {
	const page = await open();
	await page.click('text=submit');
	await page.waitForFunction(() => document.querySelector('div[data-f="name"] > span'));
	const s = await state(page, 'name');
	assert.deepEqual(s.messages, ['This value is missing']);
	assert.equal(s.describedby, s.ids[0]);
	assert.match(s.ids[0]!, /^radix-/);
	assert.equal(s.attrs, '-/true -/true -/true');
	assert.equal(s.order, 'label,input,span', 'the message renders where its Form.Message is');
	assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'name');
	assert.equal(await page.evaluate(() => (window as unknown as { submitted?: unknown }).submitted), undefined);
	// Typing resets the field (React's onChange); leaving it validates it (the native change).
	await page.keyboard.type('John');
	assert.deepEqual((await state(page, 'name')).messages, []);
	assert.equal((await state(page, 'name')).describedby, null);
	assert.equal((await state(page, 'name')).attrs, '-/- -/- -/-');
	await page.keyboard.press('Tab');
	const valid = await state(page, 'name');
	assert.deepEqual(valid.messages, ['valid!']);
	assert.equal(valid.describedby, valid.ids[0]);
	assert.equal(valid.attrs, 'true/- true/- true/-');
	await page.close();
});

test('a built-in error shows only the messages matching the control validity, and a fix takes them away', async () => {
	const page = await open();
	await page.focus('#radix-age');
	await page.keyboard.type('200');
	await page.keyboard.press('Tab');
	assert.deepEqual((await state(page, 'age')).messages, ['This value is too large']);
	await page.focus('#radix-age');
	await page.fill('#radix-age', '10.5');
	await page.keyboard.press('Tab');
	assert.deepEqual((await state(page, 'age')).messages, ['This value does not match the required step']);
	await page.fill('#radix-age', '');
	await page.focus('#radix-age');
	await page.keyboard.type('50');
	await page.keyboard.press('Tab');
	const fixed = await state(page, 'age');
	assert.deepEqual(fixed.messages, []);
	assert.equal(fixed.attrs, 'true/- true/- true/-');
	await page.focus('#radix-password');
	await page.keyboard.type('pass');
	await page.keyboard.press('Tab');
	assert.deepEqual((await state(page, 'password')).messages, ['This value is too short']);
	await page.focus('#my-country');
	await page.keyboard.type('Portugal');
	await page.keyboard.press('Tab');
	const country = await state(page, 'country');
	assert.deepEqual(country.messages, ['Country should be "France" or "Spain"']);
	assert.equal(country.describedby, country.ids[0]);
	await page.close();
});

test('a custom matcher shows its message once the value passes the built-in checks, sync at once and async once it resolves', async () => {
	const page = await open();
	await page.focus('#radix-secret');
	await page.keyboard.type('secret');
	await page.keyboard.press('Tab');
	const sync = await state(page, 'secret');
	assert.deepEqual(sync.messages, ['This value is not valid']);
	assert.equal(sync.attrs, '-/true -/true -/true');
	assert.equal(await page.evaluate(() => (document.querySelector('#radix-secret') as HTMLInputElement).validationMessage), 'This value is not valid');
	await page.fill('#radix-secret', '');
	await page.focus('#radix-secret');
	await page.keyboard.type('shush');
	await page.keyboard.press('Tab');
	assert.deepEqual((await state(page, 'secret')).messages, []);
	await page.focus('#radix-asyncSecret');
	await page.keyboard.type('secret');
	await page.keyboard.press('Tab');
	// Radix reports the built-in validity first and the async matcher's error once its promise settles.
	assert.deepEqual((await state(page, 'asyncSecret')).messages, []);
	assert.equal((await state(page, 'asyncSecret')).attrs, 'true/- true/- true/-');
	await page.waitForFunction(() => document.querySelector('div[data-f="asyncSecret"] > span'));
	assert.deepEqual((await state(page, 'asyncSecret')).messages, ['This value is not valid']);
	await page.close();
});

test('a submit that passes leaves the messages alone and reaches the page; reset clears every field', async () => {
	const page = await open();
	await page.focus('#radix-email');
	await page.keyboard.type('john.doe');
	await page.keyboard.press('Tab');
	assert.deepEqual((await state(page, 'email')).messages, ['This value does not match the required type']);
	await page.click('text=reset');
	assert.deepEqual((await state(page, 'email')).messages, []);
	assert.equal((await state(page, 'email')).attrs, '-/- -/- -/-');
	await page.focus('#radix-name');
	await page.keyboard.type('John');
	await page.click('text=submit');
	assert.deepEqual(await page.evaluate(() => (window as unknown as { submitted?: Record<string, string> }).submitted?.name), 'John');
	await page.close();
});
