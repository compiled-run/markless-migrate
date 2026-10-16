import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { executedBytes } from '../src/check/capture.ts';
import { isBuildOutput } from '../src/check/compare.ts';
import { matchElements } from '../src/check/match.ts';
import type { ElementSnapshot } from '../src/check/types.ts';
import { compareScreenshots, visualNoise, visuallyDifferent } from '../src/check/visual.ts';

test('fingerprinted bundle names are build output, public file names are not', () => {
	for (const url of ['/assets/main-DPvuoccY.css', '/assets/main-Bo_Cokpq.js', '/_next/static/chunks/24peyy7yj1dyk.css', '/_next/image?url=%2Fhero.png&w=640']) assert.ok(isBuildOutput(url), url);
	for (const url of ['/hero.png', '/inter-latin.woff2', '/styles.css', '/images/background.jpg', 'https://cdn.example/app-1a2b3c4d.js']) assert.ok(!isBuildOutput(url), url);
});

test('executed bytes count only ranges that ran, with inner ranges overriding outer ones', () => {
	const source = 'x'.repeat(100);
	const functions = [
		{ ranges: [{ startOffset: 0, endOffset: 100, count: 1 }, { startOffset: 20, endOffset: 50, count: 0 }] },
		{ ranges: [{ startOffset: 30, endOffset: 40, count: 2 }] },
	];
	assert.equal(executedBytes(source, functions), 100 - 30 + 10);
});

const el = (over: Partial<ElementSnapshot>): ElementSnapshot => ({ role: 'generic', name: '', tag: 'div', text: '', path: 'body/div', box: { x: 0, y: 0, width: 10, height: 10 }, style: {}, ...over });

test('elements pair by role and name before landmark path, and survive a renamed heading', () => {
	const old = [el({ role: 'heading', name: 'Welcome', tag: 'h1', text: 'Welcome', path: 'main>heading/h1' }), el({ role: 'link', name: 'About', tag: 'a', text: 'About', path: 'navigation>link/a' })];
	const swapped = [old[1]!, el({ role: 'heading', name: 'Hello', tag: 'h1', text: 'Hello', path: 'main>heading/h1' })];
	assert.deepEqual([...matchElements(old, swapped)].sort(), [
		[0, 1],
		[1, 0],
	]);
});

function png(width: number, height: number, paint?: (x: number, y: number) => boolean): Buffer {
	const image = new PNG({ width, height });
	for (let i = 0; i < width * height; i++) {
		const on = paint?.(i % width, Math.floor(i / width)) ?? false;
		image.data.set(on ? [0, 0, 0, 255] : [255, 255, 255, 255], i * 4);
	}
	return PNG.sync.write(image);
}

test('pixels that differ between OLD loads are masked; new differences elsewhere are not', () => {
	const clockA = png(100, 100, (x, y) => x < 10 && y < 10);
	const clockB = png(100, 100, (x, y) => x < 10 && y < 10 && x % 2 === 0);
	const noise = visualNoise(clockA, clockB, []);
	assert.ok(!visuallyDifferent(compareScreenshots(clockA, png(100, 100), noise)), 'a change inside the noisy clock is ignored');
	const moved = compareScreenshots(clockA, png(100, 100, (x, y) => (x < 10 && y < 10) || (x > 50 && y > 50)), noise);
	assert.ok(visuallyDifferent(moved));
	assert.deepEqual(moved.region, { x: 51, y: 51, width: 49, height: 49 });
});

test('a different page height is always a visual difference', () => {
	const noise = visualNoise(png(50, 50), png(50, 50), []);
	const diff = compareScreenshots(png(50, 50), png(50, 60), noise);
	assert.deepEqual(diff.sizeMismatch, { expected: '50x50', actual: '50x60' });
	assert.ok(visuallyDifferent(diff));
});
