import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageAsset } from '../src/check/browser.ts';
import { compareJourneys, describeStep, labelled, localUrl, movedLines, type Journey, type StepResult } from '../src/check/journeys.ts';

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

test('the same requests in another order are the same step result', () => {
	const old = [[result({ requests: ['POST a.example/q', 'POST b.example/q'] })], [result({ requests: ['POST a.example/q', 'POST b.example/q'] })]];
	assert.deepEqual(compareJourneys('/', [old, old], journeys, [[result({ requests: ['POST b.example/q', 'POST a.example/q'] })], [result({ requests: ['POST b.example/q', 'POST a.example/q'] })]]), []);
	assert.equal(compareJourneys('/', [old, old], journeys, [[result({ requests: ['POST a.example/q'] })], [result({ requests: ['POST a.example/q'] })]]).length, 2);
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
	assert.equal(localUrl('http://localhost:4000/login?callbackUrl=http%3A%2F%2Flocalhost%3A4000%2Fdashboard', 'http://localhost:4000'), '/login?callbackUrl=%7Borigin%7D%2Fdashboard');
});

test("journeys load a page's own CDN scripts, styles, fonts and images, but not other origins' frames or data calls", () => {
	for (const type of ['script', 'stylesheet', 'font', 'image']) assert.ok(pageAsset('GET', type), type);
	for (const type of ['fetch', 'xhr', 'document', 'websocket', 'eventsource', 'other']) assert.ok(!pageAsset('GET', type), type);
	assert.ok(!pageAsset('POST', 'script'));
});

test('an app origin written into a redirect query is the same on both apps', async () => {
	const { toLocal } = await import('../src/check/capture.ts');
	assert.equal(toLocal('http://localhost:3100/login?callbackUrl=http%3A%2F%2Flocalhost%3A3100%2Fdashboard', 'http://localhost:3100'), toLocal('http://localhost:47310/login?callbackUrl=http%3A%2F%2Flocalhost%3A47310%2Fdashboard', 'http://localhost:47310'));
	assert.equal(toLocal('https://elsewhere.example/?next=http://localhost:3100/a', 'http://localhost:3100'), 'https://elsewhere.example/?next=http://localhost:3100/a');
});

test('a step that only reorders nodes reports what moved, and a new page that leaves them in place differs', () => {
	const rows = ['- grid', '- row "gamma"', '- row "alpha"', '- row "beta"'];
	assert.deepEqual(movedLines(rows, ['- grid', '- row "alpha"', '- row "beta"', '- row "gamma"']), ['- row "gamma"']);
	assert.deepEqual(movedLines(rows, rows), []);
	assert.deepEqual(movedLines(rows, ['- grid', '- row "gamma"', '- row "alpha"', '- row "delta"']), [], 'a replaced node is added and removed, not moved');
	const sort = [{ name: 'click columnheader "Name"', steps: [{ action: 'click' as const, target: { role: 'columnheader', name: 'Name', nth: 0 } }] }];
	const old = [[result({ moved: ['- row "gamma"'] })]];
	assert.deepEqual(compareJourneys('/', [old, old], sort, old), []);
	assert.deepEqual(compareJourneys('/', [old, old], sort, [[result({})]]).map((f) => f.check), ['click columnheader "Name"']);
});

test('an element found by its listeners is located by its exact text, innermost first, or by its label when it has no text', () => {
	assert.equal(labelled("it's"), `//body//*[(normalize-space(.)=concat('it', "'", 's') and not(*[normalize-space(.)=concat('it', "'", 's')])) or (normalize-space(.)='' and (@aria-label=concat('it', "'", 's') or @title=concat('it', "'", 's')))]`);
});

test("an error the old app's own page logs on a plain load is not the port's when a NEW journey reaches that page on the old app", () => {
	const nav: Journey[] = [{ name: 'click link "Guide"', steps: [{ action: 'click', target: { role: 'link', name: 'Guide', nth: 0 } }] }];
	const old = [[result({ url: '/guide/', navigated: true })]];
	const reached = [[result({ url: '/guide/', navigated: true, door: true, errors: ['Failed to patch FloatingVue'] })]];
	assert.equal(compareJourneys('/', [old, old], nav, reached).length, 1);
	assert.deepEqual(compareJourneys('/', [old, old], nav, reached, undefined, new Map([['/guide/', ['Failed to patch FloatingVue']]])), []);
	const more = [[result({ url: '/guide/', navigated: true, door: true, errors: ['Failed to patch FloatingVue', 'TypeError: x is undefined'] })]];
	assert.equal(compareJourneys('/', [old, old], nav, more, undefined, new Map([['/guide/', ['Failed to patch FloatingVue']]])).length, 1, 'an error the page does not log on its own still fails');
	const here = [[result({ url: '/guide/', navigated: true, errors: ['Failed to patch FloatingVue'] })]];
	assert.equal(compareJourneys('/', [old, old], nav, here, undefined, new Map([['/guide/', ['Failed to patch FloatingVue']]])).length, 1, 'a page the new app serves itself is the port');
});

test('a clock that ticked during a step is not a difference, and a clock that goes away or a changed count still is', () => {
	const close = { role: 'button', name: 'Close banner', nth: 0 };
	const banner: Journey[] = [{ name: 'click button "Close banner"', steps: [{ action: 'click', target: close }] }];
	const gone = '- link "ViteConf 2026"';
	// The old page's 1 s timer ticked while the step ran; the new page's did not.
	const old = [[result({ added: ['- heading "63:02:59:59" [level=2]'], removed: [gone, '- heading "63:03:00:00" [level=2]'] })]];
	assert.deepEqual(compareJourneys('/live', [old, old], banner, [[result({ removed: [gone] })]]), []);
	const hidden = [[result({ removed: ['- heading "63:02:59:56" [level=2]'] })]];
	assert.deepEqual(compareJourneys('/live', [hidden, hidden], banner, [[result({ removed: ['- heading "63:03:00:00" [level=2]'] })]]), [], 'the same clock hidden at another reading');
	assert.equal(compareJourneys('/live', [hidden, hidden], banner, [[result({})]]).length, 1, 'a clock the new page does not hide');
	assert.equal(compareJourneys('/live', [old, old], banner, [[result({ removed: [gone, '- heading "63:03:00:00" [level=2]'] })]]).length, 1, 'a clock the new page removes');
	assert.equal(compareJourneys('/', [[[counted(1)]], [[counted(1)]]], journeys.slice(0, 1), [[counted(2)]]).length, 1, 'a count is not a clock');
});

test('a button the new page marks aria-expanded when it opens a menu, where the old page set no state, is an improvement, listed and not red', () => {
	const menu: Journey[] = [{ name: 'click button "Change language"', steps: [{ action: 'click', target: { role: 'button', name: 'Change language', nth: 0 } }] }];
	const opened = ['- paragraph: English', '- link "日本語":'];
	const old = [[result({ added: opened })]];
	const improvements: string[] = [];
	const better = [[result({ added: ['- button "Change language" [expanded]:', ...opened], removed: ['- button "Change language":'] })]];
	assert.deepEqual(compareJourneys('/', [old, old], menu, better, undefined, undefined, improvements), []);
	assert.match(improvements[0]!, /button "Change language" sets aria-expanded when it opens what it controls/);
	const focused = [[result({ added: opened, focus: 'button "Change language"' })]];
	assert.deepEqual(compareJourneys('/', [focused, focused], menu, [[result({ added: ['- button "Change language" [expanded]:', ...opened], removed: ['- button "Change language":'], focus: 'button "Change language" [expanded]' })]]), [], 'focus stays on the same button');
	// What else the step does is still compared: the menu not opening stays red.
	assert.equal(compareJourneys('/', [old, old], menu, [[result({ added: ['- button "Change language" [expanded]:'], removed: ['- button "Change language":'] })]]).length, 1);
	// A state the old page sets differently is a difference, not an improvement.
	const toggles = [[result({ added: ['- button "Change language" [pressed]:', ...opened], removed: ['- button "Change language":'] })]];
	assert.equal(compareJourneys('/', [toggles, toggles], menu, better).length, 1);
});

test('a step answered more slowly on the new page is red only when neither side asked the server first', async () => {
	const { slowerAnswer } = await import('../src/check/journeys.ts');
	const at = (ms: number, requests: string[] = []) => result({ requests, reaction: { regions: [], changes: [], answeredMs: ms } });
	assert.match(slowerAnswer([at(40), at(60)], at(400)) ?? '', /old page changes 60 ms after the step; the new page 400 ms/);
	assert.equal(slowerAnswer([at(40), at(60)], at(140)), undefined, 'within 100 ms');
	assert.equal(slowerAnswer([at(40, ['POST /api/contact']), at(60, ['POST /api/contact'])], at(3000, ['POST /api/contact'])), undefined, 'the server answered first');
});
