import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv, openPage } from '../src/check/browser.ts';
import { settleState, trackRequests } from '../src/check/states.ts';
import { VIEWPORTS } from '../src/check/types.ts';

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser?.close());

// Like a canvas library that refetches its asset when the viewport crosses a breakpoint and redraws when it arrives.
const PAGE = `<!doctype html><body><div id="box" style="width:10px;height:10px"></div><script>
addEventListener('resize', async () => {
	const size = await (await fetch('/size?w=' + innerWidth)).text();
	document.getElementById('box').style.width = size + 'px';
});
</script></body>`;

test('a forced state is sampled after the requests it started have finished', async () => {
	const env = defaultEnv('http://127.0.0.1:1');
	const { context, page } = await openPage(browser, env, VIEWPORTS[0]!);
	try {
		await page.route('http://127.0.0.1:1/', (route) => route.fulfill({ body: PAGE, contentType: 'text/html' }));
		await page.route('http://127.0.0.1:1/size*', async (route) => {
			await new Promise((done) => setTimeout(done, 300));
			await route.fulfill({ body: '42', contentType: 'text/plain' });
		});
		const inflight = trackRequests(page);
		await page.goto('http://127.0.0.1:1/');
		await page.setViewportSize({ width: 700, height: 800 });
		await settleState(page, inflight);
		assert.equal(await page.evaluate(() => document.getElementById('box')!.style.width), '42px');
	} finally {
		await context.close();
	}
});

test('a forced state is sampled at the end of the transition it starts, not at its first frame', async () => {
	const env = defaultEnv('http://127.0.0.1:1');
	const { context, page } = await openPage(browser, env, VIEWPORTS[0]!);
	try {
		const html = '<!doctype html><style>button{background-color:rgb(0,0,255);transition:background-color 2s ease}button:hover{background-color:rgb(255,0,0)}</style><button>go</button>';
		await page.route('http://127.0.0.1:1/', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
		const inflight = trackRequests(page);
		await page.goto('http://127.0.0.1:1/');
		const session = await context.newCDPSession(page);
		await session.send('DOM.enable');
		await session.send('CSS.enable');
		const { root } = await session.send('DOM.getDocument', { depth: -1 });
		const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'button' });
		await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
		await settleState(page, inflight);
		assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('button')!).backgroundColor), 'rgb(255, 0, 0)');
	} finally {
		await context.close();
	}
});
