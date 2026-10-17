// Times clicks on the nav links of a page and reports any that stall: node deploy/htmx-org/nav-click.mjs <url> [runs]
import { chromium } from 'playwright';
const b = await chromium.launch();
for (let run = 0; run < Number(process.argv[3] ?? 3); run++) for (const name of ['docs', 'reference', 'examples', 'talk', 'essays']) {
	const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
	const log = [];
	p.on('request', (r) => r.isNavigationRequest() && log.push(`nav ${r.url().replace(/^https?:\/\/[^/]+/, '')}`));
	p.on('requestfailed', (r) => log.push(`failed ${r.url().replace(/^https?:\/\/[^/]+/, '')} ${r.failure()?.errorText}`));
	await p.goto(process.argv[2], { waitUntil: 'load' });
	const t = Date.now();
	try { await p.getByRole('link', { name, exact: true }).first().click({ timeout: 3000 }); console.log(run, name, 'ok', Date.now() - t, 'ms', p.url().replace(/^https?:\/\/[^/]+/, '')); }
	catch (e) { console.log(run, name, 'STALLED', Date.now() - t, 'ms', e.message.split('\n').filter((l) => /element|waiting|navigat|intercept/i.test(l)).slice(-3).join(' | '), log.join(', ')); }
	await p.close();
}
await b.close();
