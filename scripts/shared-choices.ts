// The pipeline's shared job: `shared-choices.ts <origin> <app> <part> <parts> [concurrency]` (RECORD_KEYS: the run's
// record-keys.json) records a site-wide palette's
// choices once, beside the capture shards, so no shard and not the emit chooses them. It opens the controls outside each
// page's main content on the first page of every path group, keeps those whose choices are every page's (sharedChoices),
// and records its part of them (every parts-th, by first appearance) under
// .migrate/convert/shared-choices/<record key of the page chosen on>/, which convert reads before choosing itself.
// `shared-choices.ts held <store> <record-keys.json>` prints whether a store already holds all of it.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { captureChoices, sharedChoices, shownFile } from '../src/convert/choices.ts';
import { eachLimited, limiter } from '../src/convert/limit.ts';
import { fetchRecordKey, recorderVersions } from '../src/convert/record-key.ts';
import { captureReveals, type Reveal } from '../src/convert/reveal.ts';
import { pageRoutes } from './convert-shards.ts';

// A site's chrome: the controls outside the page's main content (a header's search), as reveal finds ARIA-marked ones.
const CHROME: readonly (readonly [string, 'click'])[] = [['[aria-expanded="false"]:not([aria-disabled="true"]):not([disabled]):not(main *)', 'click']];

/** The first page of each group of pages under one parent path, in the inventory's order. */
export function samplePages(routes: readonly string[]): string[] {
	const groups = new Map<string, string>();
	for (const route of routes) {
		const path = route.split(/[?#]/)[0]!.replace(/\/$/, '');
		const parent = path.slice(0, path.lastIndexOf('/')) || '/';
		if (!groups.has(parent)) groups.set(parent, route);
	}
	return [...groups.values()];
}

export interface SharedControl {
	readonly route: string;
	readonly reveal: Reveal;
	readonly file: string;
}

/** Each distinct site-wide control over the options it shows, on the first sampled page that shows it. */
export function sharedControls(found: readonly { readonly route: string; readonly reveals: readonly Reveal[] }[]): SharedControl[] {
	const out = new Map<string, SharedControl>();
	for (const { route, reveals } of found) for (const reveal of reveals) if (sharedChoices(reveal) && !out.has(shownFile(reveal))) out.set(shownFile(reveal), { route, reveal, file: shownFile(reveal) });
	return [...out.values()];
}

/** Each sampled page's recording key: the run's own (pipeline record-keys.json), else asked of the old site. */
async function keysOf(origin: string, routes: readonly string[], file?: string): Promise<Map<string, string>> {
	const given = file ? (JSON.parse(await readFile(file, 'utf8')) as Record<string, string>) : {};
	const versions = routes.some((r) => !given[r]) ? await recorderVersions() : undefined;
	return new Map(await Promise.all(routes.map(async (route) => [route, given[route] ?? (await fetchRecordKey(versions!, origin, route))] as const)));
}

/** Whether `store` holds every sampled page's chrome and the choices of every site-wide control it showed, under these keys. */
export async function sharedHeld(store: string, keysFile: string): Promise<boolean> {
	const keys = JSON.parse(await readFile(keysFile, 'utf8')) as Record<string, string>;
	const routes = samplePages(Object.keys(keys));
	const root = join(store, 'shared-choices');
	const found: { route: string; reveals: Reveal[] }[] = [];
	for (const route of routes) {
		const kept = join(root, keys[route] ?? '-', 'chrome.json');
		if (!existsSync(kept)) return false;
		found.push(JSON.parse(await readFile(kept, 'utf8')) as { route: string; reveals: Reveal[] });
	}
	return sharedControls(found).every((c) => existsSync(join(root, keys[c.route]!, c.file)));
}

export async function recordShared(o: { readonly origin: string; readonly app: string; readonly part: number; readonly parts: number; readonly width?: number; readonly keys?: string; readonly log?: (line: string) => void }): Promise<readonly SharedControl[]> {
	const { origin, app, part, parts } = o;
	const limit = limiter(o.width ?? 6);
	const log = o.log ?? ((line: string) => console.log(line));
	const state = join(app, '.migrate');
	// The run's pages, as keyed for it (a run of some routes samples those only), else every page the plan found.
	const pages = o.keys ? Object.keys(JSON.parse(await readFile(o.keys, 'utf8')) as Record<string, string>) : pageRoutes(JSON.parse(await readFile(join(state, 'inventory.json'), 'utf8')));
	const routes = samplePages(pages);
	const root = join(state, 'convert', 'shared-choices');
	const keys = await keysOf(origin, routes, o.keys);
	const scratch = await mkdtemp(join(tmpdir(), 'shared-choices-'));
	const browser = await chromium.launch();
	try {
		const found = await eachLimited(limit, routes, async (route) => {
			const kept = join(root, keys.get(route)!, 'chrome.json');
			if (existsSync(kept)) return JSON.parse(await readFile(kept, 'utf8')) as { route: string; reveals: Reveal[] };
			const { reveals } = await captureReveals(browser, origin, route, scratch, undefined, [], { controls: CHROME, tag: 'chrome:' });
			const seen = { route, reveals: reveals.filter(sharedChoices) };
			// One part writes what the pages' chrome showed, so the parts' outputs never hold two copies of it.
			if (part === 0) {
				await mkdir(join(root, keys.get(route)!), { recursive: true });
				await writeFile(kept, JSON.stringify(seen));
			}
			return seen;
		});
		const controls = sharedControls(found);
		const mine = controls.filter((_, i) => i % parts === part);
		log(`shared controls: ${controls.length} on ${routes.length} sampled pages; part ${part + 1}/${parts} records ${mine.map((c) => `${c.file} (${c.route})`).join(', ') || 'none'}`);
		// Every control is recorded or the part fails; its pages slot under the shared limit.
		const results = await Promise.allSettled(mine.map(async (c) => captureChoices(browser, origin, c.route, c.reveal, join(root, keys.get(c.route)!), log, limit)));
		const failed = results.flatMap((r) => (r.status === 'rejected' ? [String((r.reason as Error).message ?? r.reason)] : []));
		if (failed.length) throw new Error(failed.join('\n'));
		return mine;
	} finally {
		await browser.close();
		await rm(scratch, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	if (args[0] === 'held') {
		const [, store, keys] = args;
		if (!store || !keys) throw new Error('usage: shared-choices.ts held <store> <record-keys.json>');
		console.log(String(await sharedHeld(store, keys)));
		return;
	}
	const [origin, app, part, parts, width] = args;
	if (!origin || !app || !part || !parts) throw new Error('usage: shared-choices.ts <origin> <app> <part> <parts> [concurrency]   (RECORD_KEYS=<record-keys.json>)');
	await recordShared({ origin, app, part: Number(part), parts: Number(parts), ...(width ? { width: Number(width) } : {}), ...(process.env.RECORD_KEYS ? { keys: process.env.RECORD_KEYS } : {}) });
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
