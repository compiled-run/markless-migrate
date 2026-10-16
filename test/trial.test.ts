import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { startTrial } from '../scripts/trial.ts';

test('the trial serves the fixture as the old app and a copy with one changed heading as the new app', async () => {
	const root = await mkdtemp(join(tmpdir(), 'mm-trial-'));
	const trial = await startTrial(root);
	try {
		const h1 = async (origin: string) => (await (await fetch(new URL(trial.route, origin))).text()).match(/<h1>(.*?)<\/h1>/)?.[1];
		assert.equal(await h1(trial.old), 'About the guides');
		assert.equal(await h1(trial.new), 'Meet the guides');
		assert.match(await readFile(join(trial.project, 'about/index.html'), 'utf8'), /Meet the guides/);
	} finally {
		trial.stop();
	}
});
