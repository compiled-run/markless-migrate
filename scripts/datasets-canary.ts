#!/usr/bin/env node
// The canary of datasets.lock (design §3.2, §8): the original's tables produced by this checkout's producers on a fixed set
// of pages, so two checkouts' rows can be compared and a producer change told apart from a change of what it records.
//   node scripts/datasets-canary.ts produce <dir> [--old <origin> --targets <file>]
//       without --old, the bug corpus's micro-site, served here
//   node scripts/datasets-canary.ts diff <a> <b> [--out <diff.json>]
//       per table: alike, or the rows only one holds and the first facts that differ (real-clock fields left out)
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
import { diffTable, same } from '../src/data/original/canary.ts';
import { TABLES } from '../src/data/original/dataset.ts';
import { readLock } from '../src/data/original/lock.ts';
import { observeOriginal, writeRoute } from '../src/data/original/produce.ts';
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
		for (const route of routes) await writeRoute(writer, route, await observeOriginal(browser, env, route, { viewports: VIEWPORTS, explore: { serves: (path) => isSwitched([route], path) } }));
		await writer.close();
		await commitDataset(dir);
	} finally {
		await browser.close();
		site?.close();
	}
	process.stdout.write(`canary: ${routes.length} routes produced into ${dir}\n`);
} else if (command === 'diff') {
	const open = async (dir: string) => {
		const lock = await readLock();
		return Dataset.open(resolve(dir), { versions: lock.producers, tables: [] });
	};
	const [a, b] = await Promise.all([open(positionals[0]!), open(positionals[1]!)]);
	const tables: Record<string, { same: boolean; summary: string }> = {};
	const origins = [a.manifest.routes, b.manifest.routes];
	if (JSON.stringify(origins[0]) !== JSON.stringify(origins[1])) throw new Error('the two canaries hold other routes');
	for (const t of TABLES) {
		const rows = (d: Dataset) => new Map(d.manifest.routes.flatMap((r) => (t === 'layout_survey' ? [] : d.rows(t, r).map((row) => [row.key, row.value] as const))));
		const diff = diffTable(rows(a), rows(b));
		tables[t] = { same: same(diff), summary: same(diff) ? 'alike' : `${diff.onlyA.length} rows only before, ${diff.onlyB.length} only after, ${diff.differing.length} differing${diff.differing[0] ? `, first ${diff.differing[0].key.split('\u0000').join(' | ')} at ${diff.differing[0].differences.slice(0, 3).map((d) => d.path).join(', ')}` : ''}` };
	}
	const text = `${JSON.stringify({ tables }, null, '\t')}\n`;
	if (values.out) await writeFile(resolve(values.out), text);
	process.stdout.write(text);
} else {
	process.stderr.write('usage: datasets-canary.ts produce <dir> [--old <origin> --targets <file>] | diff <a> <b> [--out <diff.json>]\n');
	process.exit(2);
}
