// JavaScript on the wire and run at load, old against new, each route on the same replayed data (V8 coverage, counted as check counts it).
// node measure/weight.mjs --old <origin> --new <origin> --data <dir> /news /story/1 ...
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { executedBytes } from '../../../src/check/capture.ts';
import { FakeDatabase, FIREBASE_SOCKET } from '../../../src/check/live-data.ts';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { old: { type: 'string' }, new: { type: 'string' }, data: { type: 'string' } },
});
const slug = (route) => route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
const browser = await chromium.launch();
const rows = [];
try {
	for (const route of positionals) {
		const recording = JSON.parse(
			await readFile(join(values.data, `${slug(route)}.json`), 'utf8'),
		);
		const row = { route };
		for (const side of ['old', 'new']) {
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const databases = (recording.live?.firebase ?? []).map((db) => new FakeDatabase(db));
			await context.routeWebSocket(FIREBASE_SOCKET, (socket) =>
				databases[0] ? databases[0].serve(socket) : socket.close(),
			);
			const page = await context.newPage();
			const wire = new Map();
			page.on('response', async (response) => {
				if (response.request().resourceType() !== 'script') return;
				const sizes = await response
					.request()
					.sizes()
					.catch(() => undefined);
				wire.set(response.url(), sizes?.responseBodySize ?? 0);
			});
			await page.coverage.startJSCoverage({ resetOnNavigation: false });
			await page.goto(side === 'old' ? `${values.old}/#${route}` : `${values.new}${route}`, {
				waitUntil: 'load',
			});
			await page.waitForTimeout(3000);
			const coverage = await page.coverage.stopJSCoverage();
			const executed = coverage.reduce(
				(sum, entry) => sum + executedBytes(entry.source ?? '', entry.functions),
				0,
			);
			const source = coverage.reduce((sum, entry) => sum + (entry.source ?? '').length, 0);
			row[side] = {
				wireKb: Math.round([...wire.values()].reduce((a, b) => a + b, 0) / 102.4) / 10,
				sourceKb: Math.round(source / 102.4) / 10,
				executedKb: Math.round(executed / 102.4) / 10,
				scripts: wire.size,
			};
			await context.close();
		}
		rows.push(row);
		console.log(
			`${route}: old ${row.old.executedKb} kB run of ${row.old.sourceKb} kB (${row.old.wireKb} kB on the wire) -> new ${row.new.executedKb} kB run of ${row.new.sourceKb} kB (${row.new.wireKb} kB on the wire)`,
		);
	}
} finally {
	await browser.close();
}
