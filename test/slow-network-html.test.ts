import assert from 'node:assert/strict';
import { test } from 'node:test';
import { networkHtml } from '../src/check/slow-network-html.ts';
import { summarizeCell, type NetworkRun, type SideNetwork } from '../src/check/slow-network.ts';

test('the shareable page has a table per browser and network and each page\'s request timeline, marked at its paint and its answer', () => {
	const run: NetworkRun = {
		ttfb: 800, firstFrame: 1100, answered: 2600, clicks: 3, bytes: 180_000, jsDownloaded: 70_000,
		requests: [
			{ url: 'https://qwik.example/docs/tabs/', type: 'document', start: 0, end: 900, bytes: 57_000 },
			{ url: 'https://qwik.example/build/q-<x>.js', type: 'script', start: 1200, end: 2500, bytes: 52_000 },
		],
	};
	const sides: SideNetwork[] = [
		{ url: 'https://qwik.example/docs/tabs/', cells: [summarizeCell('regular-2g', 'firefox', [run])] },
		{ url: 'https://port.example/docs/tabs', cells: [summarizeCell('regular-2g', 'firefox', [{ ...run, answered: 9000 }])] },
	];
	const html = networkHtml(sides, ['qwik.example', 'port.example']);
	assert.match(html, /<h2>firefox, Regular 2G \(256 kbit\/s, 300 ms RTT\): median of 1 cold loads<\/h2>/);
	assert.match(html, /<th>qwik\.example<\/th><th>port\.example<\/th>/);
	assert.match(html, /<td>First click answered<\/td><td>2\.60 s<\/td><td>9\.00 s<\/td>/);
	assert.match(html, /<h3>qwik\.example: the median run's requests<\/h3>/);
	assert.match(html, /\/build\/q-&#60;x&#62;\.js/);
	assert.match(html, /class="mark paint" style="left:[\d.]+%" title="first painted frame 1\.10 s"/);
	assert.match(html, /class="mark answer" style="left:[\d.]+%" title="first click answered 2\.60 s"/);
	assert.match(html, /Firefox DevTools network throttling presets/);
});
