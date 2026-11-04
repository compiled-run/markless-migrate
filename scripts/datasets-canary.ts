#!/usr/bin/env node
// The canary of datasets.lock (design §3.2, §8): the original's tables produced by this checkout's producers on a fixed set
// of pages, so two checkouts' rows can be compared and a producer change told apart from a change of what it records.
//   node scripts/datasets-canary.ts produce <dir> [--old <origin> --targets <file>]
//       without --old, the bug corpus's micro-site, served here
//   node scripts/datasets-canary.ts diff <base 1> <base 2> <head 1> <head 2> [--out <diff.json>]
//       two runs a side: a field family differing within a side is named as nondeterministic and fails the canary; one alike
//       within each side and different between them is a change that sticks, which needs a version bump
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { defaultEnv, LAUNCH } from '../src/check/browser.ts';
import { originalConditions, writesAllowed } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';
import { canary } from '../src/data/original/canary.ts';
import { TABLES, type Table } from '../src/data/original/dataset.ts';
import { readLock } from '../src/data/original/lock.ts';
import * as produce from '../src/data/original/produce.ts';
import { commitDataset, Dataset, DatasetWriter } from '../src/data/original/store.ts';
import { isSwitched } from '../src/switch/state.ts';
import { ORIGINAL } from '../test/corpus/site.ts';

const [command, ...args] = process.argv.slice(2);
const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { old: { type: 'string' }, targets: { type: 'string' }, out: { type: 'string' } } });

async function microSite(): Promise<{ origin: string; close: () => void }> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const body = path === '/' ? ORIGINAL['/docs'] : ORIGINAL[path];
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
	});
	// One port for both checkouts' canaries: every row that names the page's address names the same one.
	await new Promise<void>((done, fail) => server.once('error', fail).listen(Number(process.env.CANARY_PORT ?? 47311), '127.0.0.1', () => done()));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => (server.closeAllConnections(), server.close()) };
}

if (command === 'produce') {
	const dir = resolve(positionals[0] ?? '');
	const site = values.old ? undefined : await microSite();
	const origin = values.old ?? site!.origin;
	const routes = values.targets ? (JSON.parse(readFileSync(resolve(values.targets), 'utf8')) as { routes: string[] }).routes : Object.keys(ORIGINAL).sort();
	const options = { oldOrigin: origin, newOrigin: origin };
	const conditions = originalConditions(options);
	const writer = new DatasetWriter(dir, { site: 'canary', originalId: '0'.repeat(64), conditions, versions: (await readLock()).producers, routes, runner: 'canary' });
	const env = defaultEnv(origin, { sendWrites: writesAllowed(options) });
	const browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
	try {
		// This script runs in the base checkout too, whose producers may predate writeObserved.
		const write = (produce as { writeObserved?: typeof produce.writeRoute }).writeObserved ?? produce.writeRoute;
		for (const route of routes) await write(writer, route, await produce.observeOriginal(browser, env, route, { viewports: VIEWPORTS, explore: { serves: (path) => isSwitched([route], path) } }));
		await writer.close();
		await commitDataset(dir);
	} finally {
		await browser.close();
		site?.close();
	}
	process.stdout.write(`canary: ${routes.length} routes produced into ${dir}\n`);
} else if (command === 'diff') {
	if (positionals.length !== 4) throw new Error('diff <base run 1> <base run 2> <head run 1> <head run 2>');
	const lock = await readLock();
	const [b0, b1, h0, h1] = await Promise.all(positionals.map((dir) => Dataset.open(resolve(dir), { versions: lock.producers, tables: [] })));
	const routes = b0!.manifest.routes;
	if ([b1, h0, h1].some((d) => JSON.stringify(d!.manifest.routes) !== JSON.stringify(routes))) throw new Error('the four canaries hold other routes');
	const datasets = { base: [b0!, b1!], head: [h0!, h1!] };
	const result = canary(TABLES.filter((t) => t !== 'layout_survey'), (side, run, table) => new Map(routes.flatMap((r) => datasets[side][run]!.rows(table as Table, r).map((row) => [row.key, row.value] as const))));
	const text = `${JSON.stringify(result, null, '\t')}\n`;
	if (values.out) await writeFile(resolve(values.out), text);
	process.stdout.write(text);
	if (result.nondeterministic.length) {
		process.stderr.write(`canary: the producers are not deterministic in ${result.nondeterministic.length} field families, so no change there can be told from noise:\n${result.nondeterministic.map((n) => `  ${n.table} ${n.family} (${n.side}, ${n.rows} rows)`).join('\n')}\n`);
		process.exit(1);
	}
} else {
	process.stderr.write('usage: datasets-canary.ts produce <dir> [--old <origin> --targets <file>] | diff <base 1> <base 2> <head 1> <head 2> [--out <diff.json>]\n');
	process.exit(2);
}
