import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { executedBytes } from '../src/check/capture.ts';
import { hasContentHash, isFingerprinted } from '../src/check/assets.ts';
import { matchElements } from '../src/check/match.ts';
import type { ElementSnapshot } from '../src/check/types.ts';
import { compareScreenshots, visualNoise, visuallyDifferent } from '../src/check/visual.ts';

test('only a hashed name the built output refers to is fingerprinted; public files keep their URLs', () => {
	for (const url of ['/assets/main-DPvuoccY.css', '/assets/main-Bo_Cokpq.js', '/static/app.3f9a1c2e.js', '/fonts/a1b2c3d4e5-s.p.woff2']) assert.ok(hasContentHash(url), url);
	for (const url of ['/hero.png', '/logo-2024.png', '/inter-latin.woff2', '/HeroImage.png', '/images/background-v12.jpg', '/release-20261016.zip', '/deadbeef.png']) assert.ok(!hasContentHash(url), url);
	const built = ['<link rel="stylesheet" href="/assets/main-DPvuoccY.css">', 'import("./chunk-Bo_Cokpq.js")'];
	assert.ok(isFingerprinted('/assets/main-DPvuoccY.css', built));
	assert.ok(isFingerprinted('/assets/chunk-Bo_Cokpq.js', built));
	assert.ok(!isFingerprinted('/assets/other-Zx81kQp2.js', built), 'hashed, but nothing built refers to it');
	assert.ok(!isFingerprinted('/logo-2024.png', ['<img src="/logo-2024.png">']), 'referenced, but its name has no hash');
	assert.ok(isFingerprinted('/_next/image?url=%2Fhero.png&w=640', []), "the framework's own output directory");
	assert.ok(!isFingerprinted('https://cdn.example/app-1a2b3c4d.js', ['app-1a2b3c4d.js']));
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
	const noise = visualNoise(clockA, [clockB], []);
	assert.ok(!visuallyDifferent(compareScreenshots(clockA, png(100, 100), noise)), 'a change inside the noisy clock is ignored');
	const moved = compareScreenshots(clockA, png(100, 100, (x, y) => (x < 10 && y < 10) || (x > 50 && y > 50)), noise);
	assert.ok(visuallyDifferent(moved));
	assert.deepEqual(moved.region, { x: 51, y: 51, width: 49, height: 49 });
});

test('a different page height is always a visual difference', () => {
	const noise = visualNoise(png(50, 50), [png(50, 50)], []);
	const diff = compareScreenshots(png(50, 50), png(50, 60), noise);
	assert.deepEqual(diff.sizeMismatch, { expected: '50x50', actual: '50x60' });
	assert.ok(visuallyDifferent(diff));
});
