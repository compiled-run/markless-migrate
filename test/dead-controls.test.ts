import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type Failure, type Report } from '../src/check/types.ts';

// Each widget as a component library draws it. Its answer shows only as a moved track, an ARIA value, a class or the accessibility tree.
const WIDGETS = `
<section role="region" aria-roledescription="carousel" aria-label="Gallery">
	<div style="overflow: hidden; width: 300px"><div id="track" style="display: flex; transform: translateX(0px)"><div style="min-width: 300px; height: 80px; background: rgb(200, 40, 40)">One</div><div style="min-width: 300px; height: 80px; background: rgb(40, 40, 200)">Two</div></div></div>
	<button id="next" type="button">Next slide</button>
</section>
<div id="volume" role="slider" aria-label="Volume" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" style="position: relative; width: 200px; height: 12px; background: rgb(220, 220, 220)"><span id="thumb" style="position: absolute; left: 100px; width: 12px; height: 12px; background: black"></span></div>
<style>#swatch { width: 120px; height: 40px; background: rgb(230, 230, 230) } #swatch.on { background: rgb(0, 160, 0) }</style>
<button id="tint" type="button">Tint</button><div id="swatch"></div>
<button id="opener" type="button">Open settings</button><div id="settings" role="dialog" aria-label="Settings" hidden><p>Settings body</p></div>
<div role="tablist" aria-label="Account"><button id="tab-a" role="tab" aria-selected="true" aria-controls="panel-a">Profile</button><button id="tab-b" role="tab" aria-selected="false" aria-controls="panel-b">Billing</button></div>
<div id="panel-a" role="tabpanel" aria-labelledby="tab-a">Profile panel</div><div id="panel-b" role="tabpanel" aria-labelledby="tab-b" hidden>Billing panel</div>
<div role="region" aria-roledescription="carousel" aria-label="Autoplay" style="overflow: hidden; width: 200px"><div id="belt" style="display: flex; transform: translateX(0px)"><div style="min-width: 200px; height: 30px; background: rgb(250, 200, 0)">News</div><div style="min-width: 200px; height: 30px; background: rgb(0, 200, 250)">More news</div></div></div>
<form id="form"><label>Name <input id="name" name="name"></label><button type="submit">Save</button></form><p id="saved" role="status"></p>`;

const BEHAVIOUR = `<script>
const $ = (id) => document.getElementById(id);
$('next').onclick = () => { $('track').style.transform = 'translateX(-300px)'; };
$('volume').onkeydown = (e) => { const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'End' ? 100 : e.key === 'Home' ? -100 : 0; if (!step) return; e.preventDefault(); const v = Math.max(0, Math.min(100, Number($('volume').getAttribute('aria-valuenow')) + step)); $('volume').setAttribute('aria-valuenow', String(v)); $('thumb').style.left = (v * 2 - 6) + 'px'; };
$('tint').onclick = () => $('swatch').classList.toggle('on');
$('opener').onclick = () => { $('settings').hidden = false; };
for (const tab of document.querySelectorAll('[role="tab"]')) tab.onclick = () => { for (const t of document.querySelectorAll('[role="tab"]')) { t.setAttribute('aria-selected', String(t === tab)); $(t.getAttribute('aria-controls')).hidden = t !== tab; } };
// It moves on its own, used or not: no step's answer.
const roll = (t) => { $('belt').style.transform = 'translateX(' + -Math.round((t / 20) % 200) + 'px)'; requestAnimationFrame(roll); };
requestAnimationFrame(roll);
$('form').onsubmit = (e) => { e.preventDefault(); $('saved').textContent = 'Saved ' + $('name').value; };
</script>`;

const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Widgets</title></head><body><header><nav><a href="/">Home</a></nav></header><main><h1>Widgets</h1>${body}</main></body></html>`;
const ALIVE = page(`${WIDGETS}${BEHAVIOUR}`);
// The same markup, every control drawn and none answering: what a port looks like when its parts never run.
const DEAD = page(WIDGETS);
const TRACK = WIDGETS.slice(0, WIDGETS.indexOf('</section>') + '</section>'.length);

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

function serve(pages: (path: string) => string | undefined): Promise<string> {
	const server = createServer((req, res) => {
		const body = pages(new URL(req.url ?? '/', 'http://x').pathname);
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

async function check(old: (path: string) => string | undefined, next: (path: string) => string | undefined, routes = ['/']): Promise<Report> {
	const [a, b] = await Promise.all([serve(old), serve(next)]);
	return runCheck({ oldOrigin: a, newOrigin: b, routes, viewports: [VIEWPORTS[0]!], browser, concurrency: 1 });
}

const open = (r: Report) => r.routes.flatMap((x) => x.failures).filter((f) => !f.accepted);
const about = (failures: readonly Failure[], name: string) => failures.filter((f) => f.dimension !== 'motion' && f.check.includes(name));

test('the same page on both sides is green', async () => {
	const report = await check(() => ALIVE, () => ALIVE);
	assert.deepEqual(open(report).map((f) => `${f.dimension}: ${f.check}: ${f.actual}`), []);
	assert.ok(report.routes[0]!.ok);
});

test('a port whose controls are drawn but never answer is red for every one of them, however the old page answered', async () => {
	const report = await check(() => ALIVE, () => DEAD);
	const failures = open(report);
	assert.equal(report.routes[0]!.ok, false);
	// A carousel track that moves by its transform, which the accessibility tree does not show.
	const carousel = about(failures, 'click button "Next slide"');
	assert.ok(carousel.length, JSON.stringify(failures.map((f) => f.check)));
	assert.match(carousel[0]!.expected, /answers with: .*region \(carousel\) "Gallery" moved/);
	assert.match(carousel[0]!.actual, /answers with: no widget changes; the view does not change at/);
	// A slider whose value lives in aria-valuenow, which the accessibility snapshot leaves out, and whose thumb moves inside its own box.
	const slider = about(failures, 'slider "Volume"');
	assert.ok(slider.length, JSON.stringify(failures.map((f) => f.check)));
	assert.match(slider[0]!.expected, /slider "Volume" aria-valuenow: 50 → 51/);
	// A swatch that changes only by a class: the frame after the step is all that shows it.
	const tint = about(failures, 'click button "Tint"');
	assert.ok(tint.length, JSON.stringify(failures.map((f) => f.check)));
	assert.match(tint[0]!.expected, /the view changes at/);
	assert.ok(!failures.some((f) => f.expected.includes('Autoplay')), 'what moves on its own is not any step\'s answer');
	// What opens, what is selected and what a form submits are in the accessibility tree.
	for (const name of ['click button "Open settings"', 'click tab "Billing"', 'submit with button "Save"']) assert.ok(about(failures, name).length, `${name}: ${JSON.stringify(failures.map((f) => f.check))}`);
});

test('a page of a large site is exercised on its own, though its template group shares its layout and kinds of control', async () => {
	// Three pages of one URL pattern, one layout and the same carousel, grouped as a large site's are (the threshold lowered to 2); only the last page's port is dead.
	const routes = ['/docs/01', '/docs/02', '/docs/03'];
	const plain = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Docs</title></head><body><main><h1>Docs</h1>${body}</main></body></html>`;
	const alive = plain(`${TRACK}<script>document.getElementById('next').onclick = () => { document.getElementById('track').style.transform = 'translateX(-300px)'; };</script>`);
	const dead = plain(TRACK);
	const [a, b] = await Promise.all([serve((path) => (routes.includes(path) ? alive : undefined)), serve((path) => (routes.includes(path) ? (path === routes.at(-1) ? dead : alive) : undefined))]);
	const report = await runCheck({ oldOrigin: a, newOrigin: b, routes, viewports: [VIEWPORTS[0]!], browser, concurrency: 1, templates: { threshold: 2 } });
	assert.ok(report.templates?.groups.some((g) => g.members.length === routes.length), 'one template group');
	const last = report.routes.find((r) => r.route === routes.at(-1))!;
	assert.notEqual(last.template?.representative, last.route);
	assert.equal(last.dimensions.behaviour, 'fail');
	assert.equal(last.dimensions.visual, 'skipped', 'what the representative carries says so');
	assert.ok(about(last.failures, 'click button "Next slide"').length, JSON.stringify(last.failures.map((f) => f.check)));
	assert.ok(!last.ok);
	assert.ok(report.routes.filter((r) => r.route !== routes.at(-1)).every((r) => r.ok), JSON.stringify(report.routes.filter((r) => r.route !== routes.at(-1) && !r.ok).map((r) => [r.route, r.failures.map((f) => [f.check, f.expected, f.actual])])));
});

test('an old page that loads without its own stylesheet is not checked, never red or green against a port that has it', async () => {
	const styled = (missing: boolean) => (path: string) => (path === '/site.css' ? (missing ? undefined : 'main { color: rgb(20, 20, 160) }') : path === '/' ? page(`<link rel="stylesheet" href="/site.css">${TRACK}`) : undefined);
	const report = await check(styled(true), styled(false));
	const route = report.routes[0]!;
	assert.equal(route.ok, false);
	assert.equal(route.infrastructure?.cause, 'old page broken');
	assert.match(route.infrastructure!.message, /\/site\.css \(404\)/);
});

test('a styled state of an element past the right edge of the page is compared, not the end of the route check', async () => {
	const aside = page(`<style>.toc a:hover { color: rgb(200, 0, 0) } .toc { position: fixed; left: 1400px; top: 10px }</style><aside class="toc"><a href="#installation">Installation</a></aside><h2 id="installation">Installation</h2>`);
	const report = await check(() => aside, () => aside);
	assert.ok(!report.routes[0]!.failures.some((f) => /it stopped/.test(f.actual)), JSON.stringify(report.routes[0]!.failures.map((f) => f.actual)));
});

test('a copy button that writes to the clipboard answers alike on both sides, on Linux too, and one that never copies is red', async () => {
	const copy = (alive: boolean) => page(`<pre id="code">npm create vite</pre><button id="copy" type="button">Copy code</button>${alive ? `<script>document.getElementById('copy').onclick = async () => { await navigator.clipboard.writeText(document.getElementById('code').textContent); document.getElementById('copy').textContent = 'Copied'; };</script>` : ''}`);
	const same = await check(() => copy(true), () => copy(true));
	assert.deepEqual(open(same).map((f) => `${f.dimension}: ${f.check}: ${f.actual}`), []);
	const dead = await check(() => copy(true), () => copy(false));
	assert.ok(about(open(dead), 'click button "Copy code"').length, JSON.stringify(open(dead).map((f) => f.check)));
});

test('alike controls that each reveal their own content are all used: the one revealing the wrong source is red', async () => {
	const demos = (wrong: boolean) => page(['Button', 'Dialog', 'Select', 'Tabs'].map((name, i) => `<section aria-label="${name} demo"><button type="button" data-slot="view-code" onclick="this.nextElementSibling.hidden = false">View Code</button><pre hidden>${wrong && i === 3 ? 'import { Accordion } from "ui"' : `import { ${name} } from "ui"`}</pre></section>`).join(''));
	const same = await check(() => demos(false), () => demos(false));
	assert.deepEqual(open(same).map((f) => `${f.dimension}: ${f.check}: ${f.actual}`), []);
	const wrong = open(await check(() => demos(false), () => demos(true)));
	const revealed = wrong.find((f) => /View Code/.test(f.check) && /import \{ Tabs \}/.test(f.expected));
	assert.ok(revealed, JSON.stringify(wrong.map((f) => [f.check, f.expected.slice(0, 80)])));
	assert.match(revealed!.actual, /Accordion/);
});
