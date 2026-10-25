import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { captureCarousels } from '../src/convert/toggles.ts';

// Three autoplaying carousels as Embla Autoplay drives them: one its page stops on mouse enter (shadcn's demo:
// onMouseEnter={plugin.stop}, onMouseLeave={plugin.reset}, a reset that does nothing once stopped), one that pauses
// and plays again on leave (stopOnMouseEnter with stopOnInteraction false), one the pointer does not stop.
const carousel = (hover: 'stop' | 'pause' | 'none') => `<div data-slot="carousel" data-hover="${hover}" style="width:300px;height:120px;margin:20px"><div data-slot="carousel-content" style="overflow:hidden"><div style="display:flex;transform:translate3d(0px, 0px, 0px)">${'<div style="flex:0 0 100%;height:100px">x</div>'.repeat(5)}</div></div><button data-slot="carousel-next">Next</button></div>`;
const PAGE = `<!doctype html><body>${carousel('stop')}${carousel('pause')}${carousel('none')}<script>
for (const root of document.querySelectorAll('[data-slot="carousel"]')) {
	const track = root.querySelector('[data-slot="carousel-content"] > div');
	let i = 0, timer = 0, active = false;
	const start = () => { clearTimeout(timer); timer = setTimeout(() => { i = (i + 1) % 5; track.style.transform = 'translate3d(' + (-300 * i) + 'px, 0px, 0px)'; start(); }, 400); active = true; };
	const stop = () => { clearTimeout(timer); active = false; };
	if (root.dataset.hover === 'stop') { root.addEventListener('mouseenter', stop); root.addEventListener('mouseleave', () => active && start()); }
	if (root.dataset.hover === 'pause') { root.addEventListener('mouseenter', stop); root.addEventListener('mouseleave', start); }
	start();
}
</script></body>`;

test('an autoplaying carousel is measured for what the pointer over it does: stops it, pauses it, or nothing', async () => {
	const server = createServer((_req, res) => void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = await mkdtemp(join(tmpdir(), 'mm-carousels-'));
	const browser = await chromium.launch();
	try {
		const { carousels } = await captureCarousels(browser, origin, '/', dir);
		assert.deepEqual(
			carousels.map((c) => [c.autoplay, c.hover]),
			[
				[400, 'stop'],
				[400, 'pause'],
				[400, undefined],
			],
		);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test('an autoplaying carousel captured where Autoplay had taken it is served on its first snap, Previous disabled', async () => {
	const { parseDocument, body, find, attr } = await import('../src/convert/dom.ts');
	const { restCarousel } = await import('../src/convert/toggles.ts');
	const doc = parseDocument(`<body><div data-slot="carousel"><div data-slot="carousel-content"><div style="display:flex;transform:translate3d(-680.51px, 0px, 0px)"><div>1</div></div></div><button data-slot="carousel-previous" data-rac="" data-disabled="true" disabled="">P</button><button data-slot="carousel-next" data-rac="" disabled="" data-disabled="true">N</button></div></body>`);
	const root = find(body(doc), (e) => attr(e, 'data-slot') === 'carousel')!;
	restCarousel(root);
	const track = find(root, (e) => attr(e, 'data-slot') === 'carousel-content')!;
	assert.equal(attr(find(track, (e) => e !== track && e.tagName === 'div')!, 'style'), 'display:flex;transform: translate3d(0px, 0px, 0px)');
	const button = (slot: string) => Object.fromEntries(find(root, (e) => attr(e, 'data-slot') === slot)!.attrs.map((a) => [a.name, a.value]));
	assert.deepEqual(button('carousel-previous'), { 'data-slot': 'carousel-previous', 'data-rac': '', disabled: '', 'data-disabled': 'true' });
	assert.deepEqual(button('carousel-next'), { 'data-slot': 'carousel-next', 'data-rac': '', tabindex: '0' });
});
