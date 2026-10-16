import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { changedSince, gitHead, selectChanged } from '../src/check/changed.ts';
import type { RouteState } from '../src/status.ts';

const state = (route: string, ok: boolean, commit: string | undefined, files: string[]): RouteState => ({ route, ok, checkedAt: 'x', old: 'o', new: 'n', red: ok ? [] : ['seo'], failures: [], ...(commit ? { commit } : {}), files });

test('--changed re-checks red, unchecked and edited routes, skips green untouched ones, and re-checks all when an untied file changes', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-changed-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
	git('init', '-q');
	git('config', 'user.email', 't@example.com');
	git('config', 'user.name', 't');
	await mkdir(join(dir, 'pages/about'), { recursive: true });
	for (const f of ['pages/index.tsrx', 'pages/about/index.tsrx', 'document.tsrx', 'vite.config.ts']) await writeFile(join(dir, f), 'x\n');
	git('add', '.');
	git('commit', '-qm', 'one');
	const commit = (await gitHead(dir))!;
	assert.match(commit, /^[0-9a-f]{40}$/);
	const results = {
		'/': state('/', true, commit, ['pages/index.tsrx', 'document.tsrx']),
		'/about/': state('/about/', true, commit, ['pages/about/index.tsrx', 'document.tsrx']),
		'/about/ as member': state('/about/', true, commit, ['pages/about/index.tsrx', 'document.tsrx']),
		'/red/': state('/red/', false, commit, []),
		'/old/': state('/old/', true, undefined, []),
	};
	const since = (c: string) => changedSince(dir, c);
	assert.deepEqual(await selectChanged(['/', '/about/', '/red/', '/old/', '/new/'], results, since), { check: ['/red/', '/old/', '/new/'], skipped: ['/', '/about/'] });
	await writeFile(join(dir, 'pages/about/index.tsrx'), 'y\n');
	await mkdir(join(dir, '.migrate'));
	await writeFile(join(dir, '.migrate/results.json'), '{}');
	assert.deepEqual((await selectChanged(['/', '/about/'], results, since)).check, ['/about/'], 'an unstaged edit to the about page; .migrate/ is ignored');
	await writeFile(join(dir, 'pages/shared.css'), 'a{}\n');
	assert.deepEqual((await selectChanged(['/', '/about/'], results, since)).check, ['/', '/about/'], 'a new file no route lists could affect any of them');
});
