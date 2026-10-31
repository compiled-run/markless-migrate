// The state probe's false-red control: each route's widget probes run with the same site on both sides, so every state
// probe finding is a false red. Prints per route its findings, the time the state reads took, and the noise spread.
//   node scripts/state-control.ts <origin> <route>... [--repeat n] [--json out.json]
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { checkProbes } from '../src/check/probes.ts';
import { stateSpread } from '../src/check/state-probe.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { repeat: { type: 'string' }, json: { type: 'string' } } });
const [origin, ...routes] = positionals;
if (!origin || !routes.length) throw new Error('usage: state-control.ts <origin> <route>... [--repeat n] [--json out.json]');
const repeat = Number(values.repeat ?? 1);
const browser = await chromium.launch();
const rows: { route: string; run: number; red: boolean; findings: string[]; others: string[]; stateMs: number; probeMs: number; spread: Record<string, number> }[] = [];
try {
	for (const route of routes) {
		for (let run = 0; run < repeat; run++) {
			const spread: Record<string, number> = {};
			let reads = 0;
			const env = defaultEnv(origin);
			const result = await checkProbes(browser, { old: env, new: defaultEnv(origin) }, route, VIEWPORTS[0]!, undefined, {
				concurrency: 1,
				onStates: (a, b) => {
					reads += a.length + b.length;
					for (const [k, v] of Object.entries(stateSpread(a, b))) spread[k] = Math.max(spread[k] ?? 0, v);
				},
			});
			const findings = result.failures.filter((f) => f.check.includes('(state probe:')).map((f) => `${f.dimension}: ${f.check} | ${f.expected} | ${f.actual}`);
			const others = result.failures.filter((f) => !f.check.includes('(state probe:') && !f.check.startsWith('not exercised')).map((f) => `${f.dimension}: ${f.check} | ${f.expected} | ${f.actual}`);
			rows.push({ route, run, red: findings.length > 0, findings, others, stateMs: result.stateMs, probeMs: result.ms, spread });
			console.log(`${findings.length ? 'RED  ' : 'green'} ${route} #${run + 1} state ${result.stateMs} ms in ${reads} reads of ${result.ms} ms; other probe findings ${others.length} ${JSON.stringify(spread)}`);
			for (const f of [...findings, ...others.map((o) => `(other probe) ${o}`)]) console.log(`  ${f.slice(0, 400)}`);
		}
	}
} finally {
	await browser.close();
}
const red = rows.filter((r) => r.red).length;
console.log(`false reds: ${red} of ${rows.length} route runs (${((red / rows.length) * 100).toFixed(1)}%); the other probes: ${rows.filter((r) => r.others.length).length}`);
if (values.json) await writeFile(values.json, JSON.stringify(rows, null, '\t'));
