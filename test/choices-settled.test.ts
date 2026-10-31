// convert's record of what choosing a palette option did is the same however loaded the machine is: it is read once the
// page has finished moving (a redirect answered, the router's render committed), only the options the trigger opened are
// chosen, and a control whose options could not all be chosen is refused, never written as a partial record.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureChoices } from '../src/convert/choices.ts';
import type { Reveal } from '../src/convert/reveal.ts';

const palette = (items: string, extra = '') => `<!doctype html><html><body><button id="open" aria-expanded="false">Search</button>${extra}<script>
const slice = (ms) => new Promise((done) => { const end = performance.now() + ms; const ch = new MessageChannel(); ch.port1.onmessage = () => (performance.now() < end ? ch.port2.postMessage(0) : done()); ch.port2.postMessage(0); });
document.getElementById('open').addEventListener('click', () => {
	const list = document.createElement('div');
	list.setAttribute('role', 'dialog');
	list.innerHTML = ${JSON.stringify(items)};
	for (const item of list.querySelectorAll('[cmdk-item]')) item.addEventListener('click', () => window.choose(item.dataset.value));
	document.body.append(list);
});
</script></body></html>`;

// Next.js on a prefetched route that the server redirects: the address moves to the route first, then to where it redirects.
const REDIRECT = palette('<div cmdk-item data-value="Typography">Typography</div>') + `<script>
window.choose = async () => {
	history.pushState(null, '', '/docs/components/typography');
	await fetch('/data/redirect').then((r) => r.text());
	history.replaceState(null, '', '/docs/typeset');
};
</script>`;

// Next.js on a route it has not prefetched: the address moves to the route the option names, which the server redirects.
const UNFETCHED = palette('<div cmdk-item data-value="Typography">Typography</div>') + `<script>
window.choose = () => history.pushState(null, '', '/docs/components/typography?x=1#top');
</script>`;

// A client router whose data answers after the first look's 500 ms, and whose render then takes a while to commit the move.
const LATE = palette('<div cmdk-item data-value="Late">Late</div>') + `<script>
window.choose = async () => {
	await fetch('/data/slow').then((r) => r.text());
	await slice(400);
	history.pushState(null, '', '/docs/late');
};
</script>`;

// A page whose own content is a command menu (a docs page demoing one), beside the palette its header opens.
const DEMO = palette('<div cmdk-item data-value="Components Button">Button</div>', '<div cmdk-root><div cmdk-item data-value="Calendar">Calendar</div></div>') + `<script>
window.choose = (value) => history.pushState(null, '', '/docs/' + value.toLowerCase().replace(/ /g, '-'));
</script>`;

// Next.js on a route that is no page (a text file): the router's prefetches are still open when the page loads the file.
const DOCUMENT = palette('<div cmdk-item data-value="llms.txt">llms.txt</div>') + `<script>
window.choose = () => {
	for (let i = 0; i < 4; i++) fetch('/data/hang?' + i);
	setTimeout(() => location.assign('/llms.txt'), 50);
	// Links the closing palette uncovers are prefetched while the next document is still on its way.
	setInterval(() => fetch('/data/hang?late'), 30);
};
</script>`;

// Next.js taking a page back: the router fetches the page again and commits it a while after the address changed.
const RESTORE = palette('<div cmdk-item data-value="a">a</div><div cmdk-item data-value="b">b</div>', '<main>Home</main>') + `<script>
const home = location.pathname;
addEventListener('popstate', async () => {
	if (location.pathname !== home) return;
	await fetch('/data/redirect').then((r) => r.text());
	history.replaceState(null, '', home);
});
window.choose = (value) => {
	document.querySelector('[role=dialog]').remove();
	history.pushState(null, '', '/docs/' + value);
};
</script>`;

// A Radix Select lines its chosen item up with the trigger: an item can sit where the page cannot be scrolled to.
const OFFSCREEN = palette('<div cmdk-item data-value="US Dollar" tabindex="-1" style="position:fixed;top:-60px">US Dollar</div><div cmdk-item data-value="Euro">Euro</div>') + `<script>
window.choose = (value) => history.pushState(null, '', '/currency/' + value.split(' ')[0].toLowerCase());
document.addEventListener('keydown', (e) => e.key === 'Enter' && document.activeElement?.hasAttribute('cmdk-item') && window.choose(document.activeElement.dataset.value));
</script>`;

// A router whose next page's code is not loaded yet (Next.js going from the home page to a docs page): it loads the chunk, then moves.
const CHUNK = palette('<div cmdk-item data-value="Docs">Docs</div>') + `<script>
window.choose = () => {
	const script = document.createElement('script');
	script.src = '/chunk.js';
	document.head.append(script);
};
</script>`;

// Next.js's App Router: it asks the server for the next page (an RSC request), then, a while later with nothing pending in
// between (a machine swapping), moves. A redirected route is asked for under its own address.
const IDLE = palette('<div cmdk-item data-value="Typography">Typography</div><div cmdk-item data-value="Button">Button</div>') + `<script>
window.choose = async (value) => {
	const to = value === 'Button' ? '/docs/button' : '/docs/components/typography';
	await fetch(to + '?_rsc=1x2y', { headers: { RSC: '1' } });
	setTimeout(() => history.pushState(null, '', to), 1500);
};
</script>`;

// A page that asks for code it never gets (a chunk the server holds): the move it made is still recorded.
const STUCK = palette('<div cmdk-item data-value="Charts">Charts</div>') + `<script>
window.choose = () => {
	const script = document.createElement('script');
	script.src = '/stuck.js';
	document.head.append(script);
	history.pushState(null, '', '/charts');
};
</script>`;

// An option that something always lies over: its click can never land.
const COVERED = palette('<div cmdk-item data-value="Free">Free</div><div cmdk-item data-value="Stuck" style="pointer-events:none">Stuck</div>') + `<script>
window.choose = (value) => history.pushState(null, '', '/docs/' + value.toLowerCase());
</script>`;

const PAGES: Record<string, string> = { '/stuck': STUCK, '/idle': IDLE, '/chunk': CHUNK, '/offscreen': OFFSCREEN, '/restore': RESTORE, '/document': DOCUMENT, '/redirect': REDIRECT, '/unfetched': UNFETCHED, '/late': LATE, '/demo': DEMO, '/covered': COVERED };

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		if (request.url === '/data/redirect') return void setTimeout(() => res.writeHead(200).end('{}'), 800);
		if (request.url!.startsWith('/docs/components/typography')) return void res.writeHead(308, { location: '/docs/typeset' }).end();
		if (request.url!.startsWith('/data/hang')) return void setTimeout(() => res.writeHead(200).end('{}'), 30_000);
		if (request.url === '/llms.txt') return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/plain' }).end('# docs'), 300);
		if (request.url === '/stuck.js') return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/javascript' }).end(''), 30_000);
		if (request.url === '/chunk.js') return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/javascript' }).end("history.pushState(null, '', '/docs/chunk');"), 900);
		if (request.url === '/data/slow') return void setTimeout(() => res.writeHead(200).end('{}'), 700);
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGES[request.url!.split('?')[0]!] ?? '<!doctype html><title>other</title>');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

const reveal = (key: string, html: string): Reveal => ({ key, path: [0], sig: 'button||Search', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: `<div role="dialog">${html}</div>` }] });

const recorded = async (route: string, r: Reveal) => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-settled-'));
	try {
		return await captureChoices(browser, origin, route, r, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

test('an option whose route the server redirects is recorded going where the redirect lands', async () => {
	assert.deepEqual(await recorded('/redirect', reveal('redirect', '<div cmdk-item="" data-value="Typography">Typography</div>')), { Typography: { href: '/docs/typeset' } });
});

test('an option the router sends to an address the server redirects is recorded going where the redirect lands, as on a page that prefetched it', async () => {
	assert.deepEqual(await recorded('/unfetched', reveal('unfetched', '<div cmdk-item="" data-value="Typography">Typography</div>')), { Typography: { href: '/docs/typeset#top' } });
});

test("an option is recorded going where the router moves once its render commits, after its data answered", async () => {
	assert.deepEqual(await recorded('/late', reveal('late', '<div cmdk-item="" data-value="Late">Late</div>')), { Late: { href: '/docs/late' } });
});

test("only the options the trigger opened are chosen, never the page's own command menu items", async () => {
	assert.deepEqual(await recorded('/demo', reveal('demo', '<div cmdk-item="" data-value="Components Button">Button</div>')), { 'Components Button': { href: '/docs/components-button' } });
});

test("an option that loads another document is recorded going there, though the page it left had requests open", async () => {
	assert.deepEqual(await recorded('/document', reveal('document', '<div cmdk-item="" data-value="llms.txt">llms.txt</div>')), { 'llms.txt': { href: '/llms.txt' } });
});

test("the next option is chosen once a page taken back has finished coming back, so its router's late commit is not read as the choice", async () => {
	assert.deepEqual(await recorded('/restore', reveal('restore', '<div cmdk-item="" data-value="a">a</div>')), { a: { href: '/docs/a' }, b: { href: '/docs/b' } });
});

test('an option the page cannot be scrolled to is chosen from the keyboard', async () => {
	assert.deepEqual(await recorded('/offscreen', reveal('offscreen', '<div cmdk-item="" data-value="Euro">Euro</div>')), { 'US Dollar': { href: '/currency/us' }, Euro: { href: '/currency/euro' } });
});

test("an option is recorded going where the router moves once it has loaded the next page's code", async () => {
	assert.deepEqual(await recorded('/chunk', reveal('chunk', '<div cmdk-item="" data-value="Docs">Docs</div>')), { Docs: { href: '/docs/chunk' } });
});

test("an option is recorded going where Next.js's router asked the server for, however long the router waits before it moves", async () => {
	assert.deepEqual(await recorded('/idle', reveal('idle', '<div cmdk-item="" data-value="Button">Button</div>')), { Typography: { href: '/docs/typeset' }, Button: { href: '/docs/button' } });
});

test('an option is recorded going where it moved the page, though the code it then asked for never came', async () => {
	assert.deepEqual(await recorded('/stuck', reveal('stuck', '<div cmdk-item="" data-value="Charts">Charts</div>')), { Charts: { href: '/charts' } });
});

test('a control with an option that cannot be chosen is refused, and nothing is written for it', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-settled-'));
	try {
		await assert.rejects(captureChoices(browser, origin, '/covered', reveal('covered', '<div cmdk-item="" data-value="Free">Free</div>'), dir), /could not choose Stuck/);
		assert.deepEqual(await readdir(dir).catch(() => []), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
