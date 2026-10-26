import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serve, type WasteFixture } from '../../fixtures/waste/server.ts';
import { measureWaste, wasteLines } from '../../src/check/waste.ts';

// Two shapes of one page: a package imported and never called, and a library port the registry lists, beside the handler the click runs.
const SHAPES: readonly WasteFixture[] = [
	{ handler: 'src/tabs.ts', heavy: 'node_modules/heavy-chart/dist/index.js', port: 'lib/parts/cmdk.ts', registry: 'lib/parts/registry.ts', role: 'tab' },
	{ handler: 'app/menu-button.tsx', heavy: 'node_modules/@plots/canvas/lib/draw.mjs', port: 'lib/parts/radix/menu.ts', registry: 'lib/parts/registry.ts', role: 'button' },
];

for (const shape of SHAPES) {
	test(`the first click's waste names the package nothing called, then the unused library port, through a hidden source map (${shape.heavy})`, async () => {
		const { origin, server } = await serve(shape);
		try {
			const report = await measureWaste(`${origin}/`, { timeoutMs: 60_000, budget: 5_000 });
			assert.equal(report.error, undefined);
			assert.ok(report.answered! > 0);
			assert.equal(report.mapped, 1, 'the map beside the script is found though the script does not name it');
			const [first, second] = report.items;
			const pkg = shape.heavy.replace(/^node_modules\//, '').split('/').slice(0, shape.heavy.includes('/@') ? 2 : 1).join('/');
			assert.deepEqual([first?.kind, first?.name], ['package', pkg], wasteLines(report).join('\n'));
			assert.ok(first!.neverRan > first!.bytes * 0.95, `${first!.neverRan} of ${first!.bytes} never ran`);
			assert.deepEqual([second?.kind, second?.name], ['library port', shape.port.replace(/\.ts$/, '')]);
			const handler = report.items.find((i) => i.name === shape.handler)!;
			assert.ok(handler.ranInFunctions > 0 && handler.neverRan === 0, `the handler ran: ${JSON.stringify(handler)}`);
			const registry = report.items.find((i) => i.kind === 'parts registry')!;
			assert.ok(registry.ranAtTopLevel > 0 && registry.ranInFunctions === 0, 'the registry only ran as the script loaded');
			assert.equal(report.inlineData[0]?.name, '<script type="application/json" data-state>');
			const lines = wasteLines(report).join('\n');
			assert.match(lines, /over the 5\.0 kB budget/);
			assert.match(lines, new RegExp(`package: ${pkg.replace(/[/@]/g, '\\$&')}`));
		} finally {
			server.close();
		}
	});
}

test('the waste command prints the offenders and writes the report as JSON', async () => {
	const { execFile } = await import('node:child_process');
	const { mkdtemp, readFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { origin, server } = await serve(SHAPES[0]!);
	try {
		const dir = await mkdtemp(join(tmpdir(), 'waste-'));
		const out = await new Promise<string>((done, fail) => execFile(process.execPath, ['src/cli.ts', 'waste', `${origin}/`, '--budget', '5', '--json', join(dir, 'w.json')], (error, stdout) => (error ? fail(error) : done(stdout))));
		assert.match(out, /package: heavy-chart/);
		assert.match(out, /over the 5\.0 kB budget/);
		const [report] = JSON.parse(await readFile(join(dir, 'w.json'), 'utf8')) as { items: { name: string }[] }[];
		assert.equal(report!.items[0]!.name, 'heavy-chart');
	} finally {
		server.close();
	}
});

test('check measures each page\'s first-click waste after the load, warns about a page over the JS budget and keeps it green', async () => {
	const { runCheck } = await import('../../src/check/run.ts');
	const { summarize } = await import('../../src/check/summary.ts');
	const { renderHtml } = await import('../../src/check/html.ts');
	const old = await serve(SHAPES[0]!, 2_000);
	const next = await serve(SHAPES[0]!);
	const reference = await serve(SHAPES[1]!, 2_000);
	try {
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], only: 'load', load: { runs: 4, psi: false, waste: { budget: 20_000, references: [`${reference.origin}/`] } } });
		const route = report.routes[0]!;
		const waste = route.load?.waste;
		assert.ok(waste && !('unavailable' in waste), JSON.stringify(waste));
		assert.equal(waste.url, `${next.origin}/`, 'the new page is measured');
		assert.equal(waste.items[0]?.name, 'heavy-chart');
		assert.ok(!route.failures.some((f) => /first-click|waste/i.test(f.check)), 'over budget is a warning, not a failure');
		const summary = summarize(report);
		assert.match(summary, /first-click JS before the first click answered .* over the 20\.0 kB budget/);
		assert.match(summary, /^First-click JS \(a warning, not red\): 1 of 1 page measured/m);
		assert.match(summary, new RegExp(`^  ${reference.origin.replace(/[.]/g, '\\.')}/: answered at`, 'm'));
		assert.match(renderHtml(report), /First-click waste: JS before the first click answered/);
	} finally {
		old.server.close();
		next.server.close();
		reference.server.close();
	}
});
