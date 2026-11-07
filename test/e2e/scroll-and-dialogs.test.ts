import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { runCheck } from '../../src/check/run.ts';

function serve(html: string): Promise<{ server: Server; origin: string }> {
	return new Promise((done) => {
		const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
		server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
	});
}

const VIEWPORTS = [
	{ name: 'desktop', width: 1280, height: 800, isMobile: false },
	{ name: 'mobile', width: 390, height: 844, isMobile: true },
];

async function check(oldHtml: string, newHtml: string, viewports = VIEWPORTS) {
	const [old, next] = await Promise.all([serve(oldHtml), serve(newHtml)]);
	const browser = await chromium.launch();
	try {
		return (await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], viewports, browser, motion: {}, journeys: { maxJourneys: 4 } })).routes[0]!;
	} finally {
		await browser.close();
		old.server.close();
		next.server.close();
	}
}

const lines = (failures: readonly { check: string; viewport?: string; expected: string; actual: string }[]) => failures.map((f) => `${f.check} (${f.viewport}): ${f.expected} / ${f.actual}`).join('\n');

// Cards fade and slide in as they enter the screen and back out as they leave; the port's observer only ever adds the class.
const reveal = (exit: boolean) => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Stories</title><style>body { margin: 0; font: 16px sans-serif } section { height: 700px; display: flex; align-items: center; justify-content: center } .card { width: 300px; height: 200px; background: #8ad; opacity: 0; transform: translateY(40px); transition: opacity 300ms, transform 300ms } .card.in { opacity: 1; transform: none }</style></head><body><main><h1>Stories</h1>${Array.from({ length: 5 }, (_, i) => `<section><div class="card">Story ${i + 1}</div></section>`).join('')}</main><script>const io = new IntersectionObserver((entries) => { for (const e of entries) { if (e.isIntersecting) e.target.classList.add("in");${exit ? ' else e.target.classList.remove("in");' : ''} } }); for (const c of document.querySelectorAll(".card")) io.observe(c);</script></body></html>`;

test('an element that fades out as it leaves the screen on the original and stays on the port is red, scrolling back up, at each width', { timeout: 600_000 }, async () => {
	const route = await check(reveal(true), reveal(false));
	const scrolled = route.failures.filter((f) => f.check.startsWith('scroll-linked motion of div.card'));
	assert.ok(scrolled.some((f) => f.viewport === 'desktop'), lines(route.failures));
	assert.ok(scrolled.some((f) => f.viewport === 'mobile'), lines(route.failures));
	assert.ok(scrolled.every((f) => f.dimension === 'motion'));
	assert.match(scrolled[0]!.expected, /^scrolling (down|up) \d+%: x,y,scale,opacity /);
});

test('the same scroll-linked motion on both pages is not red', { timeout: 600_000 }, async () => {
	const route = await check(reveal(true), reveal(true), VIEWPORTS.slice(0, 1));
	assert.deepEqual(route.failures.filter((f) => f.check.startsWith('scroll-linked motion')), []);
});

// A dialog that fades and grows in over 200 ms and out over 150 ms, a box with a 16 px margin on a phone; the port's appears and goes at once and fills the phone's width.
const dialog = (port: boolean) => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Plans</title><style>body { margin: 0; font: 16px sans-serif } #d { position: fixed; left: 50%; top: 50%; width: ${port ? '100vw' : 'min(480px, calc(100vw - 32px))'}; height: 240px; translate: -50% -50%; background: #fff; border: 1px solid #333; opacity: 0; scale: 0.9; visibility: hidden; ${port ? '' : 'transition: opacity 200ms, scale 200ms, visibility 0s 200ms'} } #d.open { opacity: 1; scale: 1; visibility: visible; ${port ? '' : 'transition: opacity 200ms, scale 200ms'} }</style></head><body><main><h1>Plans</h1><button id="b">Compare plans</button></main><div id="d" role="dialog" aria-label="Compare" aria-hidden="true"><p>Basic or Pro</p></div><script>const d = document.getElementById("d"); document.getElementById("b").addEventListener("click", () => { d.classList.add("open"); d.removeAttribute("aria-hidden"); }); addEventListener("keydown", (e) => { if (e.key === "Escape") { d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); } });</script></body></html>`;

test('a dialog that opens and closes at once where the original animates it, and fills the phone where the original keeps a margin, is red', { timeout: 600_000 }, async () => {
	const route = await check(dialog(false), dialog(true));
	const found = route.failures.filter((f) => /: the dialog, /.test(f.check));
	// The box with its 1 px border: 358 + 2 wide on the original's phone, 390 + 2 on the port's.
	assert.ok(found.some((f) => f.viewport === 'mobile' && f.check.endsWith('the dialog, box once open') && /^360x242 /.test(f.expected) && /^392x242 /.test(f.actual)), lines(route.failures));
	assert.ok(found.some((f) => f.check.endsWith('the dialog, opening') && f.actual === 'at once'), lines(route.failures));
	assert.ok(found.some((f) => f.check.endsWith('the dialog, closing') && f.actual === 'at once'), lines(route.failures));
});
