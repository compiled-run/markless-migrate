import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, firefox, webkit, type Browser, type BrowserType } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { checkProbes } from '../src/check/probes.ts';
import { armStateReader, compareStates, readState, sameMotion, placeDiffers, type StateReading } from '../src/check/state-probe.ts';
import { VIEWPORTS, type Failure } from '../src/check/types.ts';

const STYLE = `.pop { position: absolute; background: white; border: 1px solid #999; padding: 4px; min-width: 160px } [hidden] { display: none !important } [role=menuitem], [role=option] { display: block; padding: 4px 8px }`;
const place = `const place = (pop, trigger, dx = 0, dy = 4, width) => { const r = trigger.getBoundingClientRect(); pop.style.left = r.left + scrollX + dx + 'px'; pop.style.top = r.bottom + scrollY + dy + 'px'; if (width) pop.style.width = width + 'px'; };`;

/** A menu button as Radix's DropdownMenu builds it; `enter`/`exit` are the CSS animations it runs on open and close. */
const dropdown = (label: string, enter: string, exit: string) =>
	`<button id="t" aria-haspopup="menu" aria-expanded="false" aria-controls="m">${label}</button><div class="pop" role="menu" id="m" tabindex="-1" hidden data-state="closed"><div role="menuitem" tabindex="-1">Profile</div><div role="menuitem" tabindex="-1">Billing</div><div role="menuitem" tabindex="-1">Settings</div></div>
<style>${STYLE} @keyframes in { from { opacity: 0; transform: scale(0.95) } } @keyframes out { to { opacity: 0; transform: scale(0.95) } } #m[data-state=open] { animation: ${enter || 'none'} } #m[data-state=closed] { animation: ${exit || 'none'} }</style>
<script>${place} const t = document.getElementById('t'), m = document.getElementById('m');
const show = (open) => { t.setAttribute('aria-expanded', String(open)); if (open) { m.hidden = false; m.dataset.state = 'open'; place(m, t); m.focus(); } else { m.dataset.state = 'closed'; const done = () => { if (m.dataset.state === 'closed') m.hidden = true; }; if (m.getAnimations().length) m.addEventListener('animationend', done, { once: true }); else done(); t.focus(); } };
t.onclick = () => show(m.hidden || m.dataset.state === 'closed');
addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.dataset.state === 'open') show(false); });
document.addEventListener('pointerdown', (e) => { if (m.dataset.state === 'open' && !m.contains(e.target) && !t.contains(e.target)) show(false); });
for (const i of m.children) i.onclick = () => show(false);</script>`;

const ANIMATED_IN = 'in 150ms ease-out';
const ANIMATED_OUT = 'out 150ms ease-in';

/** Recharts tweens a series' path to its new shape when the shown key changes; `jump` sets it at once. One toggle flips Desktop and Mobile. */
const chart = (jump: boolean) =>
	`<button id="mobile" aria-pressed="false">Mobile</button><svg width="600" height="220"><path id="s" fill="none" stroke="#2563eb"/></svg>
<script>const A = [40, 120, 80, 160, 60, 180, 100], B = [150, 50, 170, 70, 140, 30, 120]; const s = document.getElementById('s'), m = document.getElementById('mobile');
const d = (v) => v.map((y, i) => (i ? 'L' : 'M') + (i * 95 + 15) + ' ' + (210 - Math.round(y))).join(' ');
let cur = A.slice(); s.setAttribute('d', d(cur));
const go = (to) => { ${jump ? "cur = to.slice(); s.setAttribute('d', d(cur));" : "const from = cur.slice(), t0 = performance.now(); const f = (now) => { const k = Math.min(1, (now - t0) / 400); cur = from.map((v, i) => v + (to[i] - v) * k); s.setAttribute('d', d(cur)); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);"} };
m.onclick = () => { const on = m.getAttribute('aria-pressed') !== 'true'; m.setAttribute('aria-pressed', String(on)); go(on ? B : A); };</script>`;

/** Base UI's Combobox: its list opens under the chips at their width and fades out on close; the bugs: narrower and moved, or no fade. */
const combobox = (bug: 'narrow' | 'close' | '') =>
	`<div id="chips" style="display: flex; width: 320px; border: 1px solid #999"><input id="cb" role="combobox" aria-expanded="false" aria-controls="l" aria-label="Framework" style="flex: 1; border: 0"></div><div class="pop" role="listbox" id="l" hidden>${['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix'].map((v) => `<div role="option" aria-selected="false">${v}</div>`).join('')}</div>
<style>${STYLE} #l { transition: opacity 150ms } #l[data-state=closed] { opacity: 0 } #l[data-state=open] { opacity: 1 } @starting-style { #l[data-state=open] { opacity: 0 } }</style>
<script>${place} const c = document.getElementById('cb'), l = document.getElementById('l'), chips = document.getElementById('chips');
const show = (open) => { c.setAttribute('aria-expanded', String(open)); if (open) { l.hidden = false; l.dataset.state = 'open'; place(l, chips, ${bug === 'narrow' ? 78 : 0}, 4, ${bug === 'narrow' ? 237 : 320}); } else { l.dataset.state = 'closed'; ${bug === 'close' ? 'l.style.transition = "none"; l.hidden = true;' : "setTimeout(() => { if (l.dataset.state === 'closed') l.hidden = true; }, 150);"} } };
c.addEventListener('click', () => show(true)); c.addEventListener('keydown', (e) => { if (e.key === 'Escape') show(false); if (e.key === 'ArrowDown') { e.preventDefault(); show(true); } });
for (const o of l.children) o.addEventListener('click', () => { o.setAttribute('aria-selected', 'true'); show(false); c.focus(); });
document.addEventListener('pointerdown', (e) => { if (l.dataset.state === 'open' && !l.contains(e.target) && !chips.contains(e.target)) show(false); });</script>`;

/** A tooltip above its trigger; `covers` puts it on top of the trigger, as the port did. */
const tooltip = (covers: boolean) =>
	`<div style="padding: 60px; position: relative"><button id="tip" aria-describedby="tc">Hover</button><div role="tooltip" id="tc" hidden style="position: fixed; padding: 4px 8px; background: #111; color: white">Add to library</div></div>
<script>const t = document.getElementById('tip'), c = document.getElementById('tc');
const show = () => { c.hidden = false; const r = t.getBoundingClientRect(); c.style.left = (${covers ? 'r.left - 8' : 'r.left + r.width / 2 - c.offsetWidth / 2'}) + 'px'; c.style.top = (${covers ? 'r.top' : 'r.top - c.offsetHeight - 6'}) + 'px'; };
t.addEventListener('pointerenter', () => setTimeout(show, 200)); t.addEventListener('pointerleave', () => { c.hidden = true; });
t.addEventListener('focus', show); t.addEventListener('blur', () => { c.hidden = true; });</script>`;

/** The owner's examples: each the original's page and the port's with the bug, and the finding that must name it. */
const CASES: Record<string, { old: string; bad: string; caught: RegExp }> = {
	avatar: { old: dropdown('shadcn', '', ''), bad: dropdown('shadcn', ANIMATED_IN, ''), caught: /^motion: motion opening menu after click it on button "shadcn" \(state probe: .*\) \| old: no animation \| new: opacity,transform 150 ms/ },
	'three-dots': { old: dropdown('Toggle menu', ANIMATED_IN, ANIMATED_OUT), bad: dropdown('Toggle menu', 'in 300ms ease-out', 'out 150ms linear'), caught: /^motion: motion (opening|closing) menu after .* on button "Toggle menu"/ },
	chart: { old: chart(false), bad: chart(true), caught: /^motion: script motion of path outside the widget \(path\) after .* on button "Mobile".*\| old: moves frame by frame: \d+ frames .*\| new: (jumps|set on)/ },
	'combobox-narrow': { old: combobox(''), bad: combobox('narrow'), caught: /^behaviour: pop-up place of listbox after .* on combobox "Framework" .*\| old: below its trigger, start-aligned.*\(1\.0\d?x the trigger.*\| new: .*\(0\.7\d?x the trigger.*differs in .*width/ },
	'combobox-close': { old: combobox(''), bad: combobox('close'), caught: /^motion: motion closing listbox after .* on combobox "Framework"/ },
	tooltip: { old: tooltip(false), bad: tooltip(true), caught: /^behaviour: pop-up place of tooltip after .* on button "Hover" .*\| old: above its trigger.*\| new: over its trigger.*hiding its trigger/ },
};

function serve(pages: Record<string, string>): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const page = pages[new URL(req.url ?? '/', 'http://x').pathname];
		if (page === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html lang="en"><title>State</title><body><main><h1>State</h1>${page}</main></body></html>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

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

for (const [name, engine] of [['Chromium', chromium], ['Firefox', firefox], ['WebKit', webkit]] as const) {
	test(`in ${name}, the reader sees an opening animation, a closing one, a popup's place and a path tween`, async () => {
		const read = async (origin: string, route: string, acts: ((p: import('playwright').Page) => Promise<unknown>)[]) => {
			const b = await engine.launch();
			try {
				const page = await b.newPage();
				await page.goto(new URL(route, origin).href);
				await armStateReader(page);
				const out = [await readState(page)];
				for (const act of acts) {
					await act(page);
					await page.waitForTimeout(500);
					out.push(await readState(page));
				}
				return out;
			} finally {
				await b.close();
			}
		};
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
		const tween = await read(old, '/chart', [(p) => p.click('#mobile')]);
		const jump = await read(bad, '/chart', [(p) => p.click('#mobile')]);
		assert.ok((tween[1]!.script.find((s) => s.attribute === 'd')?.frames ?? 0) >= 6, JSON.stringify(tween[1]!.script));
		assert.equal(jump[1]!.script.length, 0);
		assert.deepEqual(compareStates(tween, jump)[0]!.map((d) => d.field), ['script motion of path outside the widget (path)']);
	});
}

test('a step compares what it changed: tree lines it added, a popup moved past tolerance, an animation only one side ran; what two old runs disagree on is noise', () => {
	const at = (over: Partial<StateReading> = {}): StateReading => ({ ax: ['- main:', '  - button "Open"'], popups: [], motion: [], script: [], ms: 1, ...over });
	const place = { role: 'menu', name: '', side: 'below', gap: 4, across: 0, align: 'start', width: 200, height: 100, triggerWidth: 200, triggerHeight: 32, covers: 0, hides: false } as const;
	const fade = { kind: 'animation', subject: 'menu', properties: ['opacity'], duration: 150, delay: 0, easing: 'ease-out', iterations: 1, direction: 'normal', keyframes: ['0 opacity=0', '1 opacity=1'] } as const;
	const open = at({ ax: ['- main:', '  - button "Open"', '  - menu'], popups: [place], motion: [fade] });
	assert.deepEqual(compareStates([at(), open], [at({ ax: ['- main:', '  - button "Open" [expanded]'] }), { ...open, ax: ['- main:', '  - button "Open" [expanded]', '  - menu'], popups: [{ ...place, gap: 5, width: 201 }], motion: [{ ...fade, duration: 160, easing: 'cubic-bezier(0, 0, 0.58, 1)' }] }]), [[]]);
	const diffs = compareStates([at(), open], [at(), { ...open, ax: [...at().ax], popups: [{ ...place, across: 40, align: 'none', width: 150 }], motion: [] }])[0]!;
	assert.deepEqual(diffs.map((d) => d.field), ['accessibility tree', 'pop-up place of menu', 'motion opening menu']);
	assert.match(diffs[1]!.new, /differs in alignment, offset, width/);
	assert.equal(diffs[2]!.new, 'no animation');
	const jitter = { ...open, motion: [{ ...fade, duration: 400 }] };
	assert.deepEqual(compareStates([at(), open], [at(), jitter], [at(), jitter])[0]!.map((d) => d.field), []);
});
