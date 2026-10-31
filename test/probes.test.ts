import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import type { RecordedJourney } from '../src/check/journeys.ts';
import { checkProbes, compareRuns, type Reading, type SharedProbe } from '../src/check/probes.ts';
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
// A right-click menu whose "More Tools" item opens a submenu on pointing and on ArrowRight; `dead` never opens it.
const submenus = (dead: boolean) => `<div id="area" style="width:300px;height:120px;border:1px dashed">Right click here</div><div id="cm" role="menu" hidden style="position:fixed;background:#fff"><div role="menuitem" tabindex="-1">Back</div><div role="menuitem" tabindex="-1" id="more" aria-haspopup="menu" aria-expanded="false">More Tools</div></div><div id="sub" role="menu" hidden style="position:fixed;background:#fff"><div role="menuitem" tabindex="-1">Save Page</div><div role="menuitem" tabindex="-1">Developer Tools</div></div><script>const open = (focus) => { ${dead ? '' : "const r = more.getBoundingClientRect(); sub.hidden = false; sub.style.left = r.right + 'px'; sub.style.top = r.top + 'px'; more.setAttribute('aria-expanded', 'true'); if (focus) sub.firstElementChild.focus();"} }; const shut = () => { sub.hidden = true; more.setAttribute('aria-expanded', 'false'); }; area.oncontextmenu = (e) => { e.preventDefault(); cm.hidden = false; cm.style.left = e.clientX + 'px'; cm.style.top = e.clientY + 'px'; cm.firstElementChild.focus(); }; more.addEventListener('pointerenter', () => open(false)); cm.firstElementChild.addEventListener('pointerenter', shut); addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' && document.activeElement === more) open(true); if (e.key === 'ArrowLeft' && sub.contains(document.activeElement)) { shut(); more.focus(); } if (e.key === 'Escape') { cm.hidden = true; shut(); } }); addEventListener('click', (e) => { if (!cm.contains(e.target) && !sub.contains(e.target)) { cm.hidden = true; shut(); } });</script>`;
// A popup list that fades out over 200 ms when closed; `jumps` scrolls its list back to the top as it fades on a click outside.
const pages = (jumps: boolean) => `<button id="p" aria-haspopup="dialog" aria-expanded="false">Pages</button><div id="d" role="dialog" aria-label="Pages" hidden style="position:fixed;left:200px;top:80px;width:300px;background:#fff;border:1px solid"><div role="listbox" aria-label="Results" id="lb" style="height:120px;overflow:auto">${Array.from({ length: 30 }, (_, i) => `<div role="option" aria-selected="false">Page ${i + 1}</div>`).join('')}</div></div><script>const shut = (outside) => { d.style.transition = 'opacity 200ms'; d.style.opacity = '0'; ${jumps ? 'if (outside) lb.scrollTop = 0;' : ''} setTimeout(() => { d.hidden = true; d.style.opacity = ''; p.setAttribute('aria-expanded', 'false'); p.focus(); }, 200); }; p.onclick = () => { if (!d.hidden) return shut(false); d.hidden = false; lb.scrollTop = 0; p.setAttribute('aria-expanded', 'true'); lb.focus(); }; addEventListener('keydown', (e) => { if (e.key === 'Escape' && !d.hidden) shut(false); }); addEventListener('pointerdown', (e) => { if (!d.hidden && !d.contains(e.target) && e.target !== p) shut(true); });</script>`;
// A checkbox drawn as a button, as Radix draws one: Space and a click toggle it, Enter does not; `enter` toggles on Enter too.
const checkbox = (enter: boolean) => `<button id="c" role="checkbox" aria-checked="false" aria-label="Accept terms"></button><script>const flip = () => c.setAttribute('aria-checked', String(c.getAttribute('aria-checked') !== 'true')); c.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ${enter ? 'flip();' : ''} } }); c.onclick = flip;</script>`;
// A listbox inside a form whose hidden input follows the chosen option; `stale` leaves the input as it was.
const fruit = (stale: boolean) => `<form><button type="button" id="f" aria-haspopup="listbox" aria-expanded="false">Fruit</button><input type="hidden" name="fruit" id="v" value=""><div id="o" role="listbox" hidden><div role="option" tabindex="-1">Apple</div><div role="option" tabindex="-1">Banana</div></div></form><script>const close = () => { o.hidden = true; f.setAttribute('aria-expanded', 'false'); f.focus(); }; f.onclick = () => { if (!o.hidden) return close(); o.hidden = false; f.setAttribute('aria-expanded', 'true'); o.firstElementChild.focus(); }; for (const i of o.children) i.onclick = () => { f.textContent = i.textContent; ${stale ? '' : 'v.value = i.textContent;'} close(); }; addEventListener('keydown', (e) => { if (e.key === 'Escape' && !o.hidden) close(); }); addEventListener('click', (e) => { if (!o.hidden && !o.contains(e.target) && e.target !== f) close(); });</script>`;
// A switch whose label's click toggles it and focuses it; `native` focuses the hidden native input instead, as the port did.
const labelled = (native: boolean) => `<label id="lbl" for="n">Wi-Fi</label><input id="n" type="checkbox" aria-hidden="true" tabindex="-1" style="position:absolute;opacity:0;width:1px;height:1px"><button id="sw" role="switch" aria-checked="false" aria-labelledby="lbl"></button><script>const flip = () => sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); sw.onclick = flip; lbl.addEventListener('click', (e) => { e.preventDefault(); flip(); ${native ? 'n.focus();' : 'sw.focus();'} });</script>`;

// The same dialog trigger in a left-to-right and a right-to-left section; `drop` loses focus on a click outside only in the right-to-left one.
const directions = (drop: boolean) => ['ltr', 'rtl'].map((dir) => `<section dir="${dir}"><button id="${dir}-o" aria-haspopup="dialog" aria-expanded="false">${dir === 'rtl' ? 'الإعدادات' : 'Settings'}</button><div id="${dir}-d" role="dialog" aria-label="${dir}" hidden><button>Close</button></div></section><script>(() => { const o = document.getElementById('${dir}-o'); const d = document.getElementById('${dir}-d'); const close = (back) => { d.hidden = true; o.setAttribute('aria-expanded', 'false'); if (back) o.focus(); else document.activeElement?.blur(); }; o.onclick = () => { d.hidden = false; o.setAttribute('aria-expanded', 'true'); d.querySelector('button').focus(); }; d.querySelector('button').onclick = () => close(true); addEventListener('keydown', (e) => { if (e.key === 'Escape' && !d.hidden) close(true); }); addEventListener('click', (e) => { if (!d.hidden && !d.contains(e.target) && e.target !== o) close(${drop ? `'${dir}' !== 'rtl'` : 'true'}); }); })();</script>`).join('');

const PAIRS: Record<string, { old: string; bad: string }> = {
	modality: { old: modality('true'), bad: modality("e.key === 'Tab'") },
	popup: { old: dialog(false), bad: dialog(true) },
	hover: { old: hoverCard(false), bad: hoverCard(true) },
	drag: { old: slider(false), bad: slider(true) },
	repeat: { old: toasts(false), bad: toasts(true) },
	'tab stops': { old: radios(false), bad: radios(true) },
	menu: { old: menu(false), bad: menu(true) },
	'context menu': { old: contextMenu(false), bad: contextMenu(true) },
	submenu: { old: submenus(false), bad: submenus(true) },
	scroller: { old: pages(false), bad: pages(true) },
	toggle: { old: checkbox(false), bad: checkbox(true) },
	discovered: { old: dialog(false, true), bad: dialog(true, true) },
	rtl: { old: directions(false), bad: directions(true) },
	form: { old: fruit(false), bad: fruit(true) },
	label: { old: labelled(false), bad: labelled(true) },
};

function serve(pages: Record<string, string>): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const page = pages[new URL(req.url ?? '/', 'http://x').pathname];
		if (page === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html lang="en"><title>Probe</title><main><h1>Probe</h1>${page}</main></html>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

// The same dialog on routes that differ around it; on /shared-c the new page's trigger carries a class the others do not, so its markup differs there.
const SHARED: Record<string, { old: string; bad: string }> = {
	'/shared-a': { old: `<p>Opening hours</p>${dialog(false)}`, bad: `<p>Opening hours</p>${dialog(true)}` },
	'/shared-b': { old: `<p>Our roasts, by origin</p>${dialog(false)}`, bad: `<p>Our roasts, by origin</p>${dialog(true)}` },
	'/shared-c': { old: `<p>Contact</p>${dialog(false)}`, bad: `<p>Contact</p>${dialog(true).replace('<button id="o"', '<button class="wide" id="o"')}` },
};

let browser: Browser;
let old: string;
let bad: string;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
	const a = await serve(Object.fromEntries([...Object.entries(PAIRS).map(([k, v]) => [`/${k.replace(' ', '-')}`, v.old]), ...Object.entries(SHARED).map(([k, v]) => [k, v.old])]));
	const b = await serve(Object.fromEntries([...Object.entries(PAIRS).map(([k, v]) => [`/${k.replace(' ', '-')}`, v.bad]), ...Object.entries(SHARED).map(([k, v]) => [k, v.bad])]));
	servers.push(a.server, b.server);
	old = a.origin;
	bad = b.origin;
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

const notified = (name: string): RecordedJourney[] => [{ name: `click button "${name}"`, steps: [{ action: 'click', target: { role: 'button', name, nth: 0 } }], expected: [{ url: '/', added: [], removed: [], requests: [], errors: [], announcements: ['list: Saved 1'], focus: 'body', navigated: false }] }];

const CLASS: Record<string, string> = { menu: 'popup', discovered: 'popup', form: 'popup', label: 'toggle', rtl: 'popup', submenu: 'context menu', scroller: 'popup' };
const EXPECT: Record<string, { check: RegExp; detail: RegExp }> = {
	modality: { check: /^modality probe of button "Save": focus ring after a click, then Escape and Tab \(step 2 of 4: press Escape\)$/, detail: /focus ring/ },
	popup: { check: /^popup probe of button "Settings": open by pointer.* \(step 5 of 12: click outside it and what it opened\)$/, detail: /focus: the control/ },
	menu: { check: /^popup probe of button "Actions": open by pointer.* \(step 4 of 12: move the pointer away\)$/, detail: /open: menu \(3 items, highlighted: One,/ },
	'context menu': { check: /^context menu probe of area "Right click here": open by right click.* \(step 4 of 13: press Escape\)$/, detail: /open: \(nothing else\)/ },
	submenu: { check: /^context menu probe of area "Right click here": open by right click, into a submenu by pointer.* \(step 2 of 5: point at the first item of what is open that opens a submenu\)$/, detail: /menu \(2 items/ },
	scroller: { check: /^popup probe of button "Pages": open by pointer, scroll its list.* \(step 3 of 6: click outside it and what it opened\)$/, detail: /scrolled since/ },
	toggle: { check: /^toggle probe of checkbox "Accept terms": Tab to it.* \(step 2 of 6: press Enter\)$/, detail: /aria-checked=false/ },
	form: { check: /^popup probe of button "Fruit": open by pointer.* \(step 7 of 12: click item 1 of what is open\)$/, detail: /form: fruit=Apple/ },
	label: { check: /^toggle probe of switch "Wi-Fi": a click on its label, then Space and Tab \(step 1 of 3: click its label\)$/, detail: /focus: the control/ },
	rtl: { check: /^popup probe of button "الإعدادات": open by pointer.* \(step 5 of 12: click outside it and what it opened\)$/, detail: /focus: the control/ },
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

test('a widget rendered alike on several routes is driven once a run and its result is each of those routes\'; where its markup differs it is driven again', async () => {
	const sides = { old: defaultEnv(old), new: defaultEnv(bad) };
	const shared = new Map<string, SharedProbe>();
	const popup = (r: Awaited<ReturnType<typeof checkProbes>>) => r.controls.find((c) => c.cls === 'popup' && c.control === 'button "Settings"');
	const mine = (r: Awaited<ReturnType<typeof checkProbes>>) => r.failures.filter((f) => f.check.startsWith('popup probe of button "Settings"'));
	const first = await checkProbes(browser, sides, '/shared-a', VIEWPORTS[0]!, undefined, { shared });
	// Driven at once with the first, the third waits for it; the fourth, its markup different on new, is driven itself.
	const [second, other] = await Promise.all([checkProbes(browser, sides, '/shared-b', VIEWPORTS[0]!, undefined, { shared }), checkProbes(browser, sides, '/shared-c', VIEWPORTS[0]!, undefined, { shared })]);
	assert.equal(popup(first)?.state, 'probed');
	assert.equal(popup(second)?.state, 'probed on /shared-a, which renders the same widget', JSON.stringify(second.controls));
	assert.equal(popup(other)?.state, 'probed', JSON.stringify(other.controls));
	assert.ok(mine(first).length && mine(other).length);
	assert.deepEqual(mine(second).map((f) => [f.route, f.check]), mine(first).map((f) => ['/shared-b', f.check]));
	assert.ok(mine(second).every((f) => f.actual.endsWith('(driven on /shared-a, which renders the same widget)')));

	const together = new Map<string, SharedProbe>();
	const both = await Promise.all(['/shared-a', '/shared-b'].map((route) => checkProbes(browser, sides, route, VIEWPORTS[0]!, undefined, { shared: together })));
	const driver = both.findIndex((r) => popup(r)?.state === 'probed');
	assert.ok(driver >= 0, JSON.stringify(both.map((r) => r.controls)));
	assert.equal(popup(both[1 - driver]!)?.state, `probed on ${['/shared-a', '/shared-b'][driver]}, which renders the same widget`);
	assert.equal(mine(both[1 - driver]!).length, mine(both[driver]!).length);
});
