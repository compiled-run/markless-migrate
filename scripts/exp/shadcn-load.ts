// Scratch (owner-approved measurement, 2026-10-31): cold loads with the first click, original against port, interleaved.
// node scripts/exp/shadcn-load.ts <out.json> <runs> <old origin> <new origin> <routes,> <browsers,> <profiles,>
import { writeFileSync } from 'node:fs';
import { networkRun } from '../../src/check/slow-network.ts';
import { NETWORK_PROFILES, type NetworkProfile } from '../../src/check/throttle.ts';

const [, , out, runsArg, oldOrigin, newOrigin, routesArg, browsersArg, profilesArg] = process.argv as string[];
const KBIT = 1000 / 8;
const profiles: Record<string, NetworkProfile> = {
	...NETWORK_PROFILES,
	'fast-4g': { name: 'fast-4g', label: 'Fast 4G (9 Mbit/s, 60 ms RTT)', downBytesPerSecond: 9000 * KBIT, upBytesPerSecond: 1500 * KBIT, rttMs: 60, source: 'Chrome DevTools Fast 4G' },
};
const rows: Record<string, unknown>[] = [];
for (const route of routesArg!.split(','))
	for (const profile of profilesArg!.split(','))
		for (const browser of browsersArg!.split(','))
			for (let run = 0; run < Number(runsArg); run++)
				for (const [side, origin] of [['old', oldOrigin], ['new', newOrigin]] as const) {
					const r = await networkRun(`${origin}${route}`, profiles[profile]!, browser as never, { afterAnswerMs: 2000, timeoutMs: 120_000, answerBy: 60_000 });
					const row = { route, profile, browser, side, run, fcp: r.fcp, firstFrame: r.firstFrame, lcp: r.lcp, firstClick: r.firstClick, answered: r.answered, jsDownloadedByAnswer: r.jsDownloadedByAnswer, jsExecutedByAnswer: r.jsExecutedByAnswer, bytesByAnswer: r.bytesByAnswer, noControl: r.noControl, error: r.error };
					rows.push(row);
					console.log(JSON.stringify(row));
					writeFileSync(out!, JSON.stringify(rows, null, 1));
				}
