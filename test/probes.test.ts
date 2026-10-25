import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { checkProbes, compareRuns, type Reading } from '../src/check/probes.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A focus marker kept the way React Aria keeps it: any key press means keyboard (`keys` narrows which), a pointer press means pointer.
const modality = (keys: string) => `<button id="a">Save</button> <button>Next</button><script>let kb = false; const mark = () => { for (const e of document.querySelectorAll('[data-focus-visible]')) e.removeAttribute('data-focus-visible'); const a = document.activeElement; if (kb && a && a !== document.body) a.setAttribute('data-focus-visible', 'true'); }; addEventListener('keydown', (e) => { if (${keys}) kb = true; mark(); }, true); addEventListener('pointerdown', () => { kb = false; mark(); }, true); addEventListener('focusin', mark, true);</script>`;
// A dialog that takes focus and gives it back to its opener on Escape or a click outside; `drop` loses it on the click outside. `bare`: its trigger says nothing of what it opens, as React Aria's does not.
const dialog = (drop: boolean, bare = false) => `<button id="o"${bare ? '' : ' aria-haspopup="dialog" aria-expanded="false"'}>Settings</button><div id="d" role="dialog" aria-label="Settings" hidden><button id="x">Close</button></div><script>const close = (back) => { d.hidden = true; o.setAttribute('aria-expanded', 'false'); if (back) o.focus(); else document.activeElement?.blur(); }; o.onclick = () => { d.hidden = false; o.setAttribute('aria-expanded', 'true'); x.focus(); }; x.onclick = () => close(true); addEventListener('keydown', (e) => { if (e.key === 'Escape' && !d.hidden) close(true); }); addEventListener('click', (e) => { if (!d.hidden && !d.contains(e.target) && e.target !== o) close(${drop ? 'false' : 'true'}); });</script>`;
// A card shown while the pointer rests on its trigger; `never` never shows it.
const hoverCard = (never: boolean) => `<p><a id="h" href="#profile" data-state="closed">@ada</a></p><div id="c" role="tooltip" hidden>Ada Lovelace</div><script>let t; h.addEventListener('pointerenter', () => { t = setTimeout(() => { ${never ? '' : "c.hidden = false; h.dataset.state = 'open';"} }, 300); }); h.addEventListener('pointerleave', () => { clearTimeout(t); c.hidden = true; h.dataset.state = 'closed'; });</script>`;

// A menu whose items the pointer highlights; `sticky` keeps the highlight when the pointer leaves and when the menu closes.
const menu = (sticky: boolean) => `<button id="m" aria-haspopup="menu" aria-expanded="false">Actions</button><div id="l" role="menu" hidden><div role="menuitem" tabindex="-1">One</div><div role="menuitem" tabindex="-1">Two</div><div role="menuitem" tabindex="-1">Three</div></div><script>const its = [...l.children]; const clear = () => { for (const i of its) i.removeAttribute('data-highlighted'); }; const close = () => { l.hidden = true; m.setAttribute('aria-expanded', 'false'); ${sticky ? '' : 'clear();'} m.focus(); }; m.onclick = () => { if (!l.hidden) return close(); l.hidden = false; m.setAttribute('aria-expanded', 'true'); l.firstElementChild.focus(); }; for (const i of its) { i.addEventListener('pointerenter', () => { clear(); i.setAttribute('data-highlighted', ''); }); ${sticky ? '' : "i.addEventListener('pointerleave', () => i.removeAttribute('data-highlighted'));"} i.onclick = close; } addEventListener('keydown', (e) => { if (e.key === 'Escape' && !l.hidden) close(); }); addEventListener('click', (e) => { if (!l.hidden && !l.contains(e.target) && e.target !== m) close(); });</script>`;

const PAIRS: Record<string, { old: string; bad: string }> = {
	modality: { old: modality('true'), bad: modality("e.key === 'Tab'") },
	popup: { old: dialog(false), bad: dialog(true) },
	hover: { old: hoverCard(false), bad: hoverCard(true) },
	menu: { old: menu(false), bad: menu(true) },
	discovered: { old: dialog(false, true), bad: dialog(true, true) },
};

function serve(pages: Record<string, string>): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const page = pages[new URL(req.url ?? '/', 'http://x').pathname];
		if (page === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html lang="en"><title>Probe</title><main><h1>Probe</h1>${page}</main></html>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

let browser: Browser;
let old: string;
let bad: string;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
	const a = await serve(Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [`/${k.replace(' ', '-')}`, v.old])));
	const b = await serve(Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [`/${k.replace(' ', '-')}`, v.bad])));
	servers.push(a.server, b.server);
	old = a.origin;
	bad = b.origin;
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

const CLASS: Record<string, string> = { menu: 'popup', discovered: 'popup' };
const EXPECT: Record<string, { check: RegExp; detail: RegExp }> = {
	modality: { check: /^modality probe of button "Save": focus ring after a click, then Escape and Tab \(step 2 of 4: press Escape\)$/, detail: /focus ring/ },
	popup: { check: /^popup probe of button "Settings": open by pointer.* \(step 5 of 12: click outside it and what it opened\)$/, detail: /focus: the control/ },
	menu: { check: /^popup probe of button "Actions": open by pointer.* \(step 4 of 12: move the pointer away\)$/, detail: /open: menu \(3 items, highlighted: One,/ },
	discovered: { check: /^popup probe of button "Settings": open by pointer.* \(step 5 of 12: click outside it and what it opened\)$/, detail: /focus: the control/ },
	hover: { check: /^hover probe of link "@ada": pointer resting on it.* \(step 1 of 4: point at it\)$/, detail: /open: tooltip "Ada Lovelace"/ },
};

for (const cls of Object.keys(PAIRS)) {
	test(`the ${cls} probe is red on a port that differs, naming the control, the step and both sides, and green on the same page`, async () => {
		const route = `/${cls.replace(' ', '-')}`;
		const [result, same] = await Promise.all([checkProbes(browser, { old: defaultEnv(old), new: defaultEnv(bad) }, route, VIEWPORTS[0]!), checkProbes(browser, { old: defaultEnv(old), new: defaultEnv(old) }, route, VIEWPORTS[0]!)]);
		const mine = result.failures.filter((f) => f.check.startsWith(`${CLASS[cls] ?? cls} probe`));
		assert.ok(mine.some((f) => EXPECT[cls]!.check.test(f.check)), `${cls}: ${JSON.stringify(result.failures, null, 1)}`);
		const f = mine.find((x) => EXPECT[cls]!.check.test(x.check))!;
		assert.match(f.expected, EXPECT[cls]!.detail);
		assert.notEqual(f.expected.replace(/^old, after [^:]*: /, ''), f.actual.replace(/^new: /, ''));
		assert.deepEqual(same.failures, []);
		assert.ok(same.controls.some((c) => c.cls === (CLASS[cls] ?? cls) && c.state === 'probed'), JSON.stringify(same.controls));
	});
}

test('a difference both pages had at load, noise between two old runs, and sub-pixel offsets are no step difference', () => {
	const load: Reading = { focus: 'body', widget: ['span #1: data-rac=true'] };
	const old: Reading[] = [load, { focus: 'button "A"', widget: ['span #1: data-rac=true', 'div #1: data-state=open'], moved: ['div transform translateX(-120px)'] }];
	const next: Reading[] = [{ focus: 'body', widget: [] }, { focus: 'button "A"', widget: ['div #1: data-state=open'], moved: ['div transform translateX(-122px)'] }];
	assert.deepEqual(compareRuns(old, next), [[]]);
	const stamp = (t: string): Reading[] => [load, { focus: 'body', widget: [`time ${t}`] }];
	assert.deepEqual(compareRuns(stamp('1'), stamp('3'), stamp('2')), [[]]);
	assert.deepEqual(compareRuns(old, [next[0]!, { ...next[1]!, focus: 'body' }]), [[{ field: 'focus', old: 'button "A"', new: 'body' }]]);
});
