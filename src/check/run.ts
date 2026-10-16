import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { captureHttp, captureRoute, mime } from './capture.ts';
import { negotiationFailures } from './i18n.ts';
import { assetsToProbe, compareRoute, cssTargets, noisyStyles, withFailures, type Probe } from './compare.ts';
import { matchElements } from './match.ts';
import { compareStates, type StateInput } from './states.ts';
import { discoverStates, parseRules } from './stylesheet.ts';
import { renderHtml } from './html.ts';
import type { Failure, PageCapture, Report, RouteCapture, RouteResult, Shot, Viewport } from './types.ts';
import { VIEWPORTS } from './types.ts';

export interface CheckOptions {
	readonly oldOrigin: string;
	readonly newOrigin: string;
	readonly routes: readonly string[];
	readonly viewports?: readonly Viewport[];
	/** Locales the inventory found; each route's own hreflang and lang are added. */
	readonly locales?: readonly string[];
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

async function negotiate(origin: string, route: string, locales: readonly string[]): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const locale of locales) {
		const http = await captureHttp(origin, route, { 'accept-language': locale }).catch(() => undefined);
		out[locale] = http ? http.chain.at(-1)!.url : '(no response)';
	}
	return out;
}

function routeLocales(capture: RouteCapture, known: readonly string[]): string[] {
	const seo = Object.values(capture.pages)[0]?.seo ?? {};
	const found = Object.keys(seo).flatMap((key) => (key.startsWith('hreflang:') && key !== 'hreflang:x-default' ? [key.slice('hreflang:'.length)] : []));
	return [...new Set([...known, ...found, ...(seo['html:lang'] ? [seo['html:lang']] : [])])].sort();
}

export async function checkRoute(browser: Browser, oldOrigin: string, newOrigin: string, route: string, viewports: readonly Viewport[] = VIEWPORTS, locales: readonly string[] = []): Promise<RouteResult> {
	// The OLD loads must not overlap, or time-based noise (clocks, counters) looks stable; the third comes after NEW so it brackets it in time.
	const oldA = await captureRoute(browser, oldOrigin, route, viewports);
	const [oldB, next] = await Promise.all([captureRoute(browser, oldOrigin, route, viewports), captureRoute(browser, newOrigin, route, viewports)]);
	const olds = [oldA, oldB];
	if (loadsDiffer(oldA, oldB)) olds.push(await captureRoute(browser, oldOrigin, route, viewports));
	const probes = new Map<string, Probe>();
	for (const url of assetsToProbe(oldA, next)) probes.set(url, await probe(newOrigin, url));
	const languages = routeLocales(oldA, locales);
	const [negotiatedA, negotiatedB, negotiatedNew] = await Promise.all([negotiate(oldOrigin, route, languages), negotiate(oldOrigin, route, languages), negotiate(newOrigin, route, languages)]);
	const compared = compareRoute(route, olds, next, probes);
	const result = withFailures(compared, [...compared.failures, ...negotiationFailures(route, languages, [negotiatedA, negotiatedB], negotiatedNew)]);
	return checkStates(browser, oldOrigin, newOrigin, route, viewports, olds, result);
}

// Forces every state the OLD stylesheets style, on the first viewport, and names the OLD rule behind each computed-style failure.
async function checkStates(browser: Browser, oldOrigin: string, newOrigin: string, route: string, viewports: readonly Viewport[], olds: readonly RouteCapture[], result: RouteResult): Promise<RouteResult> {
	const first = viewports[0]!;
	const sources = olds[0]!.pages[first.name]?.stylesheets ?? [];
	const states = discoverStates(sources);
	const rules = parseRules(sources);
	const failures: Failure[] = [];
	const explained = new Map<Failure, Failure>();
	const shots: Shot[] = [];
	const checked: string[] = [];
	const skipped: string[] = [];
	for (const viewport of viewports) {
		const a = olds[0]!.pages[viewport.name];
		if (!a) continue;
		const others = olds.slice(1).map((o) => o.pages[viewport.name]!).filter(Boolean);
		const explain = result.failures.flatMap((failure) => {
			const target = failure.viewport === viewport.name ? cssTargets.get(failure) : undefined;
			return target ? [{ failure, ...target }] : [];
		});
		const forced = viewport === first ? states : [];
		if (!forced.length && !explain.length) continue;
		const styleNoise = noisyStyles(a.elements, others.map((o) => o.elements));
		const textNoise = new Set(others.flatMap((o) => [...matchElements(a.elements, o.elements)].filter(([i, j]) => a.elements[i]!.text !== o.elements[j]!.text).map(([i]) => i)));
		const noise = a.elements.flatMap((element, i): StateInput['noise'][number][] => (textNoise.has(i) ? [{ element, props: 'text' }] : styleNoise.get(i)?.size ? [{ element, props: styleNoise.get(i)! }] : []));
		const out = await compareStates({ browser, oldOrigin, newOrigin, route, viewport, states: forced, rules, noise, explain });
		failures.push(...out.failures);
		for (const [from, to] of out.explained) explained.set(from, to);
		shots.push(...out.shots);
		checked.push(...out.checked.map((label) => (viewports.length > 1 ? `${label} (${viewport.name})` : label)));
		skipped.push(...out.skipped);
	}
	return withFailures(result, [...result.failures.map((f) => explained.get(f) ?? f), ...failures], { shots: [...result.shots, ...shots], states: { checked, skipped } });
}

export async function runCheck(options: CheckOptions): Promise<Report> {
	const startedAt = new Date().toISOString();
	const browser = options.browser ?? (await chromium.launch());
	try {
		const routes: RouteResult[] = [];
		for (const route of options.routes) routes.push(await checkRoute(browser, options.oldOrigin, options.newOrigin, route, options.viewports, options.locales));
		return { version: 1, old: options.oldOrigin, new: options.newOrigin, startedAt, ok: routes.every((r) => r.ok), routes };
	} finally {
		if (!options.browser) await browser.close();
	}
}

function slug(route: string): string {
	return route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
}

export function jsonReport(report: Report, diffs: Readonly<Record<string, string[]>> = {}) {
	return { ...report, routes: report.routes.map(({ visualDiffs: _, shots: __, ...route }) => ({ ...route, visualDiffs: diffs[route.route] ?? [] })) };
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
	const path = join(dir, 'report.json');
	await writeFile(path, `${JSON.stringify(jsonReport(report, diffs), null, '\t')}\n`);
	await writeFile(join(dir, 'report.html'), renderHtml(report));
	return path;
}
