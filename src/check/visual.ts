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
	readonly regions: readonly Box[];
	readonly png?: Buffer;
}

const CELL = 16;
const MAX_REGIONS = 12;

// Differing pixels grouped into boxes: cells of 16px that touch (or are one cell apart) join one box.
export function diffRegions(width: number, height: number, differs: (x: number, y: number) => boolean): Box[] {
	const cols = Math.ceil(width / CELL);
	const rows = Math.ceil(height / CELL);
	const hot = new Uint8Array(cols * rows);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (differs(x, y)) hot[Math.floor(y / CELL) * cols + Math.floor(x / CELL)] = 1;
	const seen = new Uint8Array(cols * rows);
	const boxes: Box[] = [];
	for (let start = 0; start < hot.length; start++) {
		if (!hot[start] || seen[start]) continue;
		let [x0, y0, x1, y1] = [cols, rows, -1, -1];
		const stack = [start];
		seen[start] = 1;
		while (stack.length) {
			const cell = stack.pop()!;
			const cx = cell % cols;
			const cy = Math.floor(cell / cols);
			[x0, y0, x1, y1] = [Math.min(x0, cx), Math.min(y0, cy), Math.max(x1, cx), Math.max(y1, cy)];
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					const nx = cx + dx;
					const ny = cy + dy;
					const next = ny * cols + nx;
					if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && hot[next] && !seen[next]) {
						seen[next] = 1;
						stack.push(next);
					}
				}
			}
		}
		boxes.push({ x: x0 * CELL, y: y0 * CELL, width: Math.min(width, (x1 + 1) * CELL) - x0 * CELL, height: Math.min(height, (y1 + 1) * CELL) - y0 * CELL });
	}
	return boxes.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, MAX_REGIONS);
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

/** Byte-identical screenshots differ nowhere; the PNG header alone gives their size. */
export function identicalShots(a: Buffer, b: Buffer): VisualDiff | undefined {
	if (!a.equals(b) || a.length < 24) return undefined;
	return { differing: 0, area: a.readUInt32BE(16) * a.readUInt32BE(20), regions: [] };
}

export function visualNoise(oldA: Buffer, others: readonly Buffer[], noisyBoxes: readonly Box[]): VisualNoise {
	const a = PNG.sync.read(oldA);
	const mask = new Uint8Array(a.width * a.height);
	for (const box of noisyBoxes) markBox(mask, a.width, a.height, box, NOISE_PADDING);
	for (const other of others) {
		if (other.equals(oldA)) continue;
		const b = PNG.sync.read(other);
		if (a.width === b.width && a.height === b.height) {
			const diff = rawDiff(a, b);
			for (let i = 0; i < mask.length; i++) {
				if (diff[i * 4 + 3]! > 0) markBox(mask, a.width, a.height, { x: i % a.width, y: Math.floor(i / a.width), width: 1, height: 1 }, NOISE_PADDING);
			}
		} else {
			mask.fill(1, a.width * Math.min(a.height, b.height));
		}
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
	const marked = new Uint8Array(a.width * a.height);
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
		marked[i] = 1;
		out.data.set([255, 0, 80, 255], o);
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	}
	const region = differing ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : undefined;
	const regions = differing ? diffRegions(a.width, a.height, (x, y) => marked[y * a.width + x] === 1) : [];
	if (sizeMismatch) regions.push({ x: 0, y: height, width: Math.max(fullA.width, fullB.width), height: Math.max(fullA.height, fullB.height) - height });
	return { sizeMismatch, differing, area: a.width * a.height, region, regions: regions.filter((r) => r.height > 0), png: differing ? PNG.sync.write(out) : undefined };
}

export function visuallyDifferent(diff: VisualDiff): boolean {
	return Boolean(diff.sizeMismatch) || (diff.differing > 20 && diff.differing / diff.area > 0.0001);
}
