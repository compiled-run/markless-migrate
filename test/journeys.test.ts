import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageAsset } from '../src/check/browser.ts';
import { compareJourneys, describeStep, localUrl, type Journey, type StepResult } from '../src/check/journeys.ts';

const result = (over: Partial<StepResult>): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, ...over });
const pour = { role: 'button', name: 'Pour a cup', nth: 0 };
const journeys: Journey[] = [
	{ name: 'click button "Pour a cup"', steps: [{ action: 'click', target: pour }] },
	{ name: 'press Enter on button "Pour a cup"', steps: [{ action: 'press', key: 'Enter', target: pour }] },
];
const counted = (n: number) => result({ added: [`- status: "${n}"`], removed: ['- status: "0"'], announcements: [`output: ${n}`], focus: 'button "Pour a cup"' });

test('a step whose result differs on NEW fails; keyboard steps count as accessibility', () => {
	const old = [[counted(1)], [counted(1)]];
	assert.deepEqual(compareJourneys('/', [old, old], journeys, old), []);
	const failures = compareJourneys('/', [old, old], journeys, [[counted(2)], [counted(2)]]);
	assert.deepEqual(failures.map((f) => [f.dimension, f.check]), [
		['behaviour', 'click button "Pour a cup"'],
		['a11y', 'press Enter on button "Pour a cup"'],
	]);
	assert.match(failures[0]!.expected, /appears: - status: "1"; announced: output: 1/);
	assert.match(failures[0]!.actual, /announced: output: 2/);
});

test('a missing target stops the journey with the reason', () => {
	const old = [[counted(1)], [counted(1)]];
	const [f] = compareJourneys('/', [old, old], journeys.slice(0, 1), [[result({ failed: 'button "Pour a cup" could not be used: timeout' })]]);
	assert.equal(f!.actual, 'button "Pour a cup" could not be used: timeout');
});

test('after a navigation only the URL, requests and errors are compared, not the landing page content or focus', () => {
	const nav: Journey[] = [{ name: 'click link "About"', steps: [{ action: 'click', target: { role: 'link', name: 'About', nth: 0 } }] }];
	const old = [[result({ url: '/about', navigated: true, added: ['- heading "About us"'] })]];
	assert.deepEqual(compareJourneys('/', [old, old], nav, [[result({ url: '/about', navigated: true, added: ['- heading "About"'], focus: 'link "Skip"' })]]), []);
	const [f] = compareJourneys('/', [old, old], nav, [[result({ url: '/about-us', navigated: true })]]);
	assert.equal(f!.expected, 'URL /about');
});

test('noise between OLD runs is allowed only where they differed', () => {
	const stamp = (t: string) => [[result({ added: [`- time: 2026-10-16T05:47:${t}Z`] })]];
	const one: Journey[] = [{ name: 'click button "Refresh"', steps: [{ action: 'click', target: { role: 'button', name: 'Refresh', nth: 0 } }] }];
	assert.deepEqual(compareJourneys('/', [stamp('57.922'), stamp('58.101')], one, stamp('59.384')), []);
	assert.equal(compareJourneys('/', [stamp('57.922'), stamp('58.101')], one, [[result({ added: ['- time: soon'] })]]).length, 1);
});

test('steps describe themselves in plain words, and loopback redirects stay local', () => {
	assert.equal(describeStep({ action: 'submit', target: { role: 'button', name: 'Send', nth: 0 }, fields: [{ target: { role: 'textbox', name: 'Email', nth: 0 }, value: 'a@b.c' }] }), 'fill textbox "Email" and submit with button "Send"');
	assert.equal(localUrl('http://localhost:4000/en/contact?sent=1', 'http://127.0.0.1:4000'), '/en/contact?sent=1');
	assert.equal(localUrl('http://localhost:4001/x', 'http://127.0.0.1:4000'), 'http://localhost:4001/x');
	assert.equal(localUrl('https://shop.example/cart', 'http://127.0.0.1:4000'), 'https://shop.example/cart');
});

test("journeys load a page's own CDN scripts, styles, fonts and images, but not other origins' frames or data calls", () => {
	for (const type of ['script', 'stylesheet', 'font', 'image']) assert.ok(pageAsset('GET', type), type);
	for (const type of ['fetch', 'xhr', 'document', 'websocket', 'eventsource', 'other']) assert.ok(!pageAsset('GET', type), type);
	assert.ok(!pageAsset('POST', 'script'));
});
