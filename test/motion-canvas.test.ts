import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCanvas } from '../src/check/motion-canvas.ts';
import type { ElementSnapshot } from '../src/check/types.ts';

const element: ElementSnapshot = { id: 1, role: '', name: '', tag: 'canvas', text: '', path: 'main/canvas', box: { x: 0, y: 0, width: 400, height: 200 }, style: {} };
const [W, H] = [40, 20];

// A dark 6x6 square crossing a light canvas once every 2 s, drawn `row` pixels down, starting `delay` ms in.
function track(delay: number, row = 7): { element: ElementSnapshot; width: number; height: number; frames: { t: number; data: Uint8Array }[] } {
	const frames = [];
	for (let t = 0; t <= 6_000; t += 33) {
		const data = new Uint8Array(W * H * 4).fill(238);
		const x = t < delay ? -100 : Math.floor((((t - delay) % 2_000) / 2_000) * (W - 6));
		for (let y = row; y < row + 6; y++) for (let i = x; i < x + 6; i++) if (i >= 0 && i < W && y < H) data.fill(34, (y * W + i) * 4, (y * W + i) * 4 + 3);
		frames.push({ t, data });
	}
	return { element, width: W, height: H, frames };
}

test('the same drawing started later matches frame for frame once shifted, and reports how much later; a drawing in another place does not match at any shift', () => {
	const late = compareCanvas(track(0), track(400), track(0));
	assert.equal(late?.verdict, 'same');
	assert.ok(Math.abs(late!.gap.ms - 400) <= 40, JSON.stringify(late));
	assert.ok(late!.gap.spread <= 40, JSON.stringify(late));
	const low = compareCanvas(track(0), track(0, 12), track(0));
	assert.equal(low?.verdict, 'differs');
	assert.ok(low!.best.median > 0.03, JSON.stringify(low));
});
