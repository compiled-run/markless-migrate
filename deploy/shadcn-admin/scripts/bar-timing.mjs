// When the loading bar fades and resets, in ms after the load event: node bar-timing.mjs <origin> <route>
import { chromium } from 'playwright';
const [origin, route = '/sign-in'] = process.argv.slice(2);
const b = await chromium.launch();
for (let i = 0; i < 3; i++) {
	const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
	await p.addInitScript(() => {
		window.__bar = [];
		let loaded = 0;
		addEventListener('load', () => (loaded = performance.now()));
		new MutationObserver((records) => {
			for (const r of records) if (r.attributeName === 'style' && r.target.parentElement?.style.position === 'fixed') window.__bar.push([Math.round(performance.now() - loaded), r.target.style.opacity, r.target.style.width]);
		}).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
	});
	await p.goto(origin + route, { waitUntil: 'load' });
	await p.waitForTimeout(2500);
	console.log(JSON.stringify(await p.evaluate(() => window.__bar)));
	await p.close();
}
await b.close();
