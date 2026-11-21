// scripts/pipeline-artifact.sh against a stand-in `gh` that answers the Actions API from a fixed listing through jq.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from '../src/code-closure.ts';

function run(listings: Record<string, object>, args: readonly string[]): string {
	const bin = mkdtempSync(join(tmpdir(), 'mm-gh-'));
	try {
		writeFileSync(join(bin, 'listings.json'), JSON.stringify(listings));
		const gh = join(bin, 'gh');
		writeFileSync(gh, `#!/usr/bin/env bash\n[ "$1" = api ] && [ "$3" = --jq ] || exit 9\njq -c --arg url "$2" '.[$url] // {"artifacts":[]}' "${join(bin, 'listings.json')}" | jq -r "$4"\n`);
		chmodSync(gh, 0o755);
		return execFileSync('bash', [join(ROOT, 'scripts/pipeline-artifact.sh'), ...args], { env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, GITHUB_REPOSITORY: 'o/r' }, encoding: 'utf8' }).trim();
	} finally {
		rmSync(bin, { recursive: true, force: true });
	}
}

test('in-run names the artifact a run still holds under a name, and nothing once it has expired or the run never made it', () => {
	const url = 'repos/o/r/actions/runs/41/artifacts?name=pl-site-recordings&per_page=20';
	assert.equal(run({ [url]: { artifacts: [{ id: 7, name: 'pl-site-recordings', expired: false }] } }, ['in-run', 'pl-site-recordings', '41']), '7');
	assert.equal(run({ [url]: { artifacts: [{ id: 7, name: 'pl-site-recordings', expired: true }] } }, ['in-run', 'pl-site-recordings', '41']), '');
	assert.equal(run({}, ['in-run', 'pl-site-recordings', '41']), '');
});
