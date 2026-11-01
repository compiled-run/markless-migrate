import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { NOT_EXERCISED } from '../src/check/locate.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A cookie banner covers Subscribe until it is accepted; Copy takes the pointer only while its code block is hovered;
// Claim sits under a shield nothing removes. `shielded: false` is a port where nothing covers Claim.
const page = (shielded: boolean) => `<!doctype html><html lang="en"><title>Offers</title>
<style>
main { padding-top: 40px; }
.code { padding: 20px; background: #eee; }
.code .copy { pointer-events: none; }
.code:hover .copy { pointer-events: auto; }
.prize { position: relative; display: inline-block; margin: 20px; }
.shield { position: absolute; inset: -6px; background: rgba(255, 255, 255, 0.01); }
#banner { position: fixed; left: 0; right: 0; top: 0; height: 120px; background: #222; color: #fff; }
</style>
<main><h1>Offers</h1>
<p><button onclick="this.textContent = 'Subscribed'">Subscribe</button></p>
<div class="code"><pre>npm i markless</pre><button class="copy" onclick="this.textContent = 'Copied'">Copy</button></div>
<span class="prize"><button onclick="this.textContent = 'Claimed'">Claim</button>${shielded ? '<span class="shield"></span>' : ''}</span>
</main>
<div id="banner" role="region" aria-label="Cookies">We use cookies <button onclick="document.getElementById('banner').remove()">Accept</button></div>`;

function app(shielded: boolean): Promise<Server> {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page(shielded)));
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});
const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const check = async (oldShield: boolean, newShield: boolean) => {
	const [a, b] = await Promise.all([app(oldShield), app(newShield)]);
	servers.push(a, b);
	return runCheck({ oldOrigin: origin(a), newOrigin: origin(b), routes: ['/'], viewports: [VIEWPORTS[0]!], browser });
};

test('a control under a cookie banner or needing its holder hovered is reached by dismissing the banner and hovering', async () => {
	const route = (await check(true, true)).routes[0]!;
	const by = (name: string) => route.coverage!.elements.find((e) => e.element === name)?.by;
	assert.equal(by('button "Subscribe"'), 'click button "Subscribe"');
	assert.equal(by('button "Copy"'), 'click button "Copy"');
	assert.deepEqual(route.failures.filter((f) => !f.accepted && !f.check.startsWith(NOT_EXERCISED)).map((f) => f.check), []);
});

test('a control neither page lets a visitor use, for the same reason, is reported precisely and accepted automatically', async () => {
	const route = (await check(true, true)).routes[0]!;
	const claim = route.failures.find((f) => f.check === `${NOT_EXERCISED}button "Claim"`)!;
	assert.match(claim.actual, /could not be used: occluded: covered by span\.shield at its centre \(\d+, \d+\), still after scrolling it to the middle, focusing it, pressing Escape/);
	assert.equal(claim.accepted?.automatic, 'unreachable-on-both');
	assert.match(claim.accepted!.reason, /neither page lets a visitor use it, for the same reason \(occluded\)/);
	assert.ok(route.ok, 'nothing else keeps the route red');
});

test('when the new page lets a visitor use it, the old page\'s unreachable control stays red', async () => {
	const route = (await check(true, false)).routes[0]!;
	const claim = route.failures.find((f) => f.check === `${NOT_EXERCISED}button "Claim"`)!;
	assert.equal(claim.accepted, undefined);
	assert.equal(route.ok, false);
});

// VitePress's code group: each tab is a radio hidden behind its label, picked by clicking the label.
const tabs = `<!doctype html><html lang="en"><title>Install</title>
<style>.tabs input { position: fixed; opacity: 0; pointer-events: none; } .tabs label { display: inline-block; padding: 8px; } .block { display: none; } .block.active { display: block; }</style>
<main><h1>Install</h1><div class="tabs">
<input type="radio" name="pm" id="npm" checked><label for="npm">npm</label>
<input type="radio" name="pm" id="pnpm"><label for="pnpm">pnpm</label>
</div><pre class="block active" id="b-npm">npm i markless</pre><pre class="block" id="b-pnpm">pnpm add markless</pre></main>
<script>document.querySelector('.tabs').addEventListener('change', (e) => { for (const b of document.querySelectorAll('.block')) b.classList.toggle('active', b.id === 'b-' + e.target.id); });</script>`;

test('a radio drawn by its label is used through the label', async () => {
	const [a, b] = await Promise.all(
		[0, 1].map(() => new Promise<Server>((done) => { const s = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(tabs)); s.listen(0, '127.0.0.1', () => done(s)); })),
	);
	servers.push(a!, b!);
	const route = (await runCheck({ oldOrigin: origin(a!), newOrigin: origin(b!), routes: ['/'], viewports: [VIEWPORTS[0]!], browser })).routes[0]!;
	const by = (name: string) => route.coverage!.elements.find((e) => e.element === name)?.by;
	assert.equal(by('radio "pnpm"'), 'click radio "pnpm"');
	assert.equal(route.failures.find((f) => f.check === `${NOT_EXERCISED}radio "pnpm"`), undefined);
});

// React Aria's switch: the input sits inside its label, clipped to nothing by a visually hidden wrapper; a person clicks the drawn switch.
const switches = `<!doctype html><html lang="en"><title>Settings</title>
<style>.track { display: inline-flex; width: 32px; height: 18px; border-radius: 9px; background: #ccc; } .track:has(:checked) { background: #333; }</style>
<main><h1>Settings</h1><div>
<label class="track"><span style="border:0;clip:rect(0 0 0 0);clip-path:inset(50%);height:1px;margin:-1px;overflow:hidden;padding:0;position:absolute;width:1px;white-space:nowrap"><input id="airplane" type="checkbox" role="switch"></span><span></span></label>
<label for="airplane">Airplane Mode</label></div><p id="state">off</p></main>
<script>document.getElementById('airplane').addEventListener('change', (e) => { document.getElementById('state').textContent = e.target.checked ? 'on' : 'off'; });</script>`;

test('a switch input clipped away inside its label is used through the label, as a person clicks the drawn switch', async () => {
	const [a, b] = await Promise.all(
		[0, 1].map(() => new Promise<Server>((done) => { const s = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(switches)); s.listen(0, '127.0.0.1', () => done(s)); })),
	);
	servers.push(a!, b!);
	const route = (await runCheck({ oldOrigin: origin(a!), newOrigin: origin(b!), routes: ['/'], viewports: [VIEWPORTS[0]!], browser })).routes[0]!;
	const by = (name: string) => route.coverage!.elements.find((e) => e.element === name)?.by;
	assert.equal(route.failures.find((f) => f.check === `${NOT_EXERCISED}switch "Airplane Mode"`)?.actual, undefined);
	assert.equal(by('switch "Airplane Mode"'), 'click switch "Airplane Mode"');
});
