// Whether a Convert release of the port may go to production: the newest Check workflow run of that release's build must
// have finished with every route it checked green (its check-merged summary), and none not checked.
//   node release-gate.mjs <release tag>   prints the run and its summary line; exits 0 only when it is all green.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'compiled-run/markless-migrate';
const tag = process.argv[2];
if (!tag) {
	console.error('usage: release-gate.mjs <release tag>');
	process.exit(2);
}
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
const build = `https://github.com/${REPO}/releases/download/${tag}/qwikui-markless-output.tar.gz`;
const runs = JSON.parse(gh('run', 'list', '--repo', REPO, '--workflow', 'check.yml', '--limit', '50', '--json', 'databaseId,status,conclusion,displayTitle,createdAt'));
// A dispatched run names its inputs only in its jobs' logs; the plan job's summary names the build, so each run is asked.
const matching = runs.filter((r) => {
	try {
		return gh('run', 'view', String(r.databaseId), '--repo', REPO, '--log').includes(build);
	} catch {
		return false;
	}
});
const run = matching[0];
if (!run) {
	console.error(`no Check run of ${build}: run the Check workflow on it first`);
	process.exit(1);
}
if (run.status !== 'completed') {
	console.error(`Check run ${run.databaseId} of ${tag} has not finished (${run.status})`);
	process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), 'qwikui-gate-'));
gh('run', 'download', String(run.databaseId), '--repo', REPO, '-n', 'check-merged', '-D', dir);
const first = readFileSync(join(dir, 'summary.md'), 'utf8').split('\n')[0];
const counts = Object.fromEntries([...first.matchAll(/(\d+) (green|red|not ported|blocked|not checked)/g)].map((m) => [m[2], Number(m[1])]));
const total = Number(/of (\d+)/.exec(first)?.[1] ?? 0);
console.log(`Check run ${run.databaseId} of ${tag}: ${first}`);
process.exit(total > 0 && counts.green === total ? 0 : 1);
