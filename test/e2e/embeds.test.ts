import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { serve, serveProvider, type Variant } from '../../fixtures/embeds/server.ts';
import { runCheck } from '../../src/check/run.ts';
import type { Failure, Report } from '../../src/check/types.ts';

const VIEWPORTS = [
	{ name: 'desktop', width: 1280, height: 800, isMobile: false },
	{ name: 'mobile', width: 390, height: 844, isMobile: true },
];
const ID = 'bunny-4242-launch-keynote';

describe('embeds: each old embed against the Markless component in its place, by pixels in every state and by what activating it does', { concurrency: 2 }, () => {
	let browser: Browser;
	let provider: string;
	const servers: { close(): void }[] = [];
	const app = async (variant: Variant) => {
		const { origin, server } = await serve(variant, provider);
		servers.push(server);
		return origin;
	};
	before(async () => {
		browser = await chromium.launch();
		const p = await serveProvider();
		servers.push(p.server);
		provider = p.origin;
	});
	after(async () => {
		for (const s of servers) s.close();
		await browser?.close();
	});
	const check = async (variant: Variant): Promise<Report> => runCheck({ oldOrigin: await app('old'), newOrigin: await app(variant), routes: ['/'], browser, viewports: VIEWPORTS, embeds: { dir: await mkdtemp(join(tmpdir(), 'mm-embeds-')) }, journeys: { budgetMs: 1, maxJourneys: 0 } });
	const embedFailures = (report: Report): Failure[] => report.routes[0]!.failures.filter((f) => f.check.startsWith('embed '));
	const list = (failures: readonly Failure[]) => failures.map((f) => `${f.viewport} ${f.check}: ${f.expected} / ${f.actual}`).join('\n');

	test('a component that shows the settled player at rest, hovered and focused, in light and dark, and loads the original on a click or Enter, is green', async () => {
		const report = await check('faithful');
		assert.deepEqual(embedFailures(report), [], list(embedFailures(report)));
		const shots = report.routes[0]!.shots.filter((s) => s.label.startsWith(`embed ${ID}`));
		assert.equal(shots.length, 12, 'two viewports, two schemes, three states');
		assert.ok(shots.every((s) => s.ok));
	});

	test('a component whose play button does not light up on hover is red in the hover state only', async () => {
		const failures = embedFailures(await check('wrong-hover'));
		assert.ok(failures.length > 0, 'the hover state differs');
		assert.ok(failures.every((f) => f.dimension === 'visual' && / hover$/.test(f.check)), list(failures));
		const files = /old, new and diff: (.+)$/.exec(failures[0]!.actual)?.[1]?.split(', ') ?? [];
		assert.equal(files.length, 3, failures[0]!.actual);
		assert.ok(files.every((f) => existsSync(f)) && files[0]!.endsWith(`/${ID}/check/${failures[0]!.viewport}-light-hover-old.png`), files.join('\n'));
	});

	test('a component that does nothing when activated is red in behaviour, by click and by keyboard', async () => {
		const failures = embedFailures(await check('no-activation')).filter((f) => f.dimension === 'behaviour');
		assert.deepEqual(failures.map((f) => `${f.viewport} ${f.check}`).sort(), [`desktop embed ${ID} activation by click`, `desktop embed ${ID} activation by keyboard`, `mobile embed ${ID} activation by click`, `mobile embed ${ID} activation by keyboard`]);
		assert.match(failures[0]!.expected, /in its place: iframe http:\/\/localhost:\d+\/embed\/4242\/launch-keynote; media playing/);
		assert.match(failures[0]!.actual, /nothing loads in its place; nothing playing/);
	});

	test('a port that keeps the original embed is compared live against it, and one that drops it is red', async () => {
		assert.deepEqual(embedFailures(await check('kept')), []);
		const dropped = embedFailures(await check('dropped'));
		assert.ok(dropped.some((f) => f.dimension === 'rendered' && /\(absent\)/.test(f.actual)), list(dropped));
	});
});
