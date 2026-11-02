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

const message = (field: string, match: string, text: string, force = false) => `<template data-mm-rf-message="${field}" ${match.startsWith('#') ? `data-mm-rf-matcher="${match.slice(1)}"` : `data-mm-rf-match="${match}"`}${force ? ' data-mm-rf-force=""' : ''}><span data-slot="form-message">${text}</span></template>`;
const field = (name: string, input: string, messages: string, id = `radix-${name}`) => `<div data-slot="form-field" data-mm-rf-field="${name}"><label data-slot="form-label" data-mm-rf-label="${name}" for="${id}">${name}</label><input title="" data-slot="form-control" data-mm-rf-control="" id="${id}" name="${name}" ${input} />${messages}</div>`;

// The Cypress story's form (apps/storybook/stories/form.stories.tsx), as convert writes it.
const FORM = `<form data-slot="form" data-mm-rf="rfm_test" onsubmit="event.preventDefault(); window.submitted = Object.fromEntries(new FormData(this))">
${field('name', 'type="text" required', message('name', 'valueMissing', 'This value is missing') + message('name', 'valid', 'valid!'))}
${field('age', 'type="number" min="0" max="99" step="1"', message('age', 'rangeOverflow', 'This value is too large') + message('age', 'rangeUnderflow', 'This value is too small') + message('age', 'stepMismatch', 'This value does not match the required step'))}
${field('email', 'type="email"', message('email', 'typeMismatch', 'This value does not match the required type'))}
${field('password', 'type="password" minlength="8" maxlength="16"', message('password', 'tooShort', 'This value is too short'))}
${field('secret', 'type="text"', message('secret', '#0', 'This value is not valid'))}
${field('asyncSecret', 'type="text"', message('asyncSecret', '#1', 'This value is not valid'))}
${field('country', 'type="text" pattern="France|Spain"', message('country', 'patternMismatch', 'Country should be "France" or "Spain"'), 'my-country')}
<button type="submit" data-slot="form-submit">submit</button><button type="reset">reset</button></form>`;

// The story's matchers, as the generated module of the old source's functions exports them.
const MATCHERS = `export const matchers = [(value) => value !== 'shush', async (value) => { await new Promise((r) => setTimeout(r, 100)); return value !== 'shush'; }];`;

async function open(body = FORM): Promise<Page> {
	const page = await browser.newPage();
	const js = (text: string) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	await page.route('http://form.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${body}<script type="module">import { mount } from '/radix/form.js'; for (const f of document.querySelectorAll('[data-mm-rf]')) mount(f); window.ready = true;</script></body></html>` });
		if (path === '/radix/form.js') return route.fulfill({ contentType: 'text/javascript', body: js(await readFile(PART, 'utf8')) });
		if (path === '/radix-forms.ts') return route.fulfill({ contentType: 'text/javascript', body: `export const MATCHERS = { rfm_test: () => import('/matchers.js').then((m) => m.matchers) };` });
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
		const fieldEl = document.querySelector(`[data-mm-rf-field="${name}"]`)!;
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
	await page.waitForFunction(() => document.querySelector('[data-mm-rf-field="name"] > span'));
	const s = await state(page, 'name');
	assert.deepEqual(s.messages, ['This value is missing']);
	assert.equal(s.describedby, s.ids[0]);
	assert.match(s.ids[0]!, /^radix-/);
	assert.equal(s.attrs, '-/true -/true -/true');
	assert.equal(s.order, 'label,input,span,template,template', 'the message renders where its Form.Message is');
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
	await page.waitForFunction(() => document.querySelector('[data-mm-rf-field="asyncSecret"] > span'));
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

test('a forced message shows at once, and a message element order follows the source with several shown', async () => {
	const page = await open(`<form data-mm-rf="">${field('pin', 'type="text" pattern="\\d{4}"', message('pin', 'patternMismatch', 'This value does not match the required pattern', true) + message('pin', 'valueMissing', 'missing'))}</form>`);
	const s = await state(page, 'pin');
	assert.deepEqual(s.messages, ['This value does not match the required pattern']);
	assert.equal(s.describedby, s.ids[0]);
	await page.close();
});
