import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import type { RecordedJourney } from '../src/check/journeys.ts';
import { checkProbes, compareRuns, type Reading } from '../src/check/probes.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A focus marker kept the way React Aria keeps it: any key press means keyboard (`keys` narrows which), a pointer press means pointer.
const modality = (keys: string) => `<button id="a">Save</button> <button>Next</button><script>let kb = false; const mark = () => { for (const e of document.querySelectorAll('[data-focus-visible]')) e.removeAttribute('data-focus-visible'); const a = document.activeElement; if (kb && a && a !== document.body) a.setAttribute('data-focus-visible', 'true'); }; addEventListener('keydown', (e) => { if (${keys}) kb = true; mark(); }, true); addEventListener('pointerdown', () => { kb = false; mark(); }, true); addEventListener('focusin', mark, true);</script>`;
// A dialog that takes focus and gives it back to its opener on Escape or a click outside; `drop` loses it on the click outside. `bare`: its trigger says nothing of what it opens, as React Aria's does not.
const dialog = (drop: boolean, bare = false) => `<button id="o"${bare ? '' : ' aria-haspopup="dialog" aria-expanded="false"'}>Settings</button><div id="d" role="dialog" aria-label="Settings" hidden><button id="x">Close</button></div><script>const close = (back) => { d.hidden = true; o.setAttribute('aria-expanded', 'false'); if (back) o.focus(); else document.activeElement?.blur(); }; o.onclick = () => { d.hidden = false; o.setAttribute('aria-expanded', 'true'); x.focus(); }; x.onclick = () => close(true); addEventListener('keydown', (e) => { if (e.key === 'Escape' && !d.hidden) close(true); }); addEventListener('click', (e) => { if (!d.hidden && !d.contains(e.target) && e.target !== o) close(${drop ? 'false' : 'true'}); });</script>`;
// A card shown while the pointer rests on its trigger; `never` never shows it.
const hoverCard = (never: boolean) => `<p><a id="h" href="#profile" data-state="closed">@ada</a></p><div id="c" role="tooltip" hidden>Ada Lovelace</div><script>let t; h.addEventListener('pointerenter', () => { t = setTimeout(() => { ${never ? '' : "c.hidden = false; h.dataset.state = 'open';"} }, 300); }); h.addEventListener('pointerleave', () => { clearTimeout(t); c.hidden = true; h.dataset.state = 'closed'; });</script>`;
// A slider the pointer drags; `stuck` answers keys only.
const slider = (stuck: boolean) => `<div id="s" role="slider" tabindex="0" aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" style="position:relative;width:400px;height:20px;background:#ddd;margin:40px"><span id="k" style="position:absolute;left:50%;width:16px;height:20px;background:#333"></span></div><script>const set = (v) => { v = Math.max(0, Math.min(100, Math.round(v))); s.setAttribute('aria-valuenow', String(v)); k.style.left = v + '%'; }; s.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') set(+s.getAttribute('aria-valuenow') + 1); }); ${stuck ? '' : "s.addEventListener('pointerdown', (e) => { s.setPointerCapture(e.pointerId); const move = (m) => set(((m.clientX - s.getBoundingClientRect().left) / 400) * 100); s.addEventListener('pointermove', move); s.addEventListener('pointerup', () => s.removeEventListener('pointermove', move), { once: true }); });"}</script>`;
// A button whose toasts stack, newest in front; `replace` shows only the last one.
const toasts = (replace: boolean) => `<button id="n">Notify</button><ol aria-live="polite" id="l"></ol><script>let i = 0; n.onclick = () => { i++; ${replace ? "l.textContent = '';" : ''} for (const t of l.children) t.setAttribute('data-front', 'false'); const li = document.createElement('li'); li.setAttribute('role', 'status'); li.setAttribute('data-sonner-toast', ''); li.setAttribute('data-front', 'true'); li.textContent = 'Saved ' + i; l.prepend(li); };</script>`;
// A radio group with one tab stop that moves with the arrows; `every` leaves every radio a tab stop.
const radios = (every: boolean) => `<button>Before</button><div role="radiogroup" aria-label="Size" id="g"><div role="radio" aria-checked="true" tabindex="0">Small</div><div role="radio" aria-checked="false" tabindex="${every ? 0 : -1}">Medium</div><div role="radio" aria-checked="false" tabindex="${every ? 0 : -1}">Large</div></div><button>After</button><script>const items = [...g.querySelectorAll('[role=radio]')]; g.addEventListener('keydown', (e) => { const i = items.indexOf(document.activeElement); if (i < 0) return; const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); const n = items[(i + d + items.length) % items.length]; for (const r of items) { r.setAttribute('aria-checked', String(r === n)); ${every ? '' : "r.tabIndex = r === n ? 0 : -1;"} } n.focus(); });</script>`;

// A menu whose items the pointer highlights; `sticky` keeps the highlight when the pointer leaves and when the menu closes.
const menu = (sticky: boolean) => `<button id="m" aria-haspopup="menu" aria-expanded="false">Actions</button><div id="l" role="menu" hidden><div role="menuitem" tabindex="-1">One</div><div role="menuitem" tabindex="-1">Two</div><div role="menuitem" tabindex="-1">Three</div></div><script>const its = [...l.children]; const clear = () => { for (const i of its) i.removeAttribute('data-highlighted'); }; const close = () => { l.hidden = true; m.setAttribute('aria-expanded', 'false'); ${sticky ? '' : 'clear();'} m.focus(); }; m.onclick = () => { if (!l.hidden) return close(); l.hidden = false; m.setAttribute('aria-expanded', 'true'); l.firstElementChild.focus(); }; for (const i of its) { i.addEventListener('pointerenter', () => { clear(); i.setAttribute('data-highlighted', ''); }); ${sticky ? '' : "i.addEventListener('pointerleave', () => i.removeAttribute('data-highlighted'));"} i.onclick = close; } addEventListener('keydown', (e) => { if (e.key === 'Escape' && !l.hidden) close(); }); addEventListener('click', (e) => { if (!l.hidden && !l.contains(e.target) && e.target !== m) close(); });</script>`;
// A right-click menu; `stuck` cannot be closed with Escape.
const contextMenu = (stuck: boolean) => `<div id="area" style="width:300px;height:120px;border:1px dashed">Right click here</div><div id="cm" role="menu" hidden style="position:fixed"><div role="menuitem">Back</div><div role="menuitem">Reload</div></div><script>area.oncontextmenu = (e) => { e.preventDefault(); cm.hidden = false; cm.style.left = e.clientX + 'px'; cm.style.top = e.clientY + 'px'; }; addEventListener('keydown', (e) => { if (e.key === 'Escape') { ${stuck ? '' : 'cm.hidden = true;'} } }); addEventListener('click', (e) => { if (!cm.contains(e.target)) cm.hidden = true; }); for (const i of cm.children) i.onclick = () => (cm.hidden = true);</script>`;
// A checkbox drawn as a button, as Radix draws one: Space and a click toggle it, Enter does not; `enter` toggles on Enter too.
const checkbox = (enter: boolean) => `<button id="c" role="checkbox" aria-checked="false" aria-label="Accept terms"></button><script>const flip = () => c.setAttribute('aria-checked', String(c.getAttribute('aria-checked') !== 'true')); c.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ${enter ? 'flip();' : ''} } }); c.onclick = flip;</script>`;
// A listbox inside a form whose hidden input follows the chosen option; `stale` leaves the input as it was.
const fruit = (stale: boolean) => `<form><button type="button" id="f" aria-haspopup="listbox" aria-expanded="false">Fruit</button><input type="hidden" name="fruit" id="v" value=""><div id="o" role="listbox" hidden><div role="option" tabindex="-1">Apple</div><div role="option" tabindex="-1">Banana</div></div></form><script>const close = () => { o.hidden = true; f.setAttribute('aria-expanded', 'false'); f.focus(); }; f.onclick = () => { if (!o.hidden) return close(); o.hidden = false; f.setAttribute('aria-expanded', 'true'); o.firstElementChild.focus(); }; for (const i of o.children) i.onclick = () => { f.textContent = i.textContent; ${stale ? '' : 'v.value = i.textContent;'} close(); }; addEventListener('keydown', (e) => { if (e.key === 'Escape' && !o.hidden) close(); }); addEventListener('click', (e) => { if (!o.hidden && !o.contains(e.target) && e.target !== f) close(); });</script>`;
// A switch whose label's click toggles it and focuses it; `native` focuses the hidden native input instead, as the port did.
const labelled = (native: boolean) => `<label id="lbl" for="n">Wi-Fi</label><input id="n" type="checkbox" aria-hidden="true" tabindex="-1" style="position:absolute;opacity:0;width:1px;height:1px"><button id="sw" role="switch" aria-checked="false" aria-labelledby="lbl"></button><script>const flip = () => sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); sw.onclick = flip; lbl.addEventListener('click', (e) => { e.preventDefault(); flip(); ${native ? 'n.focus();' : 'sw.focus();'} });</script>`;

const PAIRS: Record<string, { old: string; bad: string }> = {
	modality: { old: modality('true'), bad: modality("e.key === 'Tab'") },
	popup: { old: dialog(false), bad: dialog(true) },
	hover: { old: hoverCard(false), bad: hoverCard(true) },
	drag: { old: slider(false), bad: slider(true) },
	repeat: { old: toasts(false), bad: toasts(true) },
	'tab stops': { old: radios(false), bad: radios(true) },
	menu: { old: menu(false), bad: menu(true) },
	'context menu': { old: contextMenu(false), bad: contextMenu(true) },
	toggle: { old: checkbox(false), bad: checkbox(true) },
	discovered: { old: dialog(false, true), bad: dialog(true, true) },
	form: { old: fruit(false), bad: fruit(true) },
	label: { old: labelled(false), bad: labelled(true) },
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

const notified = (name: string): RecordedJourney[] => [{ name: `click button "${name}"`, steps: [{ action: 'click', target: { role: 'button', name, nth: 0 } }], expected: [{ url: '/', added: [], removed: [], requests: [], errors: [], announcements: ['list: Saved 1'], focus: 'body', navigated: false }] }];

const CLASS: Record<string, string> = { menu: 'popup', discovered: 'popup', form: 'popup', label: 'toggle' };
const EXPECT: Record<string, { check: RegExp; detail: RegExp }> = {
	modality: { check: /^modality probe of button "Save": focus ring after a click, then Escape and Tab \(step 2 of 4: press Escape\)$/, detail: /focus ring/ },
	popup: { check: /^popup probe of button "Settings": open by pointer.* \(step 5 of 12: click outside it and what it opened\)$/, detail: /focus: the control/ },
	menu: { check: /^popup probe of button "Actions": open by pointer.* \(step 4 of 12: move the pointer away\)$/, detail: /open: menu \(3 items, highlighted: One,/ },
	'context menu': { check: /^context menu probe of area "Right click here": open by right click.* \(step 4 of 13: press Escape\)$/, detail: /open: \(nothing else\)/ },
	toggle: { check: /^toggle probe of checkbox "Accept terms": Tab to it.* \(step 2 of 6: press Enter\)$/, detail: /aria-checked=false/ },
	form: { check: /^popup probe of button "Fruit": open by pointer.* \(step 7 of 12: click item 1 of what is open\)$/, detail: /form: fruit=Apple/ },
	label: { check: /^toggle probe of switch "Wi-Fi": a click on its label, then Space and Tab \(step 1 of 3: click its label\)$/, detail: /focus: the control/ },
	discovered: { check: /^popup probe of button "Settings": open by pointer.* \(step 5 of 12: click outside it and what it opened\)$/, detail: /focus: the control/ },
	hover: { check: /^hover probe of link "@ada": pointer resting on it.* \(step 1 of 4: point at it\)$/, detail: /open: tooltip "Ada Lovelace"/ },
	drag: { check: /^drag probe of slider "Volume": dragged by the pointer both ways \(step 1 of 3: drag it 40 px right\)$/, detail: /aria-valuenow=60/ },
	repeat: { check: /^repeat probe of button "Notify": used three times in a row.* \(step 2 of 5: click it\)$/, detail: /toasts: 2 shown/ },
	'tab stops': { check: /^tab stops probe of radiogroup "Size": Tab in, arrows each way.* \(step 1 of 8: Tab to it from the control before it\)$/, detail: /tab stops: 1: radio "Small"/ },
};

for (const cls of Object.keys(PAIRS)) {
	test(`the ${cls} probe is red on a port that differs, naming the control, the step and both sides, and green on the same page`, async () => {
		const route = `/${cls.replace(' ', '-')}`;
		const journeys = cls === 'repeat' ? notified('Notify') : undefined;
		const [result, same] = await Promise.all([checkProbes(browser, { old: defaultEnv(old), new: defaultEnv(bad) }, route, VIEWPORTS[0]!, journeys), checkProbes(browser, { old: defaultEnv(old), new: defaultEnv(old) }, route, VIEWPORTS[0]!, journeys)]);
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
