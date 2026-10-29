import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildPlan, fanOut, identity, readLoadPhase, type Finding, type ListedControl } from '../scripts/probe/plan.ts';

const sig = (cls: string, extra: Partial<ListedControl['sig'] & object> = {}) => ({ tag: 'button', type: 'button', slot: 'toggle', cls, data: '', aria: '', chain: 'card', href: '', own: 'x', ...extra });
const control = (key: string, cls = 'a', portCls = cls): ListedControl => ({ key, role: 'button', name: key.replace(/^button "|"( #\d+)?$/g, ''), layout: false, leaves: false, template: 'button|toggle', sig: sig(cls), port: { key, sig: sig(portCls) } });
const caps = { use: 30, key: 24, input: 24, keysPerControl: 4, useRoutes: 1, everyRouteUpTo: 1 };

test('the same control on many routes is used once, and what it finds is reported on every route that has it', () => {
	const routes = ['/a', '/b', '/c'].map((route) => ({ route, controls: [control('button "Toggle"')] }));
	const plan = buildPlan(routes, { seed: 's', caps });
	assert.equal(plan.work.uses, 1);
	const used = Object.entries(plan.routes).filter(([, r]) => r.use.length).map(([route]) => route);
	assert.equal(used.length, 1);
	const findings = fanOut([{ route: used[0]!, control: 'button "Toggle" > button "Close"', kind: 'dead' }], plan);
	assert.deepEqual(findings.map((f) => f.route).sort(), ['/a', '/b', '/c']);
	assert.ok(findings.filter((f) => f.route !== used[0]).every((f) => f.via === used[0] && f.control === 'button "Toggle" > button "Close"'));
});

test('controls that differ on either side, or have no pair on the port, are never one group', () => {
	assert.notEqual(identity('/a', control('button "Toggle"', 'a')), identity('/b', control('button "Toggle"', 'b')));
	assert.notEqual(identity('/a', control('button "Toggle"', 'a', 'a')), identity('/b', control('button "Toggle"', 'a', 'z')));
	assert.notEqual(identity('/a', control('button "Toggle"')), identity('/b', control('button "Other"')));
	const unpaired = { ...control('button "Toggle"'), port: undefined };
	assert.notEqual(identity('/a', unpaired), identity('/b', unpaired));
	// How a control answers keys does not depend on its label: keys group without the name.
	assert.equal(identity('/a', control('button "Toggle"'), 'keyed'), identity('/b', control('button "Other"'), 'keyed'));
});

test('a control many routes have is clicked on two of them, so a finding the probe makes only some of the time is missed less often', () => {
	const routes = ['/a', '/b', '/c'].map((route) => ({ route, controls: [control('button "Toggle"'), control('button "Toggle" #2')] }));
	const plan = buildPlan(routes, { seed: 's', caps: { ...caps, useRoutes: 2 } });
	const by = Object.values(plan.groups.use)[0]!.by;
	assert.equal(by.length, 2);
	assert.notEqual(by[0]!.route, by[1]!.route);
	const findings = fanOut(by.map((b) => ({ route: b.route, control: b.key, kind: 'dead' })), plan);
	assert.equal(findings.length, 6, 'each of the six controls once');
});

test('a control only a few routes have is clicked on each of them', () => {
	const routes = ['/a', '/b', '/c'].map((route) => ({ route, controls: [control('button "More"')] }));
	const plan = buildPlan(routes, { seed: 's', caps: { ...caps, everyRouteUpTo: 4 } });
	assert.deepEqual(Object.values(plan.groups.use)[0]!.by.map((b) => b.route).sort(), ['/a', '/b', '/c']);
	assert.equal(fanOut([{ route: '/a', control: 'button "More"', kind: 'region' }], plan).length, 1, 'each route reports what it made itself');
});

test('only what the unplanned probe would try is tried, and every control of a tried group hears what it found', () => {
	const copies = ['button "Copy"', 'button "Copy" #2', 'button "Copy" #3'].map((key) => control(key));
	const plan = buildPlan([{ route: '/a', controls: copies }], { seed: 's', caps });
	assert.deepEqual(plan.routes['/a']!.use.map((c) => c.key), ['button "Copy"'], 'one of the two namesakes the unplanned probe would use');
	const reported = fanOut([{ route: '/a', control: 'button "Copy"', kind: 'dead' }], plan);
	assert.deepEqual(reported.map((f) => f.control).sort(), copies.map((c) => c.key).sort());
});

test('a route with no room left under its cap passes the use to another route of the group', () => {
	const many = Array.from({ length: 3 }, (_, i) => control(`button "Only ${i}"`, `only${i}`));
	const plan = buildPlan([{ route: '/full', controls: [...many, control('button "Toggle"')] }, { route: '/b', controls: [control('button "Toggle"')] }], { seed: 's', caps: { ...caps, use: 3 } });
	assert.deepEqual(plan.routes['/full']!.use.map((c) => c.key).sort(), many.map((c) => c.key).sort());
	assert.deepEqual(plan.routes['/b']!.use.map((c) => c.key), ['button "Toggle"']);
	assert.equal(plan.work.overBudget, 0);
});

test('the seed rotates which route of a group is used', () => {
	const routes = Array.from({ length: 12 }, (_, i) => ({ route: `/r${i}`, controls: [control('button "Toggle"')] }));
	const chosen = new Set(['1', '2', '3', '4', '5', '6'].map((seed) => Object.entries(buildPlan(routes, { seed, caps }).routes).find(([, r]) => r.use.length)![0]));
	assert.ok(chosen.size > 1);
});

// Two pages share a toggle the port left dead; one page also has a button only it has, dead on the port too.
const card = (script: boolean, extra = '') =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plan</title></head><body><main><h1>Plan</h1><section aria-label="Card"><button type="button" data-slot="toggle" class="toggle" id="t">Toggle</button><div id="panel" hidden>Panel</div></section>${extra}</main>${script ? '<script>t.onclick = () => { panel.hidden = !panel.hidden; }; if (window.only) only.onclick = () => { said.textContent = "done"; };</script>' : ''}</body></html>`;
const ONLY = '<section aria-label="Extra"><button type="button" data-slot="only" class="only" id="only">Only here</button><p id="said"></p></section>';
const servers: Server[] = [];
after(() => {
	for (const s of servers) s.close();
});
function serve(script: boolean): Promise<string> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		if (path !== '/one' && path !== '/two') return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>404</title>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(card(script, path === '/two' ? ONLY : ''));
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}
const probe = new URL('../scripts/probe/dead-controls.mjs', import.meta.url).pathname;
function run(env: Record<string, string>, routes: string, out: string): Promise<void> {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, [probe, routes, out], { env: { ...process.env, ENGINE: 'chromium', STATIC_WIDTHS: '1280', ANCHOR_WIDTHS: '', KEY_MAX: '4', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
		let log = '';
		child.stdout.on('data', (d) => (log += d));
		child.stderr.on('data', (d) => (log += d));
		child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`probe exited ${code}:\n${log}`))));
	});
}
const rows = async (file: string) => (await readFile(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { route: string; tried: number; findings: Finding[] });

test('the probe lists every route once, then uses each distinct control on one route, and the shared dead toggle is reported on both', { timeout: 600_000 }, async () => {
	const [OLD, NEW] = [await serve(true), await serve(false)];
	const dir = await mkdtemp(join(tmpdir(), 'probe-plan-'));
	const routes = join(dir, 'routes.json');
	await writeFile(routes, JSON.stringify(['/one', '/two']));
	await run({ OLD, NEW, PHASE: 'load' }, routes, join(dir, 'load.jsonl'));
	const plan = buildPlan(readLoadPhase(dir), { seed: 'test', caps });
	assert.equal(plan.work.uses, 2, 'the toggle once, the button only /two has once');
	await writeFile(join(dir, 'plan.json'), JSON.stringify(plan));
	await run({ OLD, NEW, PLAN: join(dir, 'plan.json') }, routes, join(dir, 'used.jsonl'));
	const used = await rows(join(dir, 'used.jsonl'));
	assert.equal(used.reduce((n, r) => n + r.tried, 0), 2);
	// A use whose screencast still caught a painted change (the focus ring) is a region finding, else a dead one: either names the control.
	const reported = fanOut(used.flatMap((r) => r.findings), plan).filter((f) => f.kind === 'dead' || f.kind === 'region');
	assert.deepEqual([...new Set(reported.map((f) => `${f.route} ${f.control}`))].sort(), ['/one button "Toggle"', '/two button "Only here"', '/two button "Toggle"']);
	assert.ok(reported.some((f) => f.via && f.control === 'button "Toggle"'));
});

test('the replay says, for each real finding of a full run, whether a planned run still makes it', async () => {
	const { parity } = await import('../scripts/probe/parity.ts');
	const listed = (key: string, cls = 'a') => ({ ...control(key, cls), template: 'button|toggle' }) as ListedControl & { template: string };
	const listing = new Map([
		['/a', [listed('button "Toggle"'), listed('button "Alone"', 'z')]],
		['/b', [listed('button "Toggle"')]],
		['/c', [listed('button "Toggle"')]],
	]);
	const plans = { chromium: buildPlan([...listing].map(([route, controls]) => ({ route, controls })), { seed: 's', caps }) };
	const rows = [
		{ route: '/a', engine: 'chromium', findings: [{ route: '/a', control: 'button "Toggle"', kind: 'dead' }, { route: '/a', control: 'button "Alone"', kind: 'dead' }, { route: '/a', control: 'main', kind: 'box' }] },
		{ route: '/b', engine: 'chromium', findings: [{ route: '/b', control: 'button "Toggle"', kind: 'dead' }] },
		// A finding a later probe rule no longer makes is not a real one.
		{ route: '/c', engine: 'chromium', findings: [{ route: '/c', control: 'button "Toggle"', kind: 'dead', expected: 'changes banner', actual: 'nothing changed on the port' }] },
	];
	const { verdicts, defects } = parity(rows, listing, plans, ['/a', '/b', '/c']);
	const by = Object.fromEntries(verdicts.map((v) => [`${v.route} ${v.finding.control}`, v.verdict]));
	assert.equal(by['/a main'], 'load-pass');
	assert.equal(by['/a button "Alone"'], 'alone');
	assert.equal(by['/a button "Toggle"'], 'differs', '/c used the toggle and did not make it');
	assert.equal(by['/c button "Toggle"'], undefined);
	assert.deepEqual(defects.find((d) => d.finding.startsWith('button "Toggle"'))?.made, 2);
	assert.deepEqual(defects.find((d) => d.finding.startsWith('button "Toggle"'))?.used, 3);
});
