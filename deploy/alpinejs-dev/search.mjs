// DocSearch on every way in, on a home and a docs page, on Slow 4G with 4x CPU from the moment the button shows:
// node deploy/alpinejs-dev/search.mjs <origin>   (each line must report an open time, one modal, and hits)
import { chromium } from 'playwright';
const origin = process.argv[2];
const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const button = '#docsearch .DocSearch-Button';
const open = async (path, slow) => {
	const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
	const p = await ctx.newPage();
	p.on('pageerror', (e) => console.log('  pageerror', e.message));
	if (slow) {
		const cdp = await ctx.newCDPSession(p);
		await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 });
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	}
	await p.goto(origin + path, { waitUntil: slow ? 'commit' : 'load' });
	await p.waitForSelector(button);
	return { ctx, p };
};
const modals = (p) => p.locator('.DocSearch-Modal').count();
const opened = async (p) => { const t = Date.now(); while (Date.now() - t < 15_000) { if (await modals(p)) return `${Date.now() - t} ms`; await p.waitForTimeout(50); } return 'never'; };
const ways = {
	'Cmd+K as the button shows': (p) => p.keyboard.press('Meta+k'),
	'/ as the button shows': (p) => p.keyboard.press('/'),
	'two clicks as the button shows': async (p) => { await p.click(button); await p.click(button); },
	'click after load': (p) => p.click(button),
};
for (const path of ['/', '/start-here'])
	for (const [way, act] of Object.entries(ways)) {
		const { ctx, p } = await open(path, way !== 'click after load');
		const before = await p.locator('script[src*="@docsearch/js"]').count();
		await act(p);
		const at = await opened(p);
		await p.waitForTimeout(1000);
		await p.keyboard.type('model');
		await p.waitForTimeout(2500);
		console.log(`${path} ${way}: DocSearch loaded before = ${before}, opens in ${at}, modals ${await modals(p)}, hits ${await p.locator('.DocSearch-Hit').count()}`);
		await ctx.close();
	}
await b.close();
