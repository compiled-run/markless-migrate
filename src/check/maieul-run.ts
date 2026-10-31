// Ad hoc driver for the Maieul comparison: interleaved cold loads over the shaped link, HTTPS/HTTP-2 via Caddy.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { NETWORK_PROFILES } from './throttle.ts';
import { measureSlowNetwork, networkRun, type NetworkBrowser } from './maieul-net.ts';

const KBIT = 1024 / 8;
(NETWORK_PROFILES as Record<string, unknown>).fast = { name: 'fast', label: 'Fast (30 Mbit/s down, 15 up, 20 ms RTT)', downBytesPerSecond: 30_000 * KBIT, upBytesPerSecond: 15_000 * KBIT, rttMs: 20, source: 'chosen for this comparison' };

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d; };
const urls = arg('urls')!.split(',');
const profiles = arg('profiles', 'regular-3g')!.split(',');
const browsers = arg('browsers', 'firefox')!.split(',') as NetworkBrowser[];
const runs = Number(arg('runs', '7'));
const control = arg('control', '[data-accordion] button.collapsible-trigger[aria-expanded="false"]')!;
const out = arg('out')!;
const mode = arg('mode', 'matrix');
const hosts: Record<string, string> = {};
for (const u of urls) hosts[new URL(u).hostname] = '127.0.0.1:8443';
mkdirSync(dirname(out), { recursive: true });

if (mode === 'profile') {
	for (const profile of profiles)
		for (const url of urls) {
			const name = new URL(url).hostname.replace('.test', '');
			const path = `${dirname(out)}/firefox-profile-${name}-${profile}.json`;
			const run = await networkRun(url, NETWORK_PROFILES[profile]!, 'firefox', { control, hosts, profilePath: path, afterAnswerMs: 3000 });
			appendFileSync(out, JSON.stringify({ url, profile, browser: 'firefox', profilePath: path, run }) + '\n');
			console.log(profile, name, 'answered', run.answered, run.error ?? '');
		}
} else {
	const sides = await measureSlowNetwork(urls, {
		profiles, browsers, runs, control, hosts, afterAnswerMs: 5000, capture: true,
		onRun: (label, run) => {
			const { capture, ...rest } = run;
			const executedByFile = capture ? undefined : undefined;
			appendFileSync(out, JSON.stringify({ label, run: rest, ...(executedByFile ? { executedByFile } : {}) }) + '\n');
			console.log(label, 'paint', run.firstFrame, 'answered', run.answered, 'reqs', run.requests.length, run.error ?? '');
		},
	});
	writeFileSync(out.replace(/\.jsonl$/, '-summary.json'), JSON.stringify(sides.map((s) => ({ url: s.url, cells: s.cells.map(({ runs: _, medianRun: __, ...c }) => c) })), null, 1));
}
