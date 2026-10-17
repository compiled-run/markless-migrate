import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const git = (...args: string[]) => execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
const reportArtifact = /(^|\/)(\.migrate\/(shots|diffs|journeys)\/|\.migrate\/report\.|_migrate\/shots\/|_migrate\/report\.)/;

test('no report screenshots or published reports are tracked', () => {
	assert.deepEqual(git('ls-files').split('\n').filter((p) => reportArtifact.test(p)), []);
});

test('report outputs are ignored wherever a check or a front door writes them', () => {
	const paths = ['.migrate/shots/a.png', 'examples/x/.migrate/diffs/a.png', 'examples/x/.migrate/journeys/a.json', 'examples/x/.migrate/report.html', 'deploy/x/front/public/_migrate/shots/a.png', 'deploy/x/front/public/_migrate/report.json', 'deploy/front/public/_migrate/report.html'];
	const ignored = git('check-ignore', '--no-index', ...paths).trim().split('\n');
	assert.deepEqual(ignored, paths);
});
