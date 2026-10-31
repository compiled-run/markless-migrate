// Prints the settings the CI workflows and `dev --verdict` share: `check [concurrency] [timeout]` prints a shard's check flags, `probe <engine>` the probe's budgets as shell exports.
import { PROBE_ENGINES, shardCheckArgs, type ProbeEngine } from '../src/check/ci-settings.ts';

const [what, a, b] = process.argv.slice(2);
if (what === 'check') process.stdout.write(`${shardCheckArgs(a, b).join(' ')}\n`);
else if (what === 'probe' && a && a in PROBE_ENGINES) process.stdout.write(`${Object.entries(PROBE_ENGINES[a as ProbeEngine]).map(([k, v]) => `export ${k}=${v}`).join('\n')}\n`);
else {
	process.stderr.write('usage: ci-flags.ts check [concurrency] [timeout] | probe <chromium|webkit>\n');
	process.exit(2);
}
