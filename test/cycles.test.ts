import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { compareJourneys, stateChange, type Journey, type StepResult } from '../src/check/journeys.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type Report } from '../src/check/types.ts';

// The toggle's name never changes, so only <html>'s class, the page colour and the stored value show which mode it is in.
const restore = `<script>document.documentElement.className = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';</script>`;
const style = '<style>html.dark body { background: rgb(20, 20, 20); color: white } html.light body { background: white }</style>';
const PAGES = {
	// Reads the mode from the page on every click.
	old: `${restore}<button id="t">Theme</button><script>t.onclick = () => { const next = document.documentElement.className === 'dark' ? 'light' : 'dark'; document.documentElement.className = next; localStorage.setItem('theme', next); };</script>`,
	same: `${restore}<button id="t">Theme</button><script>t.onclick = () => { const dark = !document.documentElement.classList.contains('dark'); document.documentElement.className = dark ? 'dark' : 'light'; localStorage.setItem('theme', dark ? 'dark' : 'light'); };</script>`,
	// Keeps its own copy of the mode, out of step with the page after the first click: back to light takes two clicks.
	twice: `${restore}<button id="t">Theme</button><script>const order = ['dark', 'dark', 'light']; let i = 0; t.onclick = () => { const next = order[i++ % 3]; document.documentElement.className = next; localStorage.setItem('theme', next); };</script>`,
	// Never reads the stored mode back on load.
	forgets: `<script>document.documentElement.className = 'light';</script><button id="t">Theme</button><script>t.onclick = () => { const next = document.documentElement.className === 'dark' ? 'light' : 'dark'; document.documentElement.className = next; localStorage.setItem('theme', next); };</script>`,
	// A dialog opened by a button and closed with Escape.
	dialog: `<button id="o">Settings</button><dialog id="d"><p>Settings</p></dialog><script>o.onclick = () => d.showModal();</script>`,
	// The same dialog, which Escape cannot close once it has been opened a second time.
	sticky: `<button id="o">Settings</button><dialog id="d"><p>Settings</p></dialog><script>let opened = 0; o.onclick = () => { opened++; d.showModal(); }; d.addEventListener('cancel', (e) => { if (opened > 1) e.preventDefault(); });</script>`,
	// A dialog a click on its backdrop closes, and one it does not.
	backdrop: `<button id="o">Settings</button><dialog id="d"><p>Settings</p></dialog><script>o.onclick = () => d.showModal(); d.onclick = (e) => { if (e.target === d) d.close(); };</script>`,
	nobackdrop: `<button id="o">Settings</button><dialog id="d"><p>Settings</p></dialog><script>o.onclick = () => d.showModal();</script>`,
	// A dialog with its own history entry that Back closes, and one that ignores Back.
	back: `<button id="o">Settings</button><dialog id="d"><p>Settings</p></dialog><script>o.onclick = () => { d.showModal(); history.pushState(null, '', '#settings'); }; addEventListener('popstate', () => d.close());</script>`,
	noback: `<button id="o">Settings</button><dialog id="d"><p>Settings</p></dialog><script>o.onclick = () => { d.showModal(); history.pushState(null, '', '#settings'); };</script>`,
	// A dialog with a Close button, and one that will not open again once closed by it.
	closer: `<button id="o">Settings</button><dialog id="d"><p>Settings</p><button id="c">Close</button></dialog><script>o.onclick = () => d.showModal(); c.onclick = () => d.close();</script>`,
	once: `<button id="o">Settings</button><dialog id="d"><p>Settings</p><button id="c">Close</button></dialog><script>let closed = false; o.onclick = () => { if (!closed) d.showModal(); }; c.onclick = () => { closed = true; d.close(); };</script>`,
} as const;

// A theme toggle on two pages linked from a nav; the second page reads the stored mode back on load, or (`lost`) does not.
const SITE = (restoreOnOther: boolean) => ({
	'/': `${PAGES.old}<nav><a href="/other">Other</a></nav>`,
	'/other': `${restoreOnOther ? restore : ''}<p>Other page</p><nav><a href="/">Home</a></nav>`,
});

function serve(body: string | Record<string, string>): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const page = typeof body === 'string' ? body : body[path];
		if (page === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html lang="en"><title>Theme</title>${style}<main><h1>Theme</h1>${page}</main></html>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

async function check(old: keyof typeof PAGES | Record<string, string>, next: keyof typeof PAGES | Record<string, string>, routes = ['/'], switched?: string[]): Promise<Report> {
	const [a, b] = await Promise.all([serve(typeof old === 'string' ? PAGES[old] : old), serve(typeof next === 'string' ? PAGES[next] : next)]);
	servers.push(a.server, b.server);
	return runCheck({ oldOrigin: a.origin, newOrigin: b.origin, routes, viewports: [VIEWPORTS[0]!], browser, concurrency: 1, ...(switched ? { switched } : {}) });
}
const behaviour = (report: Report) => report.routes[0]!.failures.filter((f) => !f.accepted && f.dimension === 'behaviour');

test('a toggle is used three times, reloaded and used again, and a port that keeps up stays green', async () => {
	const report = await check('old', 'same');
	assert.deepEqual(behaviour(report).map((f) => `${f.check}: ${f.actual}`), []);
	const toggle = report.routes[0]!.journeys!.find((j) => j.name === 'click button "Theme"')!;
	assert.deepEqual(toggle.cycle, ['again', 'again', 'reload', 'again']);
	assert.deepEqual(toggle.expected.map((r) => r.state?.filter((l) => l.startsWith('html class')).join(' ')), ['html class +dark html class -light', 'html class +light html class -dark', 'html class +dark html class -light', undefined, 'html class +light html class -dark']);
});

test('a toggle that needs two clicks to go back fails on the second use and names what each side changed', async () => {
	const [f, ...rest] = behaviour(await check('old', 'twice'));
	assert.equal(rest.length, 0, rest.map((r) => r.check).join(', '));
	assert.equal(f!.check, 'click button "Theme" (step 2 of 5: use 2)');
	assert.match(f!.expected, /^old changed: .*html class \+light \| html class -dark .*localStorage theme: "dark" → "light"/);
	assert.match(f!.actual, /^new changed: \(nothing\)/);
	assert.match(f!.expected, /step by step: 1\. .*html class \+dark.*; 2\. .*html class \+light/);
	assert.match(f!.hint, /loses track of its state/);
});

test('a port that does not read the stored mode back fails after the reload', async () => {
	const [f, ...rest] = behaviour(await check('old', 'forgets'));
	assert.equal(rest.length, 0, rest.map((r) => r.check).join(', '));
	assert.equal(f!.check, 'click button "Theme" (step 4 of 5: reload after use 3)');
	assert.match(f!.expected, /old changed: \(nothing\)/);
	assert.match(f!.actual, /new changed: .*html class -dark/);
});

test('a dialog is opened, closed with Escape and opened again, and one that stops closing fails at that step', async () => {
	const green = await check('dialog', 'dialog');
	assert.deepEqual(behaviour(green).map((f) => f.check), []);
	assert.deepEqual(green.routes[0]!.journeys!.find((j) => j.name === 'click button "Settings"')!.cycle, ['escape', 'again', 'escape', 'again']);
	const [f] = behaviour(await check('dialog', 'sticky'));
	assert.equal(f!.check, 'click button "Settings" (step 4 of 5: closed by Escape after use 2)');
});

test('a dialog is closed every way the old one closes, then opened again, and a way the new one does not close fails at that step', async () => {
	const names = (report: Report) => report.routes[0]!.journeys!.map((j) => `${j.name} ${JSON.stringify(j.cycle ?? [])}`);
	const outside = await check('backdrop', 'backdrop');
	assert.deepEqual(behaviour(outside).map((f) => f.check), []);
	assert.ok(names(outside).some((n) => /^click button "Settings", closed by a click outside it \[\{"outside":\{"x":\d+,"y":\d+\}\},"again"\]$/.test(n)), names(outside).join('\n'));
	assert.deepEqual(behaviour(await check('backdrop', 'nobackdrop')).map((f) => f.check), ['click button "Settings", closed by a click outside it (step 2 of 3: closed by a click outside it after use 1)']);
	const back = await check('back', 'back');
	assert.deepEqual(behaviour(back).map((f) => f.check), []);
	assert.ok(names(back).includes('click button "Settings", closed by going back ["back","again"]'), names(back).join('\n'));
	assert.deepEqual(behaviour(await check('back', 'noback')).map((f) => f.check), ['click button "Settings", closed by going back (step 2 of 3: closed by going back after use 1)']);
	const closer = await check('closer', 'closer');
	assert.deepEqual(behaviour(closer).map((f) => f.check), []);
	assert.ok(names(closer).includes('click button "Settings", then click button "Close" ["reopen"]'), names(closer).join('\n'));
	assert.deepEqual(behaviour(await check('closer', 'once')).map((f) => f.check), ['click button "Settings", then click button "Close" (step 3 of 3: open it again)']);
});

test('a stored mode is still in force after following an in-site link and reloading there, and a page that drops it fails on the link', async () => {
	const green = await check(SITE(true), SITE(true), ['/'], ['/other']);
	assert.deepEqual(behaviour(green).map((f) => `${f.check}: ${f.actual}`), []);
	const follow = green.routes[0]!.journeys!.find((j) => j.name === 'click button "Theme", then follow link "Other"')!;
	assert.deepEqual(follow.cycle, [{ navigate: { role: 'link', name: 'Other', nth: 0 } }, 'reload']);
	assert.ok(!follow.expected.some((r) => r.door), 'the switched page is the new app\'s, so what it keeps is compared');
	const [f, ...rest] = behaviour(await check(SITE(true), SITE(false), ['/'], ['/other']));
	assert.equal(rest.length, 0, rest.map((r) => r.check).join(', '));
	assert.equal(f!.check, 'click button "Theme", then follow link "Other" (step 2 of 3: follow link "Other" after use 1)');
	assert.match(f!.actual, /new changed: .*html class -dark/);
});

const step = (over: Partial<StepResult>): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, ...over });

test('what a step changes is read per subject, and a value that varied between old runs may vary on the new one', () => {
	assert.deepEqual(stateChange(['html class +light\t', 'html data-theme\tlight', 'localStorage a\t"1"'], ['html class +dark\t', 'html data-theme\tdark', 'localStorage b\t"2"']), ['html class +dark', 'html class -light', 'html data-theme: light → dark', 'localStorage a: "1" → (none)', 'localStorage b: (none) → "2"']);
	const journey: Journey = { name: 'click button "Save"', steps: [{ action: 'click', target: { role: 'button', name: 'Save', nth: 0 } }], cycle: ['again'] };
	const at = (t: string) => [[step({}), step({ state: [`localStorage saved: (none) → "${t}"`] })]];
	assert.deepEqual(compareJourneys('/', [at('10:01'), at('10:02')], [journey], at('10:03')), []);
	assert.equal(compareJourneys('/', [at('10:01'), at('10:01')], [journey], at('10:03')).length, 1);
});
