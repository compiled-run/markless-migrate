// Replays the "click link <name>" journey on one origin N times with markless-migrate's own replay: node deploy/htmx-org/replay-nav.ts <origin> <route> <name> [n]
import { chromium } from 'playwright';
import { defaultEnv } from '../../src/check/browser.ts';
import { replay } from '../../src/check/journeys.ts';
import { VIEWPORTS } from '../../src/check/types.ts';
const [origin, route, name, n = '10'] = process.argv.slice(2);
const browser = await chromium.launch();
const journey = { name: `click link "${name}"`, steps: [{ action: 'click' as const, target: { role: 'link', name: name!, nth: 0 } }] };
let stalls = 0;
const parallel = Number(process.env.PARALLEL ?? 1);
for (let i = 0; i < Number(n); i += parallel) {
	await Promise.all(Array.from({ length: parallel }, async (_, k) => {
		const t = Date.now();
		const [result] = await replay(browser, defaultEnv(origin!), route!, VIEWPORTS[0]!, journey);
		const failed = 'error' in (result ?? {}) && (result as { error?: string }).error;
		if (failed) stalls++;
		console.log(i + k, Date.now() - t, 'ms', failed ? `STALL ${String(failed).slice(0, 400)}` : `ok ${(result as { url?: string }).url}`);
	}));
}
console.log('stalls', stalls);
await browser.close();
