// convert's capture of what choosing each option of a long list does (a docs search palette: every option goes to a page):
// the options are chosen on several pages at once, each page under the slots convert's captures share, and every
// option is recorded once, in the list's order, as one page choosing them all would.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureChoices, markChosenHref, optionsShown } from '../src/convert/choices.ts';
import { body, outer, parseDocument, walk } from '../src/convert/dom.ts';
import { limiter, type Limit } from '../src/convert/limit.ts';
import type { Reveal } from '../src/convert/reveal.ts';

const COUNT = 45;
const PAGE = `<!doctype html><html><body><button id="open" aria-expanded="false">Search</button><script>
document.getElementById('open').addEventListener('click', () => {
	const list = document.createElement('div');
	list.setAttribute('cmdk-list', '');
	for (let i = 0; i < ${COUNT}; i++) {
		const item = document.createElement('div');
		item.setAttribute('cmdk-item', '');
		item.setAttribute('data-value', 'doc-' + i);
		item.textContent = 'Doc ' + i;
		item.addEventListener('click', () => location.assign('/docs/' + (${COUNT} - i)));
		list.append(item);
	}
	document.body.append(list);
});
</script></body></html>`;

// A client router: choosing an option fetches the next page's data (slow to answer here) and only then changes the address.
const ROUTER = `<!doctype html><html><body><button id="open" aria-expanded="false">Search</button><script>
document.getElementById('open').addEventListener('click', () => {
	const item = document.createElement('div');
	item.setAttribute('cmdk-item', '');
	item.setAttribute('data-value', 'slow');
	item.textContent = 'Slow';
	item.addEventListener('click', async () => {
		await fetch('/data/slow').then((r) => r.text());
		history.pushState(null, '', '/docs/slow');
	});
	document.body.append(item);
});
</script></body></html>`;

// Next.js's router.push to the address the page is already at replaces the history entry: the address stays the same.
const HOME = `<!doctype html><html><body><button id="open" aria-expanded="false">Search</button><script>
document.getElementById('open').addEventListener('click', () => {
	for (const [value, to] of [['Home', '/home'], ['Docs', '/docs']]) {
		const item = document.createElement('div');
		item.setAttribute('cmdk-item', '');
		item.setAttribute('data-value', value);
		item.textContent = value;
		item.addEventListener('click', () => (to === location.pathname ? history.replaceState(null, '', to) : history.pushState(null, '', to)));
		document.body.append(item);
	}
	const plain = document.createElement('div');
	plain.setAttribute('cmdk-item', '');
	plain.setAttribute('data-value', 'Nothing');
	plain.textContent = 'Nothing';
	document.body.append(plain);
});
</script></body></html>`;

// A menu that closes on each choice: one item marks the page (state a fresh load would not have), one copies, one does nothing.
const MENU = `<!doctype html><html><body><button id="open" aria-expanded="false">Actions</button><script>
document.getElementById('open').addEventListener('click', () => {
	const menu = document.createElement('div');
	menu.setAttribute('role', 'menu');
	for (const name of ['Copy', 'Mark', 'Plain', 'Copy again']) {
		const item = document.createElement('div');
		item.setAttribute('role', 'menuitem');
		item.textContent = name;
		item.addEventListener('click', () => {
			if (name.startsWith('Copy')) navigator.clipboard.writeText(name + ' text');
			if (name === 'Mark') document.body.dataset.marked = '';
			menu.remove();
		});
		menu.append(item);
	}
	document.body.append(menu);
});
</script></body></html>`;

// A client router: each option moves to another page in the same document, and going back shows the first page again.
const CLIENT = `<!doctype html><html><body><button id="open" aria-expanded="false">Search</button><main>Home</main><script>
const main = document.querySelector('main');
addEventListener('popstate', () => (main.textContent = location.pathname === '/client' ? 'Home' : location.pathname));
document.getElementById('open').addEventListener('click', () => {
	const list = document.createElement('div');
	list.setAttribute('cmdk-list', '');
	for (const to of ['a', 'b', 'c']) {
		const item = document.createElement('div');
		item.setAttribute('cmdk-item', '');
		item.setAttribute('data-value', to);
		item.textContent = to;
		item.addEventListener('click', () => {
			list.remove();
			history.pushState(null, '', '/docs/' + to);
			main.textContent = '/docs/' + to;
		});
		list.append(item);
	}
	document.body.append(list);
});
</script></body></html>`;

let browser: Browser;
const loads = new Map<string, number>();
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((request, res) => {
		if (request.url === '/data/slow') return void setTimeout(() => res.writeHead(200).end('{}'), 1500);
		loads.set(request.url!, (loads.get(request.url!) ?? 0) + 1);
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(request.url === '/router' ? ROUTER : request.url === '/home' ? HOME : request.url === '/menu' ? MENU : request.url === '/client' ? CLIENT : PAGE);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

test('captureChoices chooses a long list of options on several pages at once, under the given limit, and records each once in order', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-pages-'));
	try {
		const slots = limiter(3);
		let running = 0;
		let peak = 0;
		const limit: Limit = (task) =>
			slots(async () => {
				peak = Math.max(peak, ++running);
				try {
					return await task();
				} finally {
					running--;
				}
			});
		const reveal: Reveal = { key: 'palette', path: [0], sig: 'button||Search', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: '<div cmdk-list=""><div cmdk-item="" data-value="doc-0">Doc 0</div></div>' }] };
		const found = await captureChoices(browser, origin, '/', reveal, dir, () => {}, limit);
		assert.deepEqual(Object.keys(found), Array.from({ length: COUNT }, (_, i) => `doc-${i}`));
		assert.deepEqual(Object.values(found), Array.from({ length: COUNT }, (_, i) => ({ href: `/docs/${COUNT - i}` })));
		assert.equal(peak, 3);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('captureChoices records where an option went when the page fetched it for longer than the first look waits', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-router-'));
	try {
		const reveal: Reveal = { key: 'router', path: [0], sig: 'button||Search', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: '<div cmdk-item="" data-value="slow">Slow</div>' }] };
		assert.deepEqual(await captureChoices(browser, origin, '/router', reveal, dir), { slow: { href: '/docs/slow' } });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('captureChoices records an option that sends the page to the address it is already at', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-home-'));
	try {
		const reveal: Reveal = { key: 'home', path: [0], sig: 'button||Search', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: '<div cmdk-item="" data-value="Home">Home</div>' }] };
		assert.deepEqual(await captureChoices(browser, origin, '/home', reveal, dir), { Home: { href: '/home' }, Docs: { href: '/docs' }, Nothing: {} });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("a palette listing other options on another page is chosen again there, and each cmdk item names where it went on its own page", () => {
	const palette = (items: string) => ({ key: 'palette', path: [0], action: 'click' as const, viewport: 'desktop', added: [{ into: 'body' as const, before: -1, html: `<div cmdk-list="">${items}</div>` }] });
	const radix = palette('<div cmdk-item="" data-value="Components Menubar" id="r1">Menubar</div><div cmdk-item="" data-value="Components Button" id="r2">Button</div>');
	const aria = palette('<div cmdk-item="" data-value="Components Button" id="a1">Button</div>');
	assert.notEqual(optionsShown(radix), optionsShown(aria));
	assert.equal(optionsShown(aria), optionsShown(palette('<div cmdk-item="" data-value="Components Button" id="other-id">Button</div>')), 'the same options under other generated ids');
	const doc = parseDocument(`<body>${radix.added[0]!.html}<div role="menuitem">Copy</div></body>`);
	for (const el of walk(body(doc))) markChosenHref(el, { 'Components Button': { href: '/docs/components/radix/button' }, Copy: { href: '/x' } });
	assert.equal(outer(body(doc)), '<body><div cmdk-list=""><div cmdk-item="" data-value="Components Menubar" id="r1">Menubar</div><div cmdk-item="" data-value="Components Button" id="r2" data-mm-href="/docs/components/radix/button">Button</div></div><div role="menuitem">Copy</div></body>');
});

test('captureChoices opens a menu again on the same page while a choice left it as loaded, and loads it again once one did not', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-menu-'));
	try {
		const reveal: Reveal = { key: 'menu', path: [0], sig: 'button||Actions', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: '<div role="menu"><div role="menuitem">Copy</div></div>' }] };
		loads.delete('/menu');
		assert.deepEqual(await captureChoices(browser, origin, '/menu', reveal, dir), { Copy: { copied: 'Copy text' }, Mark: {}, Plain: {}, 'Copy again': { copied: 'Copy again text' } });
		assert.equal(loads.get('/menu'), 2, 'the first load, and one more after the choice that marked the page');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("captureChoices takes back a client router's move and chooses the next option on the same page", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'choices-client-'));
	try {
		const reveal: Reveal = { key: 'client', path: [0], sig: 'button||Search', nth: 0, action: 'click', viewport: 'desktop', added: [{ into: 'body', before: -1, html: '<div cmdk-list=""><div cmdk-item="" data-value="a">a</div></div>' }] };
		loads.delete('/client');
		assert.deepEqual(await captureChoices(browser, origin, '/client', reveal, dir), { a: { href: '/docs/a' }, b: { href: '/docs/b' }, c: { href: '/docs/c' } });
		assert.equal(loads.get('/client'), 1);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
