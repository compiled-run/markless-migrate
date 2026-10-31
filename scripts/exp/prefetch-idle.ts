// Scratch: first click to a linked page with the router's idle prefetch on and off, cold loads over the throttle proxy.
// node scripts/exp/prefetch-idle.ts <out.json> <runs> <onPort> <offPort> <from> <linkSelector> <browsers,> <profiles,> [<h1 of the destination>]
import { writeFileSync } from 'node:fs';
import { firefox, chromium, webkit } from 'playwright';
import { startThrottle } from '../../src/check/throttle.ts';
import { NETWORK_PROFILES } from '../../src/check/throttle.ts';

const [, , out, runsArg, onPort, offPort, from, link, browsersArg, profilesArg, expectH1 = 'Features'] = process.argv as string[];
const KBIT = 1000 / 8;
const extra = {
	'fast-4g': { name: 'fast-4g', label: 'Fast 4G (9 Mbit/s, 60 ms RTT)', downBytesPerSecond: 9000 * KBIT, upBytesPerSecond: 1500 * KBIT, rttMs: 60 },
	cable: { name: 'cable', label: 'Cable (25 Mbit/s, 28 ms RTT)', downBytesPerSecond: 25000 * KBIT, upBytesPerSecond: 5000 * KBIT, rttMs: 28 },
} as Record<string, unknown>;
const rows: Record<string, unknown>[] = [];
for (const profileName of profilesArg!.split(','))
	for (const browserName of browsersArg!.split(','))
		for (let run = 0; run < Number(runsArg); run++)
			for (const [side, port] of [['on', onPort], ['off', offPort]] as const) {
				const profile = (NETWORK_PROFILES as Record<string, unknown>)[profileName] ?? extra[profileName];
				const throttle = await startThrottle(profile as never, { hosts: { [`${side}.test`]: `127.0.0.1:${port}` } });
				const proxy = { server: (throttle as { proxy: string }).proxy, bypass: '' };
				const browser =
					browserName === 'chromium'
						? await chromium.launch({ proxy, args: ['--proxy-bypass-list=<-loopback>', '--disable-quic'] })
						: browserName === 'firefox'
							? await firefox.launch({ proxy, firefoxUserPrefs: { 'network.proxy.allow_hijacking_localhost': true, 'network.http.http3.enable': false } })
							: await webkit.launch({ proxy });
				const page = await (await browser.newContext()).newPage();
				const fragments: string[] = [];
				// Off: the idle tier's fetches, the ones made before the click, never arrive, as with idle prefetch turned off.
				let clicking = false;
				// Both sides go through the same interception, so it costs them alike.
				await page.route('**/_markless/fragment/**', (route) =>
					side === 'off' && !clicking && route.request().headers()['purpose'] === 'prefetch' ? route.abort() : route.continue(),
				);
				page.on('request', (r) => r.url().includes('/_markless/fragment') && fragments.push(new URL(r.url()).pathname));
				const row: Record<string, unknown> = { profile: profileName, browser: browserName, side, run };
				try {
					await page.goto(`http://${side}.test${from}`, { waitUntil: 'load', timeout: 120_000 });
					await page.waitForTimeout(6000);
					row.prefetchedBeforeClick = fragments.length;
					const target = page.locator(link).first();
					const href = await target.getAttribute('href');
					clicking = true;
					const t0 = await page.evaluate(() => performance.now());
					await target.click();
					await page.waitForURL((u) => u.pathname === new URL(href!, 'http://x').pathname, { timeout: 60_000 });
					await page.waitForFunction((text) => [...document.querySelectorAll('h1')].some((h) => h.textContent?.includes(text)), expectH1, { timeout: 60_000 });
					await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
					row.clickToPaintMs = Math.round((await page.evaluate(() => performance.now())) - t0);
					row.fragmentsAfterClick = fragments.length - (row.prefetchedBeforeClick as number);
				} catch (error) {
					row.error = String(error).slice(0, 200);
				}
				await browser.close();
				await (throttle as { close(): Promise<void> }).close();
				rows.push(row);
				console.log(JSON.stringify(row));
				writeFileSync(out!, JSON.stringify(rows, null, 1));
			}
