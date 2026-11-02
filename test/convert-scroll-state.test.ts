import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { capturePage } from '../src/convert/capture.ts';
import { attr, parseDocument, walk, type Element } from '../src/convert/dom.ts';

// A docs page: a table of contents whose scroll spy hands data-active (and an `active` class) from link to link as
// headings pass the top of the view, an image a lazy loader fills in once it is in view, a section a reveal-on-scroll
// script marks once, and client state the page sets at load before anyone scrolls.
const SECTIONS = ['intro', 'usage', 'api', 'rtl'];
const PAGE = (spacer = 900) => `<!doctype html><html><head><style>body{margin:0}section{height:1400px}</style></head><body>
<nav>${SECTIONS.map((id) => `<a href="#${id}" data-active="false" class="toc">${id}</a>`).join('')}<a href="/" class="home">Home</a></nav>
<div style="height:${spacer}px"></div>
${SECTIONS.map((id) => `<section id="${id}"><h2>${id}</h2>${id === 'api' ? '<img data-src="/pic.png" alt="pic" class="lazy" width="10" height="10"><div class="reveal">More</div>' : ''}</section>`).join('')}
<script>
document.querySelector('.home').setAttribute('aria-current', 'page');
document.body.dataset.ready = 'true';
const links = [...document.querySelectorAll('nav a.toc')];
const spy = new IntersectionObserver((entries) => {
	for (const entry of entries) {
		if (!entry.isIntersecting) continue;
		for (const link of links) {
			const on = link.getAttribute('href') === '#' + entry.target.id;
			link.setAttribute('data-active', String(on));
			link.classList.toggle('active', on);
		}
	}
}, { rootMargin: '0% 0% -80% 0%' });
document.querySelectorAll('section').forEach((el) => spy.observe(el));
const lazy = new IntersectionObserver((entries, observer) => {
	for (const entry of entries) {
		if (!entry.isIntersecting) continue;
		const el = entry.target;
		if (el.dataset.src) el.src = el.dataset.src, el.classList.add('loaded');
		else el.classList.add('shown');
		observer.unobserve(el);
	}
});
document.querySelectorAll('.lazy, .reveal').forEach((el) => lazy.observe(el));
</script></body></html>`;

async function capture(page: string): Promise<Element[]> {
	const server = createServer((req, res) => {
		if (req.url === '/') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
		res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.alloc(0));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-scroll-state-'));
	const browser = await chromium.launch();
	try {
		const captured = await capturePage(browser, origin, '/', dir, [{ name: 'desktop', width: 1280, height: 800, isMobile: false }]);
		return [...walk(parseDocument(captured.settled.desktop!))];
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
}

const toc = (els: Element[]) => els.filter((el) => el.tagName === 'a' && (attr(el, 'href') ?? '').startsWith('#')).map((el) => [attr(el, 'href'), attr(el, 'data-active'), attr(el, 'class')]);

test('what a scroll spy hands from element to element during capture is kept as the page had it before capture scrolled; what loaded on the way stays', async () => {
	const els = await capture(PAGE());
	assert.deepEqual(toc(els), SECTIONS.map((id) => [`#${id}`, 'false', 'toc']), 'every table of contents link as served');
	const img = els.find((el) => el.tagName === 'img')!;
	assert.equal(attr(img, 'src'), '/pic.png', 'the lazy image capture scrolled to is loaded');
	assert.equal(attr(img, 'class'), 'lazy loaded');
	assert.equal(attr(els.find((el) => attr(el, 'class')?.startsWith('reveal'))!, 'class'), 'reveal shown', 'a reveal-on-scroll section stays revealed');
	assert.equal(attr(els.find((el) => el.tagName === 'body')!, 'data-ready'), 'true', 'state the page sets at load stays');
	assert.equal(attr(els.find((el) => attr(el, 'class') === 'home')!, 'aria-current'), 'page');
});

test('a scroll spy that marks a link at load, before any scroll, keeps that link marked: every visitor sees it', async () => {
	assert.deepEqual(
		toc(await capture(PAGE(0))),
		SECTIONS.map((id, i) => [`#${id}`, String(i === 0), i === 0 ? 'toc active' : 'toc']),
	);
});
