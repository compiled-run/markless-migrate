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
