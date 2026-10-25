import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureA11y, compareA11y } from '../src/check/a11y.ts';

// react-hn has no landmarks; its port renders every variant of a row and hides the ones not shown.
const OLD = `<div class="App"><div class="App__header"><a href="/news">React HN</a> | <a href="/newest">new</a> <span>settings</span></div>
<div class="Items"><div class="Item"><a href="/story/1">A story</a><div class="Item__meta"><span>12 points</span> by <a href="/user/a">a</a></div></div>
<div class="Item"><a href="/story/2">Another story</a><div class="Item__meta"><span>3 points</span> by <a href="/user/b">b</a></div></div></div>
<div class="App__footer">react-hn v1.7.1</div></div>`;
const HIDDEN = OLD.replace(/<div class="Item">/g, '<div class="Item"><div class="Spinner" hidden></div>').replace('<div class="Items">', '<div hidden>settings panel</div><div class="Items">');

async function capture(browser: Browser, html: string) {
	const page = await browser.newPage();
	await page.setContent(`<!doctype html><html lang="en"><head><title>t</title></head><body>${html}</body></html>`);
	const out = await captureA11y(page);
	await page.close();
	return out;
}

test('content outside the landmarks, reported at another granularity because hidden elements sit among it, is the same content', async () => {
	const browser = await chromium.launch();
	try {
		const old = await capture(browser, OLD);
		const next = await capture(browser, HIDDEN);
		assert.ok((next.violations.region?.count ?? 0) > (old.violations.region?.count ?? 0), 'the fixture reproduces the finer report');
		assert.deepEqual(compareA11y('/', 'desktop', old, [], next).filter((f) => f.check.startsWith('axe region')), []);
	} finally {
		await browser.close();
	}
});

test('new text outside the landmarks is still a region failure', async () => {
	const browser = await chromium.launch();
	try {
		const old = await capture(browser, OLD);
		const next = await capture(browser, HIDDEN.replace('react-hn v1.7.1', 'react-hn v1.7.1</div><div>A banner the old page did not have'));
		const failure = compareA11y('/', 'desktop', old, [], next).find((f) => f.check.startsWith('axe region'));
		assert.ok(failure);
		assert.match(failure.actual, /A banner the old page did not have/);
	} finally {
		await browser.close();
	}
});

test('a line of text axe reports in pieces on the new page, because a hidden element sits inside it, is the same text', async () => {
	const browser = await chromium.launch();
	try {
		const old = await capture(browser, '<div class="Comment__meta"><a href="/user/a">bellerocky</a> <time>12 years ago</time> | on: <a href="/story/1">React v0.11</a></div>');
		const next = await capture(browser, '<div class="Comment__meta"><span><a href="/user/a">bellerocky</a> <time>12 years ago</time><span hidden> | <a href="">parent</a></span><span> | on: <a href="/story/1">React v0.11</a></span></span></div>');
		assert.ok((next.violations.region?.count ?? 0) > (old.violations.region?.count ?? 0), 'the fixture reproduces the split report');
		assert.deepEqual(compareA11y('/', 'desktop', old, [], next).filter((f) => f.check.startsWith('axe region')), []);
	} finally {
		await browser.close();
	}
});
