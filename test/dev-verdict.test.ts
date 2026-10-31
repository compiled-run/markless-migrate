import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PROBE_ENGINES, shardCheckArgs } from '../src/check/ci-settings.ts';
import type { RouteProbe } from '../src/dev/findings.ts';
import { formatVerdicts, routeVerdict, type CheckedRoute } from '../src/dev/verdict.ts';

const green: CheckedRoute = { route: '/a', ok: true, dimensions: { visual: 'pass' }, failures: [] };
const probed = (route: string, findings = 0): RouteProbe => ({ route, tried: 3, ms: 1000, findings: Array.from({ length: findings }, (_, i) => ({ route, control: `button "${i}"`, kind: 'dead', expected: 'opens', actual: 'nothing' })) });
const both = (route: string, chromium = 0, webkit = 0) => ({ chromium: [probed(route, chromium)], webkit: [probed(route, webkit)] });

test('a route passes only when check is green and both engines find no difference', () => {
	assert.equal(routeVerdict('/a', [green], both('/a')).pass, true);
	assert.deepEqual(routeVerdict('/a', [green], both('/a', 0, 2)).reasons, ['webkit probe: 2 differences from the original']);
	const red: CheckedRoute = { route: '/a', ok: false, dimensions: { visual: 'pass', behaviour: 'fail' }, failures: [{ dimension: 'behaviour', check: 'click' }, { dimension: 'visual', check: 'pixels', accepted: { reason: 'x' } }] };
	assert.deepEqual(routeVerdict('/a', [red], both('/a')).reasons, ['check: behaviour (1 failure: behaviour: click)']);
});

test('what was not measured is a fail to take again, never a third outcome', () => {
	const infra: CheckedRoute = { route: '/a', ok: false, infrastructure: { message: 'ECONNRESET' } };
	const v = routeVerdict('/a', [infra], both('/a'));
	assert.equal(v.pass, false);
	assert.deepEqual(v.rerun, { check: true, engines: [] });
	const missing = routeVerdict('/a', [], { chromium: [probed('/a')], webkit: [] });
	assert.equal(missing.pass, false);
	assert.deepEqual(missing.rerun, { check: true, engines: ['webkit'] });
	assert.match(formatVerdicts([v, routeVerdict('/b', [{ ...green, route: '/b' }], both('/b'))]), /\nverdict: FAIL \(1 of 2 routes\)\n$/);
	assert.match(formatVerdicts([routeVerdict('/a', [green], both('/a'))]), /^PASS {2}\/a\nverdict: PASS \(1 route\)\n$/);
});

test("a page whose visual, motion and load run on its template group's representative says so", () => {
	const member: CheckedRoute = { ...green, template: { representative: '/b', pattern: '/docs/:slug' } };
	assert.match(routeVerdict('/a', [member], both('/a')).notes[0]!, /checked on \/b/);
});

test("the CI workflows read the shard check flags and the probe's budgets from ci-settings, the values dev --verdict runs", () => {
	const check = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
	assert.match(check, /scripts\/ci-flags\.ts" check "\$CONCURRENCY" "\$TIMEOUT"/);
	assert.doesNotMatch(check.split('\n').find((l) => l.includes('src/cli.ts" check'))!, /--control-webkit|--busy-cpu/);
	const probe = readFileSync(new URL('../.github/workflows/probe-dead-controls.yml', import.meta.url), 'utf8');
	assert.match(probe, /ci-flags\.ts probe \$\{\{ matrix\.engine \}\}/);
	assert.doesNotMatch(probe, /MAX_ACTIONS=/);
	const script = new URL('../scripts/ci-flags.ts', import.meta.url).pathname;
	assert.equal(execFileSync(process.execPath, [script, 'check', '', '']).toString().trim(), shardCheckArgs().join(' '));
	assert.equal(execFileSync(process.execPath, [script, 'check', '2', '60']).toString().trim(), shardCheckArgs('2', '60').join(' '));
	assert.equal(execFileSync(process.execPath, [script, 'probe', 'webkit']).toString(), `${Object.entries(PROBE_ENGINES.webkit).map(([k, v]) => `export ${k}=${v}`).join('\n')}\n`);
});

test('a visit to a page the build does not hold is recorded, by its document or its fragment URL, and only from a browser', async () => {
	const { createServer } = await import('node:http');
	const { pageOf, recordingProxy } = await import('../src/dev/proxy.ts');
	assert.equal(pageOf('/_markless/fragment/docs/installation', '/_markless/fragment/'), '/docs/installation');
	assert.equal(pageOf('/_markless/fragment/', '/_markless/fragment/'), '/');
	assert.equal(pageOf('/docs/', undefined), '/docs');
	const upstream = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end(`served ${req.url}`));
	await new Promise<void>((done) => upstream.listen(0, '127.0.0.1', done));
	const seen = new Set<string>();
	const built = new Set(['/a']);
	const proxy = await recordingProxy((upstream.address() as { port: number }).port, 0, (p) => !built.has(p), '/_markless/fragment/', seen);
	const at = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
	try {
		const browser = { 'user-agent': 'Mozilla/5.0 HeadlessChrome' };
		assert.equal(await (await fetch(`${at}/b?x=1`, { headers: browser })).text(), 'served /b?x=1');
		await fetch(`${at}/_markless/fragment/c`, { headers: browser });
		await fetch(`${at}/a`, { headers: browser });
		await fetch(`${at}/d`);
		assert.deepEqual([...seen].sort(), ['/b', '/c']);
	} finally {
		proxy.close();
		upstream.close();
	}
});
