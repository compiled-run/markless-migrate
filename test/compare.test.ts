import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { executedBytes } from '../src/check/capture.ts';
import { fontSignature } from '../src/check/fonts.ts';
import { hasContentHash, isFingerprinted, sameContentType } from '../src/check/assets.ts';
import { matchElements } from '../src/check/match.ts';
import type { ElementSnapshot } from '../src/check/types.ts';
import { compareScreenshots, visualNoise, visuallyDifferent } from '../src/check/visual.ts';

test('only a hashed name the built output refers to is fingerprinted; public files keep their URLs', () => {
	for (const url of ['/assets/main-DPvuoccY.css', '/assets/main-Bo_Cokpq.js', '/assets/main-D6x1mVz-.js', '/assets/index-a-B3cd9Z.js', '/static/app.3f9a1c2e.js', '/fonts/a1b2c3d4e5-s.p.woff2', '/chunk-BBLBSSIH.js', '/main-TNZ7TRFT.js', '/styles-V7LOWGDA.css']) assert.ok(hasContentHash(url), url);
	for (const url of ['/hero.png', '/logo-2024.png', '/inter-latin.woff2', '/HeroImage.png', '/images/background-v12.jpg', '/release-20261016.zip', '/deadbeef.png', '/photo-hero-v2.png', '/my-long-file-name.pdf']) assert.ok(!hasContentHash(url), url);
	const built = ['<link rel="stylesheet" href="/assets/main-DPvuoccY.css">', 'import("./chunk-Bo_Cokpq.js")'];
	assert.ok(isFingerprinted('/assets/main-DPvuoccY.css', built));
	assert.ok(isFingerprinted('/assets/chunk-Bo_Cokpq.js', built));
	assert.ok(!isFingerprinted('/assets/other-Zx81kQp2.js', built), 'hashed, but nothing built refers to it');
	assert.ok(!isFingerprinted('/logo-2024.png', ['<img src="/logo-2024.png">']), 'referenced, but its name has no hash');
	assert.ok(isFingerprinted('/_next/image?url=%2Fhero.png&w=640', []), "the framework's own output directory");
	assert.ok(!isFingerprinted('https://cdn.example/app-1a2b3c4d.js', ['app-1a2b3c4d.js']));
	// Webpack writes chunk ids and hashes apart: {17698:"64a0fc96bb"} becomes /assets/js/17698.64a0fc96bb.js.
	assert.ok(isFingerprinted('/assets/js/17698.64a0fc96bb.js', ['r.u=e=>"assets/js/"+e+"."+{17698:"64a0fc96bb"}[e]+".js"']));
	assert.ok(!isFingerprinted('/assets/js/17698.64a0fc96bb.js', ['nothing refers to it']));
});

test('Content-Type values that browsers treat alike are the same type', () => {
	assert.ok(sameContentType('application/javascript; charset=UTF-8', 'text/javascript'));
	assert.ok(sameContentType('text/css', 'text/css; charset=utf-8'));
	assert.ok(!sameContentType('text/html', 'application/javascript'));
});

test('executed bytes count only ranges that ran, with inner ranges overriding outer ones', () => {
	const source = 'x'.repeat(100);
	const functions = [
		{ ranges: [{ startOffset: 0, endOffset: 100, count: 1 }, { startOffset: 20, endOffset: 50, count: 0 }] },
		{ ranges: [{ startOffset: 30, endOffset: 40, count: 2 }] },
	];
	assert.equal(executedBytes(source, functions), 100 - 30 + 10);
});

const el = (over: Partial<ElementSnapshot>): ElementSnapshot => ({ id: 0, role: 'generic', name: '', tag: 'div', text: '', path: 'body/div', box: { x: 0, y: 0, width: 10, height: 10 }, style: {}, ...over });

test('elements pair by role and name before landmark path, and survive a renamed heading', () => {
	const old = [el({ role: 'heading', name: 'Welcome', tag: 'h1', text: 'Welcome', path: 'main>heading/h1' }), el({ role: 'link', name: 'About', tag: 'a', text: 'About', path: 'navigation>link/a' })];
	const swapped = [old[1]!, el({ role: 'heading', name: 'Hello', tag: 'h1', text: 'Hello', path: 'main>heading/h1' })];
	assert.deepEqual([...matchElements(old, swapped)].sort(), [
		[0, 1],
		[1, 0],
	]);
});

test('an extra wrapper div outside the landmarks does not shift how the divs inside them pair', () => {
	const old = [el({ path: 'banner/div', style: { display: 'flex' } }), el({ path: 'banner/div', style: { display: 'block' } }), el({ path: 'main/div' })];
	const wrapped = [el({ path: 'div' }), el({ path: 'div' }), ...old];
	assert.deepEqual([...matchElements(old, wrapped)].sort(), [
		[0, 2],
		[1, 3],
		[2, 4],
	]);
});

test('within a landmark path, a wrapper with no counterpart is skipped by box, and the rest still pair in order', () => {
	const box = (x: number, width: number, height: number) => ({ x, y: 0, width, height });
	const old = [el({ path: 'div', box: box(0, 650, 400) }), el({ path: 'div', box: box(250, 775, 300) }), el({ path: 'div', box: box(0, 1280, 900) })];
	const wrapped = [el({ path: 'div', box: box(0, 1280, 4000) }), el({ path: 'div', box: box(0, 650, 400) }), el({ path: 'div', box: box(250, 775, 300) }), el({ path: 'div', box: box(0, 1280, 901) })];
	assert.deepEqual([...matchElements(old, wrapped)].sort(), [
		[0, 1],
		[1, 2],
		[2, 3],
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

test('a font signature names web fonts by family and file hash, system fonts by name, most glyphs first', () => {
	const fonts = [
		{ familyName: 'Geeza Pro', isCustomFont: false, glyphCount: 3 },
		{ familyName: 'Inter Variable', isCustomFont: true, glyphCount: 12 },
		{ familyName: 'Arial', isCustomFont: false, glyphCount: 0 },
	];
	assert.equal(fontSignature(fonts, 'f7ab715caa2c0d1e'), 'web font Inter Variable (sha256 f7ab715caa2c) + Geeza Pro');
});
