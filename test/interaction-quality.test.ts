import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { LAUNCH } from '../src/check/browser.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type Report } from '../src/check/types.ts';

// A modal that locks the page's scroll and makes up for the scrollbar it hides, as Radix's does; `early` gives the padding back before the scrollbar returns.
const dialog = (early: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dialog</title>
<style>body { margin: 0 } main { width: 600px; margin: 0 auto } .tall { height: 3000px } #dlg { position: fixed; inset: 100px auto auto 100px; background: white; border: 1px solid; padding: 20px }</style></head>
<body><main><h1>Dialog</h1><button id="open" type="button">Open dialog</button><div class="tall">Content</div></main>
<div id="dlg" role="dialog" aria-label="Settings" hidden><p>Settings</p><button id="close" type="button">Close</button></div>
<script>
const $ = (id) => document.getElementById(id);
$('open').onclick = () => { const gap = innerWidth - document.documentElement.clientWidth; document.body.style.overflow = 'hidden'; document.body.style.paddingRight = gap + 'px'; $('dlg').hidden = false; };
$('close').onclick = () => {
	$('dlg').hidden = true;
	document.body.style.paddingRight = '';
	${early ? "setTimeout(() => { document.body.style.overflow = ''; }, 300);" : "document.body.style.overflow = '';"}
};
</script></body></html>`;

// Tabs that switch at once, or (`slow`) a third of a second after the click.
const tabs = (slow: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tabs</title></head><body><main><h1>Install</h1>
<div role="tablist" aria-label="Package manager"><button role="tab" id="t1" aria-selected="true" aria-controls="p1">npm</button><button role="tab" id="t2" aria-selected="false" aria-controls="p2">pnpm</button></div>
<div role="tabpanel" id="p1">npm install</div><div role="tabpanel" id="p2" hidden>pnpm add</div>
<script>
for (const tab of document.querySelectorAll('[role="tab"]')) tab.onclick = () => {
	const pick = () => { for (const t of document.querySelectorAll('[role="tab"]')) { t.setAttribute('aria-selected', String(t === tab)); document.getElementById(t.getAttribute('aria-controls')).hidden = t !== tab; } };
	${slow ? 'setTimeout(pick, 350);' : 'pick();'}
};
</script></main></body></html>`;

// A long page with an "On this page" list that marks the section in view, as fumadocs's does; `dead` never marks it.
const contents = (dead: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Guide</title><style>.active { font-weight: bold } section { height: 1400px } aside { position: fixed; right: 0; top: 0 }</style></head><body>
<aside><nav aria-label="On this page"><a href="#intro">Intro</a><a href="#usage">Usage</a><a href="#api">API</a></nav></aside>
<main><section id="intro"><h2>Intro</h2></section><section id="usage"><h2>Usage</h2></section><section id="api"><h2>API</h2></section></main>
${dead ? '' : `<script>
const mark = () => { let current = 'intro'; for (const s of document.querySelectorAll('section')) if (s.getBoundingClientRect().top <= 10) current = s.id; for (const a of document.querySelectorAll('nav a')) a.classList.toggle('active', a.getAttribute('href') === '#' + current); };
addEventListener('scroll', mark, { passive: true }); mark();
</script>`}</body></html>`;

// A two-page site whose router swaps <main> in place; the widget page's carousel is wired by `init`. `reinit` runs it again after a swap, as the old app's framework does.
const site = (reinit: boolean) => {
	const script = `<script>
function init() { const next = document.getElementById('next'); if (next) next.onclick = () => { document.getElementById('track').style.transform = 'translateX(-300px)'; }; }
document.addEventListener('click', async (e) => {
	const a = e.target.closest('a[data-nav]'); if (!a) return; e.preventDefault();
	const html = await (await fetch(a.href)).text();
	document.querySelector('main').innerHTML = new DOMParser().parseFromString(html, 'text/html').querySelector('main').innerHTML;
	history.pushState(null, '', a.href);${reinit ? ' init();' : ''}
});
init();
</script>`;
	const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Site</title></head><body><nav><a data-nav href="/">Home</a> <a data-nav href="/widget">Widget</a></nav><main>${body}</main>${script}</body></html>`;
	return (path: string) => (path === '/widget' ? page('<h1>Widget</h1><section role="region" aria-roledescription="carousel" aria-label="Gallery"><div style="overflow: hidden; width: 300px"><div id="track" style="display: flex"><div style="min-width: 300px; height: 80px; background: rgb(200, 40, 40)">One</div><div style="min-width: 300px; height: 80px; background: rgb(40, 40, 200)">Two</div></div></div><button id="next" type="button">Next slide</button></section>') : path === '/' ? page('<h1>Home</h1><p>Welcome</p>') : undefined);
};

// A chart whose surface shows a tooltip for the point under the pointer, as recharts does; `dead` draws the same chart and answers nothing.
const chart = (dead: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Chart</title><style>#tip { position: absolute; background: black; color: white; padding: 4px }</style></head><body><main><h1>Visitors</h1>
<svg id="chart" width="400" height="200" style="background: rgb(240, 240, 240)"><rect x="40" y="80" width="40" height="120" fill="steelblue"></rect><rect x="160" y="40" width="40" height="160" fill="steelblue"></rect><rect x="280" y="120" width="40" height="80" fill="steelblue"></rect></svg>
<div id="tip" role="tooltip" hidden></div></main>
${dead ? '' : `<script>
const months = ['January', 'February', 'March', 'April'];
document.getElementById('chart').addEventListener('mousemove', (e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.min(3, Math.floor(((e.clientX - r.left) / r.width) * 4)); const tip = document.getElementById('tip'); tip.hidden = false; tip.textContent = months[i] + ': ' + (100 + i * 37); tip.style.left = e.pageX + 10 + 'px'; tip.style.top = e.pageY + 10 + 'px'; });
</script>`}</body></html>`;

// Two pages that both show a badge in another style; `morph` keeps the previous page's badge node and swaps its class, so its transition runs while the page changes.
const badges = (morph: boolean) => {
	const script = `<script>
document.addEventListener('click', async (e) => {
	const a = e.target.closest('a[data-nav]'); if (!a) return; e.preventDefault();
	const next = new DOMParser().parseFromString(await (await fetch(a.href)).text(), 'text/html');
	${morph ? "const badge = document.querySelector('main .badge'); const incoming = next.querySelector('main .badge'); badge.className = incoming.className; badge.textContent = incoming.textContent; document.querySelector('main h1').textContent = next.querySelector('main h1').textContent;" : "document.querySelector('main').innerHTML = next.querySelector('main').innerHTML;"}
	history.pushState(null, '', a.href);
});
</script>`;
	const page = (title: string, kind: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Badges</title><style>.badge { display: inline-block; padding: 4px 8px; transition: background-color 400ms, color 400ms } .badge.primary { background: rgb(20, 20, 20); color: white } .badge.outline { background: white; color: rgb(20, 20, 20); border: 1px solid }</style></head><body><nav><a data-nav href="/">Home</a> <a data-nav href="/badge">Badge</a></nav><main><h1>${title}</h1><span class="badge ${kind}">${kind}</span></main>${script}</body></html>`;
	return (path: string) => (path === '/badge' ? page('Badge', 'outline') : path === '/' ? page('Home', 'primary') : undefined);
};

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
});
after(async () => {
	await browser?.close();
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

function serve(body: string | ((path: string) => string | undefined)): Promise<string> {
	const server = createServer((req, res) => {
		const page = typeof body === 'string' ? body : body(new URL(req.url ?? '/', 'http://x').pathname);
		if (page === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

async function check(old: string | ((path: string) => string | undefined), next: string | ((path: string) => string | undefined), routes = ['/']): Promise<Report> {
	const [a, b] = await Promise.all([serve(old), serve(next)]);
	return runCheck({ oldOrigin: a, newOrigin: b, routes, viewports: [VIEWPORTS[0]!], browser, concurrency: 1, journeys: { budgetMs: 60_000 } });
}

const open = (r: Report) => r.routes.flatMap((x) => x.failures).filter((f) => !f.accepted && f.dimension !== 'motion');

// macOS draws overlay scrollbars that take no width when the system says so (a trackpad and no mouse): there no visitor sees a scroll-lock shift either.
async function scrollbarWidth(): Promise<number> {
	const page = await browser.newPage();
	try {
		await page.setContent('<div style="height: 3000px">x</div>');
		return await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
	} finally {
		await page.close();
	}
}

test('check runs Chromium with scrollbars, as a visitor sees the page', async (t) => {
	if (process.platform === 'darwin' && (await scrollbarWidth()) === 0) return t.skip('this Mac draws overlay scrollbars');
	assert.ok((await scrollbarWidth()) > 0);
});

test('a dialog whose close shifts the page sideways is red; the same dialog on both sides is green', async (t) => {
	if (process.platform === 'darwin' && (await scrollbarWidth()) === 0) return t.skip('this Mac draws overlay scrollbars');
	const same = await check(dialog(false), dialog(false));
	assert.deepEqual(open(same).map((f) => `${f.check}: ${f.actual}`), []);
	const early = open(await check(dialog(false), dialog(true)));
	const close = early.find((f) => /click button "Close"/.test(f.check));
	assert.ok(close, JSON.stringify(early.map((f) => f.check)));
	assert.match(close!.actual, /layout: a large part of the page moves [1-9]\d* px sideways/);
});

test('tabs that switch more than 50 ms and half again slower than the original are red; the same tabs are green', async () => {
	const same = await check(tabs(false), tabs(false));
	assert.deepEqual(open(same).map((f) => `${f.check}: ${f.actual}`), []);
	const slow = open(await check(tabs(false), tabs(true)));
	const pick = slow.find((f) => /click tab "pnpm"/.test(f.check));
	assert.ok(pick, JSON.stringify(slow.map((f) => f.check)));
	assert.match(pick!.actual, /first change \d+ ms after the step/);
});

test('a contents list that stops marking the section in view while the page scrolls is red; the same list is green', async () => {
	const same = await check(contents(false), contents(false));
	assert.deepEqual(open(same).map((f) => `${f.check}: ${f.actual}`), []);
	const dead = open(await check(contents(false), contents(true)));
	const scroll = dead.find((f) => /scroll through the 3 sections/.test(f.check));
	assert.ok(scroll, JSON.stringify(dead.map((f) => f.check)));
	assert.match(scroll!.expected, /link "Usage" class \+active/);
});

test('a widget that works on a fresh load but not after the router brings its page in place is red; the same site is green', async () => {
	const same = await check(site(true), site(true), ['/widget']);
	assert.deepEqual(open(same).map((f) => `${f.check}: ${f.actual}`), []);
	const stale = open(await check(site(true), site(false), ['/widget']));
	assert.ok(!stale.some((f) => f.check === 'click button "Next slide"'), 'on a fresh load it works');
	const arrived = stale.find((f) => /^click button "Next slide", after arriving from \/ by link "Widget"/.test(f.check));
	assert.ok(arrived, JSON.stringify(stale.map((f) => f.check)));
	assert.match(arrived!.expected, /region \(carousel\) "Gallery" moved/);
});

test('a chart that shows no tooltip where the original shows one as the pointer moves across it is red; the same chart is green', async () => {
	const same = await check(chart(false), chart(false));
	assert.deepEqual(open(same).map((f) => `${f.check}: ${f.actual}`), []);
	const dead = open(await check(chart(false), chart(true)));
	const across = dead.find((f) => /^move the pointer across surface <svg>/.test(f.check));
	assert.ok(across, JSON.stringify(dead.map((f) => f.check)));
	assert.match(across!.expected, /tooltip|February|January/);
});

test("content that morphs from the previous page's look while the router changes pages is red; a router that swaps the page is green", async () => {
	const same = await check(badges(false), badges(false));
	assert.deepEqual(open(same).map((f) => `${f.check}: ${f.actual}`), []);
	const morphing = open(await check(badges(false), badges(true)));
	const nav = morphing.find((f) => /^click link "Badge"/.test(f.check));
	assert.ok(nav, JSON.stringify(morphing.map((f) => f.check)));
	assert.match(nav!.actual, /moves while the page changes: .*background-color/);
});

test('a page that changes on its own every 3 s (a demo toggling a loading state) is the same page whatever phase each step lands on', async () => {
	const cycling = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Indicator</title></head><body><main><h1>Indicator</h1><button id="post" type="button">Post It!</button><img id="spin" alt="Loading..." hidden src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><script>setInterval(() => { document.getElementById('spin').hidden = !document.getElementById('spin').hidden; }, 3000);</script></main></body></html>`;
	const same = await check(cycling, cycling);
	assert.deepEqual(open(same).filter((f) => f.dimension === 'behaviour' || f.dimension === 'a11y').map((f) => `${f.check}: ${f.actual}`), []);
});
