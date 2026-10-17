import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { renderHtml, renderStatusPage } from '../src/check/html.ts';
import { DIMENSIONS, type RouteResult } from '../src/check/types.ts';
import { recordResults, status, summarizeStatus } from '../src/status.ts';

async function project(routes: string[], switched: object[]): Promise<string> {
	const cwd = await mkdtemp(join(tmpdir(), 'mm-status-'));
	await mkdir(join(cwd, '.migrate'));
	await writeFile(join(cwd, '.migrate', 'inventory.json'), JSON.stringify({ routes: routes.map((route) => ({ route })) }));
	await writeFile(join(cwd, '.migrate', 'switched.json'), JSON.stringify({ routes: switched }));
	return cwd;
}

const zero = { downloaded: 0, source: 0, executed: 0 };
const result = (route: string, over: Partial<RouteResult> = {}): RouteResult => ({ route, ok: true, dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, 'pass'])) as RouteResult['dimensions'], failures: [], weight: { old: zero, new: zero }, visualDiffs: [], shots: [], ...over });

test('status lists every planned route as green, red, not ported or not checked, with forced routes and whether the migration is done', async () => {
	const cwd = await project(['/', '/users', '/tasks', '/settings'], [{ route: '/', at: 'x', checks: [] }, { route: '/tasks', at: 'x', checks: [], forced: { reason: 'demo day', by: 'Jo' } }]);
	await recordResults(cwd, {
		version: 1, old: 'o', new: 'n', startedAt: 'x', ok: false,
		routes: [result('/', { coverage: { total: 3, exercised: 3, elements: [], skipped: 0 } }), result('/users', { ok: false, notPorted: true, dimensions: { ...result('/').dimensions, http: 'fail' } }), result('/tasks', { ok: false, dimensions: { ...result('/').dimensions, behaviour: 'fail' } })],
	});
	const s = await status(cwd);
	assert.deepEqual(s.routes.map((r) => [r.route, r.state, Boolean(r.switched), r.forced?.by]), [['/', 'green', true, undefined], ['/settings', 'unchecked', false, undefined], ['/tasks', 'red', true, 'Jo'], ['/users', 'not ported', false, undefined]]);
	assert.equal(s.done, false);
	const text = summarizeStatus(s);
	assert.match(text, /^1 green, 1 red, 1 not ported, 1 not checked, 2 switched to Markless, 1 FORCED \(not proven\)/);
	assert.match(text, /green +\/  \(3 of 3 interactions exercised\)  \(switched\)/);
	assert.match(text, /red +\/tasks  \[behaviour\]  \(FORCED, not proven: demo day, by Jo\)/);
	assert.match(text, /Migration not done: 1 not ported, 1 not checked, 1 red, 1 forced without proof\./);
	const page = renderStatusPage(s, { old: 'https://old.example', new: 'https://new.example' });
	assert.match(page, /<h2>Not ported yet<\/h2><ul><li><code>\/settings<\/code> unchecked<\/li><li><code>\/users<\/code> not ported<\/li><\/ul>/);
	assert.match(page, /<span class="badge fail">forced, not proven<\/span> demo day/);
	const report = renderHtml({ version: 1, old: 'o', new: 'n', startedAt: 'x', ok: false, routes: [result('/tasks', { ok: false })] }, undefined, s);
	assert.match(report, /<h2><span class="badge fail">red<\/span> \/tasks<\/h2>\n<p class="forced"><span class="badge fail">forced, not proven<\/span>/);
	assert.match(report, /<h2>Every planned route<\/h2><p><strong>Migration not done:<\/strong>/);
});

test('the migration is done when every planned route is green and switched without force', async () => {
	const cwd = await project(['/', '/a'], [{ route: '/', at: 'x', checks: [] }, { route: '/a', at: 'x', checks: [] }]);
	await recordResults(cwd, { version: 1, old: 'o', new: 'n', startedAt: 'x', ok: true, routes: [result('/'), result('/a')] });
	const s = await status(cwd);
	assert.equal(s.done, true);
	assert.match(summarizeStatus(s), /Migration done: every planned route is green and switched\./);
});
