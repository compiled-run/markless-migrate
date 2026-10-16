import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { captureRoute, mime } from './capture.ts';
import { assetsToProbe, compareRoute, type Probe } from './compare.ts';
import type { PageCapture, Report, RouteCapture, RouteResult, Viewport } from './types.ts';
import { VIEWPORTS } from './types.ts';

export interface CheckOptions {
	readonly oldOrigin: string;
	readonly newOrigin: string;
	readonly routes: readonly string[];
	readonly viewports?: readonly Viewport[];
	readonly browser?: Browser;
}

async function probe(origin: string, url: string): Promise<Probe> {
	try {
		const response = await fetch(new URL(url, origin), { redirect: 'follow' });
		await response.body?.cancel();
		return { status: response.status, contentType: mime(response.headers.get('content-type')) };
	} catch {
		return { status: 0, contentType: '' };
	}
}

export function loadsDiffer(a: RouteCapture, b: RouteCapture): boolean {
	if (JSON.stringify(a.http) !== JSON.stringify(b.http)) return true;
	return Object.entries(a.pages).some(([viewport, pa]) => {
		const pb = b.pages[viewport];
		if (!pb) return true;
		const facts = (p: PageCapture) => JSON.stringify([p.aria, p.text, p.seo, p.fonts, p.elements.map((el) => [el.text, el.name, el.style])]);
		return facts(pa) !== facts(pb) || !pa.screenshot.equals(pb.screenshot);
	});
}

export async function checkRoute(browser: Browser, oldOrigin: string, newOrigin: string, route: string, viewports: readonly Viewport[] = VIEWPORTS): Promise<RouteResult> {
	// The OLD loads must not overlap, or time-based noise (clocks, counters) looks stable; the third comes after NEW so it brackets it in time.
	const oldA = await captureRoute(browser, oldOrigin, route, viewports);
	const [oldB, next] = await Promise.all([captureRoute(browser, oldOrigin, route, viewports), captureRoute(browser, newOrigin, route, viewports)]);
	const olds = [oldA, oldB];
	if (loadsDiffer(oldA, oldB)) olds.push(await captureRoute(browser, oldOrigin, route, viewports));
	const probes = new Map<string, Probe>();
	for (const url of assetsToProbe(oldA, next)) probes.set(url, await probe(newOrigin, url));
	return compareRoute(route, olds, next, probes);
}

export async function runCheck(options: CheckOptions): Promise<Report> {
	const startedAt = new Date().toISOString();
	const browser = options.browser ?? (await chromium.launch());
	try {
		const routes: RouteResult[] = [];
		for (const route of options.routes) routes.push(await checkRoute(browser, options.oldOrigin, options.newOrigin, route, options.viewports));
		return { version: 1, old: options.oldOrigin, new: options.newOrigin, startedAt, ok: routes.every((r) => r.ok), routes };
	} finally {
		if (!options.browser) await browser.close();
	}
}

function slug(route: string): string {
	return route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
}

export async function writeReport(report: Report, dir: string): Promise<string> {
	await mkdir(dir, { recursive: true });
	const diffs: Record<string, string[]> = {};
	for (const route of report.routes) {
		for (const diff of route.visualDiffs) {
			const file = join(dir, 'diffs', `${slug(route.route)}.${diff.viewport}.png`);
			await mkdir(join(dir, 'diffs'), { recursive: true });
			await writeFile(file, diff.png);
			(diffs[route.route] ??= []).push(file);
		}
	}
	const json = { ...report, routes: report.routes.map(({ visualDiffs: _, ...route }) => ({ ...route, visualDiffs: diffs[route.route] ?? [] })) };
	const path = join(dir, 'report.json');
	await writeFile(path, `${JSON.stringify(json, null, '\t')}\n`);
	return path;
}
