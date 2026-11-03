#!/usr/bin/env node
// Gate (c) of the original's dataset (design §6): on a same-site check, the stored original must find what a live one finds.
//   node scripts/original-gate.ts compare --live <report.json>... --live-again <report.json>... --stored <report.json>... [--out <file>]
// Each flag takes one or more shard reports of one run. A finding is its route, check, expected and actual (times masked).
// Live against live again is the noise; stored against each live run should differ by no more than that.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const [command, ...args] = process.argv.slice(2);
if (command !== 'compare') {
	process.stderr.write('usage: original-gate.ts compare --live <report.json>... --live-again <report.json>... --stored <report.json>... [--out <file>]\n');
	process.exit(2);
}
const { values } = parseArgs({ args, options: { live: { type: 'string', multiple: true }, 'live-again': { type: 'string', multiple: true }, stored: { type: 'string', multiple: true }, out: { type: 'string' } } });

interface Finding { readonly route: string; readonly check: string; readonly expected: string; readonly actual: string; readonly accepted?: unknown }
interface RouteLike { readonly route: string; readonly ok: boolean; readonly infrastructure?: { readonly cause: string }; readonly failures: readonly Finding[] }

const timeless = (text: string) => text.replace(/\d+(\.\d+)? ?(ms|s)\b/g, '# $2').replace(/p = [\d.]+/g, 'p = #');
function run(files: readonly string[] | undefined) {
	if (!files?.length) throw new Error('compare needs --live, --live-again and --stored reports');
	const routes = files.flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as { routes: RouteLike[] }).routes);
	const findings = new Set(routes.flatMap((r) => (r.infrastructure ? [] : r.failures.filter((f) => !f.accepted).map((f) => `${f.route} | ${f.check} | ${timeless(f.expected)} | ${timeless(f.actual)}`))));
	return { routes, findings, red: new Set(routes.filter((r) => !r.ok && !r.infrastructure).map((r) => r.route)), notChecked: new Set(routes.filter((r) => r.infrastructure).map((r) => `${r.route} (${r.infrastructure!.cause})`)) };
}
const only = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();

const live = run(values.live), again = run(values['live-again']), stored = run(values.stored);
const noise = { liveOnly: only(live.findings, again.findings), againOnly: only(again.findings, live.findings) };
const vsLive = { storedOnly: only(stored.findings, live.findings), liveOnly: only(live.findings, stored.findings) };
const vsAgain = { storedOnly: only(stored.findings, again.findings), againOnly: only(again.findings, stored.findings) };
const size = (d: Record<string, string[]>) => Object.values(d).reduce((n, x) => n + x.length, 0);
const result = {
	routes: live.routes.length,
	red: { live: live.red.size, liveAgain: again.red.size, stored: stored.red.size },
	findings: { live: live.findings.size, liveAgain: again.findings.size, stored: stored.findings.size },
	notChecked: { live: [...live.notChecked], liveAgain: [...again.notChecked], stored: [...stored.notChecked] },
	differing: { liveVsLiveAgain: size(noise), storedVsLive: size(vsLive), storedVsLiveAgain: size(vsAgain) },
	// Stored passes when it differs from each live run by no more than the two live runs differ, and checks as many routes.
	pass: size(vsLive) <= size(noise) && size(vsAgain) <= size(noise) && stored.notChecked.size <= Math.max(live.notChecked.size, again.notChecked.size),
	noise,
	vsLive,
	vsAgain,
};
const text = `${JSON.stringify(result, null, '\t')}\n`;
if (values.out) writeFileSync(values.out, text);
process.stdout.write(`gate (c): ${result.routes} routes; red live ${result.red.live}, live again ${result.red.liveAgain}, stored ${result.red.stored}; findings differing live/live again ${result.differing.liveVsLiveAgain}, stored/live ${result.differing.storedVsLive}, stored/live again ${result.differing.storedVsLiveAgain}: ${result.pass ? 'within the noise' : 'beyond the noise'}\n`);
