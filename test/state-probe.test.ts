import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { checkProbes } from '../src/check/probes.ts';
import { compareStates, type StateReading } from '../src/check/state-probe.ts';
import { VIEWPORTS, type Failure } from '../src/check/types.ts';
import { CASES, serve } from './state-pages.ts';

let browser: Browser;
let old: string;
let bad: string;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
	const a = await serve(Object.fromEntries(Object.entries(CASES).map(([k, v]) => [`/${k}`, v.old])));
	const b = await serve(Object.fromEntries(Object.entries(CASES).map(([k, v]) => [`/${k}`, v.bad])));
	servers.push(a.server, b.server);
	old = a.origin;
	bad = b.origin;
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

const text = (f: Failure) => `${f.dimension}: ${f.check} | ${f.expected} | ${f.actual}`;
const states = (fs: readonly Failure[]) => fs.filter((f) => f.check.includes('(state probe:'));

for (const [id, c] of Object.entries(CASES)) {
	test(`the state probe names the ${id} bug, and is green on the original against itself`, async () => {
		const route = `/${id}`;
		const [result, same] = await Promise.all([checkProbes(browser, { old: defaultEnv(old), new: defaultEnv(bad) }, route, VIEWPORTS[0]!), checkProbes(browser, { old: defaultEnv(old), new: defaultEnv(old) }, route, VIEWPORTS[0]!)]);
		assert.ok(states(result.failures).some((f) => c.caught.test(text(f))), `${id}:\n${result.failures.map(text).join('\n')}`);
		assert.deepEqual(states(same.failures).map(text), []);
		assert.ok(typeof result.stateMs === 'number' && result.stateMs > 0, 'stateMs reports the time the state reads took');
	});
}

test('a step compares what it changed: the tree of an open menu, a popup moved past tolerance, an animation only one side ran; what two old runs disagree on is noise', () => {
	const at = (over: Partial<StateReading> = {}): StateReading => ({ ax: [], open: [], popups: [], motion: [], script: [], ms: 1, ...over });
	const place = { role: 'menu', name: '', side: 'below', gap: 4, across: 0, align: 'start', width: 200, height: 100, triggerWidth: 200, triggerHeight: 32, covers: 0, hides: false, anchored: true } as const;
	const fade = { kind: 'animation', subject: 'menu', properties: ['opacity'], duration: 150, delay: 0, easing: 'ease-out', iterations: 1, direction: 'normal', keyframes: ['0 max-height=300px, opacity=0', '1 max-height=300px, opacity=1'] } as const;
	const open = at({ ax: ['menu: - menu', 'menu:   - menuitem "Profile"', 'menu:   - menuitem "Billing"'], open: ['menu'], popups: [place], motion: [fade] });
	// Within tolerance: a pixel of gap and width, 10 ms of duration, the same easing written another way, a max-height the layout set.
	const near = { ...open, popups: [{ ...place, gap: 5, width: 201 }], motion: [{ ...fade, duration: 160, easing: 'cubic-bezier(0, 0, 0.58, 1)', keyframes: ['0 max-height=520px, opacity=0', '1 max-height=520px, opacity=1'] }] };
	assert.deepEqual(compareStates([at(), open], [at(), near]), [[]]);
	const diffs = compareStates([at(), open], [at(), { ...open, ax: open.ax.slice(0, 2), popups: [{ ...place, across: 40, align: 'none', width: 150 }], motion: [] }])[0]!;
	assert.deepEqual(diffs.map((d) => d.field), ['accessibility tree', 'pop-up place of menu', 'motion opening menu']);
	assert.match(diffs[0]!.old, /menuitem "Billing"/);
	assert.match(diffs[1]!.new, /differs in alignment, offset, width/);
	assert.equal(diffs[2]!.new, 'no animation');
	const jitter = { ...open, motion: [{ ...fade, duration: 400 }] };
	assert.deepEqual(compareStates([at(), open], [at(), jitter], [at(), jitter])[0]!.map((d) => d.field), []);
	// A max-height transition follows the room left below the menu; a colour transition is hover feedback.
	const room = { ...fade, kind: 'transition', properties: ['max-height'], keyframes: [] } as const;
	const hover = { ...fade, kind: 'transition', properties: ['background-color'], keyframes: [] } as const;
	assert.deepEqual(compareStates([at(), open], [at(), { ...open, motion: [fade, room, hover] }])[0]!.map((d) => d.field), []);
	// A menu open on one side only is the probes' difference of state: its tree and motion are not compared.
	assert.deepEqual(compareStates([at(), open], [at(), at()])[0]!.map((d) => d.field), []);
});
