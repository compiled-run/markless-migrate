import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium, firefox, webkit, type Page } from 'playwright';
import { armStateReader, compareStates, placeDiffers, readState, sameMotion, type StateReading } from '../../src/check/state-probe.ts';
import { CASES, serve } from '../state-pages.ts';

let old: string;
let bad: string;
const servers: Server[] = [];
before(async () => {
	const a = await serve(Object.fromEntries(Object.entries(CASES).map(([k, v]) => [`/${k}`, v.old])));
	const b = await serve(Object.fromEntries(Object.entries(CASES).map(([k, v]) => [`/${k}`, v.bad])));
	servers.push(a.server, b.server);
	old = a.origin;
	bad = b.origin;
});
after(() => {
	for (const s of servers) s.close();
});

for (const [name, engine] of [['Chromium', chromium], ['Firefox', firefox], ['WebKit', webkit]] as const) {
	test(`in ${name}, the state reader sees an opening animation, a closing one, a popup's place and a path tween`, async () => {
		const browser = await engine.launch();
		const read = async (origin: string, route: string, acts: ((p: Page) => Promise<unknown>)[]): Promise<StateReading[]> => {
			const page = await browser.newPage();
			try {
				await page.goto(new URL(route, origin).href);
				await armStateReader(page);
				const out = [await readState(page)];
				for (const act of acts) {
					await act(page);
					// Long enough for a 150 ms animation and a 400 ms tween to have started and ended: the reader needs neither to play out.
					await page.waitForTimeout(500);
					out.push(await readState(page, out.at(-1)));
				}
				return out;
			} finally {
				await page.close();
			}
		};
		try {
			const menu = await read(old, '/three-dots', [(p) => p.click('#t'), (p) => p.keyboard.press('Escape')]);
			assert.deepEqual(menu[1]!.motion.map((m) => `${m.subject} ${m.properties.join(',')} ${m.duration}`), ['menu opacity,transform 150']);
			assert.deepEqual(menu[2]!.motion.map((m) => `${m.subject} ${m.duration} ${m.easing}`), ['menu 150 ease-in']);
			assert.equal(menu[1]!.popups[0]?.side, 'below');
			const plain = await read(old, '/avatar', [(p) => p.click('#t')]);
			assert.deepEqual(plain[1]!.motion, []);
			assert.ok(!sameMotion(plain[1]!.motion, menu[1]!.motion));
			const list = await read(old, '/combobox-narrow', [(p) => p.click('#cb')]);
			const narrow = await read(bad, '/combobox-narrow', [(p) => p.click('#cb')]);
			assert.deepEqual(placeDiffers(list[1]!.popups[0]!, narrow[1]!.popups[0]!).sort(), ['alignment', 'offset', 'width']);
			const closing = await read(old, '/combobox-close', [(p) => p.click('#cb'), (p) => p.keyboard.press('Escape')]);
			assert.deepEqual(closing[2]!.motion.map((m) => `${m.subject} ${m.properties.join(',')} ${m.duration}`), ['listbox opacity 150']);
			const tip = await read(old, '/tooltip', [(p) => p.focus('#tip')]);
			const covered = await read(bad, '/tooltip', [(p) => p.focus('#tip')]);
			assert.equal(tip[1]!.popups[0]?.side, 'above');
			assert.equal(covered[1]!.popups[0]?.hides, true);
			const tween = await read(old, '/chart', [(p) => p.click('#mobile')]);
			const jump = await read(bad, '/chart', [(p) => p.click('#mobile')]);
			assert.ok((tween[1]!.script.find((s) => s.attribute === 'd')?.frames ?? 0) >= 6, JSON.stringify(tween[1]!.script));
			assert.ok((jump[1]!.script.find((s) => s.attribute === 'd')?.frames ?? 0) <= 2, JSON.stringify(jump[1]!.script));
			assert.deepEqual(compareStates(tween, jump)[0]!.map((d) => d.field), ['script motion of path outside the widget (path)']);
		} finally {
			await browser.close();
		}
	});
}
