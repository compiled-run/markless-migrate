import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Box } from './types.ts';

export interface VisualNoise {
	readonly width: number;
	readonly height: number;
	readonly mask: Uint8Array;
}

export interface VisualDiff {
	readonly sizeMismatch?: { expected: string; actual: string };
	readonly differing: number;
	readonly area: number;
	readonly region?: Box;
	readonly png?: Buffer;
}

const PIXEL_THRESHOLD = 0.1;
const NOISE_PADDING = 6;

function rawDiff(a: PNG, b: PNG): Uint8Array {
	const out = new Uint8Array(a.width * a.height * 4);
	pixelmatch(a.data, b.data, out, a.width, a.height, { threshold: PIXEL_THRESHOLD, includeAA: false, diffMask: true, alpha: 0 });
	return out;
}

function markBox(mask: Uint8Array, width: number, height: number, box: Box, pad: number): void {
	const x0 = Math.max(0, box.x - pad);
	const y0 = Math.max(0, box.y - pad);
	const x1 = Math.min(width, box.x + box.width + pad);
	const y1 = Math.min(height, box.y + box.height + pad);
	for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
}

export function visualNoise(oldA: Buffer, oldB: Buffer, noisyBoxes: readonly Box[]): VisualNoise {
	const a = PNG.sync.read(oldA);
	const b = PNG.sync.read(oldB);
	const mask = new Uint8Array(a.width * a.height);
	for (const box of noisyBoxes) markBox(mask, a.width, a.height, box, NOISE_PADDING);
	if (a.width === b.width && a.height === b.height) {
		const diff = rawDiff(a, b);
		for (let i = 0; i < mask.length; i++) {
			if (diff[i * 4 + 3]! > 0) markBox(mask, a.width, a.height, { x: i % a.width, y: Math.floor(i / a.width), width: 1, height: 1 }, NOISE_PADDING);
		}
	} else {
		mask.fill(1, a.width * Math.min(a.height, b.height));
	}
	return { width: a.width, height: a.height, mask };
}

function crop(png: PNG, width: number, height: number): PNG {
	if (png.width === width && png.height === height) return png;
	const out = new PNG({ width, height });
	PNG.bitblt(png, out, 0, 0, width, height, 0, 0);
	return out;
}

export function compareScreenshots(expected: Buffer, actual: Buffer, noise: VisualNoise): VisualDiff {
	const fullA = PNG.sync.read(expected);
	const fullB = PNG.sync.read(actual);
	const sizeMismatch = fullA.width !== fullB.width || fullA.height !== fullB.height ? { expected: `${fullA.width}x${fullA.height}`, actual: `${fullB.width}x${fullB.height}` } : undefined;
	const width = Math.min(fullA.width, fullB.width);
	const height = Math.min(fullA.height, fullB.height);
	const a = crop(fullA, width, height);
	const b = crop(fullB, width, height);
	const diff = rawDiff(a, b);
	const out = new PNG({ width: a.width, height: a.height });
	b.data.copy(out.data);
	let differing = 0;
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -1;
	let y1 = -1;
	for (let i = 0; i < a.width * a.height; i++) {
		const o = i * 4;
		const x = i % a.width;
		const y = Math.floor(i / a.width);
		if (x < noise.width && noise.mask[y * noise.width + x]) {
			out.data[o + 3] = 60;
			continue;
		}
		if (diff[o + 3]! === 0) {
			out.data[o + 3] = 90;
			continue;
		}
		differing++;
		out.data.set([255, 0, 80, 255], o);
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	}
	const region = differing ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : undefined;
	return { sizeMismatch, differing, area: a.width * a.height, region, png: differing ? PNG.sync.write(out) : undefined };
}

export function visuallyDifferent(diff: VisualDiff): boolean {
	return Boolean(diff.sizeMismatch) || (diff.differing > 20 && diff.differing / diff.area > 0.0001);
}
