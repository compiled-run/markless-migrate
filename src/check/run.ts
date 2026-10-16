import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { defaultEnv, isLoopback, pushRecording, tagHeaders, type SideEnv } from './browser.ts';
import { captureHttp, captureRoute, mime } from './capture.ts';
import { readRecording, recordable, slug, writeRecording } from './data.ts';
import { DEFAULT_FREEZE, pinnedBy, pinnedSummary, type FreezeOptions } from './freeze.ts';
import { HINTS } from './hints.ts';
import { negotiationFailures } from './i18n.ts';
import { compareJourneys, explore, replayAll } from './journeys.ts';
import { assetsToProbe, compareRoute, cssTargets, noiseReport, noisyStyles, withFailures, type Probe } from './compare.ts';
import { matchElements } from './match.ts';
import { contractLines } from './network.ts';
import type { SourceFacts } from './source-facts.ts';
import { compareStates, type StateInput } from './states.ts';
import { discoverStates, parseRules } from './stylesheet.ts';
import { renderHtml } from './html.ts';
import { blocker, type BlockList } from './trackers.ts';
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
	/** Clock, seed, timezone and locale pinned in the browser; false loads pages unfrozen. */
	readonly freeze?: Partial<FreezeOptions> | false;
	/** Changes to the shipped tracker block list. */
	readonly block?: BlockList;
	/** Origins marked as staging: writes are sent only when both apps are staging or on this machine. */
	readonly staging?: { readonly old?: boolean; readonly new?: boolean };
	/** What scanning the old app's source found. */
	readonly source?: SourceFacts;
	/** Record OLD's responses per route into dir, or serve them to both apps from there. */
	readonly data?: { readonly mode: 'record' | 'replay'; readonly dir: string };
}

interface Run {
	readonly old: SideEnv;
	readonly new: SideEnv;
	readonly frozen: boolean;
	readonly source?: SourceFacts;
}

async function probe(env: SideEnv, url: string): Promise<Probe> {
	try {
		const response = await fetch(new URL(url, env.origin), { redirect: 'follow', headers: tagHeaders(env) });
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
		const facts = (p: PageCapture) => JSON.stringify([p.aria, p.text, p.seo, p.fonts, p.elements.map((el) => [el.text, el.name, el.style]), p.network ? contractLines(p.network, a.origin) : []]);
		return facts(pa) !== facts(pb) || !pa.screenshot.equals(pb.screenshot);
	});
}

async function negotiate(env: SideEnv, route: string, locales: readonly string[]): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const locale of locales) {
		const http = await captureHttp(env.origin, route, { 'accept-language': locale, ...tagHeaders(env) }).catch(() => undefined);
		out[locale] = http ? http.chain.at(-1)!.url : '(no response)';
	}
	return out;
}

function routeLocales(capture: RouteCapture, known: readonly string[]): string[] {
	const seo = Object.values(capture.pages)[0]?.seo ?? {};
	const found = Object.keys(seo).flatMap((key) => (key.startsWith('hreflang:') && key !== 'hreflang:x-default' ? [key.slice('hreflang:'.length)] : []));
	return [...new Set([...known, ...found, ...(seo['html:lang'] ? [seo['html:lang']] : [])])].sort();
}

/** OLD's captures of the route, so a record run can save what OLD fetched. */
const oldCaptures = new WeakMap<RouteResult, RouteCapture>();

export async function checkRoute(browser: Browser, run: Run, route: string, viewports: readonly Viewport[] = VIEWPORTS, locales: readonly string[] = []): Promise<RouteResult> {
	const oldOrigin = run.old.origin;
	const newOrigin = run.new.origin;
	// The OLD loads must not overlap, or time-based noise (clocks, counters) looks stable; the third comes after NEW so it brackets it in time.
	const oldA = await captureRoute(browser, oldOrigin, route, viewports, run.old);
	const [oldB, next] = await Promise.all([captureRoute(browser, oldOrigin, route, viewports, run.old), captureRoute(browser, newOrigin, route, viewports, run.new)]);
	const olds = [oldA, oldB];
	if (loadsDiffer(oldA, oldB)) olds.push(await captureRoute(browser, oldOrigin, route, viewports, run.old));
	const probes = new Map<string, Probe>();
	for (const url of assetsToProbe(oldA, next)) probes.set(url, await probe(run.new, url));
	const languages = routeLocales(oldA, locales);
	const [negotiatedA, negotiatedB, negotiatedNew] = await Promise.all([negotiate(run.old, route, languages), negotiate(run.old, route, languages), negotiate(run.new, route, languages)]);
	const compared = compareRoute(route, olds, next, probes, run.source?.clients);
	const noise = noiseReport(olds, run.frozen, run.source?.nondeterminism);
	const loadWrites = (Object.values(oldA.pages)[0]?.writes ?? []).map((w) => ({ ...w, during: 'page load' }));
	const result = withFailures(compared, [...compared.failures, ...negotiationFailures(route, languages, [negotiatedA, negotiatedB], negotiatedNew)], { noise, writes: loadWrites });
	const done = await checkJourneys(browser, run, route, viewports[0]!, await checkStates(browser, run, route, viewports, olds, result));
	oldCaptures.set(done, oldA);
	return done;
}

// Explores OLD, then replays every journey on OLD again and on NEW; a third OLD replay confirms noise when the first two differ.
async function checkJourneys(browser: Browser, run: Run, route: string, viewport: Viewport, result: RouteResult): Promise<RouteResult> {
	const journeys = await explore(browser, run.old, route, viewport);
	const recorded = journeys.map((j) => j.expected);
	const [again, next] = await Promise.all([replayAll(browser, run.old, route, viewport, journeys), replayAll(browser, run.new, route, viewport, journeys)]);
	const runs = [recorded, again];
	if (JSON.stringify(recorded) !== JSON.stringify(again)) runs.push(await replayAll(browser, run.old, route, viewport, journeys));
	const writes = journeys.flatMap((j) => j.expected.flatMap((step) => (step.writes ?? []).map((w) => ({ ...w, during: j.name }))));
	return withFailures(result, [...result.failures, ...compareJourneys(route, runs, journeys, next)], { journeys, writes: [...(result.writes ?? []), ...writes] });
}

// Forces every state the OLD stylesheets style, on the first viewport, and names the OLD rule behind each computed-style failure.
async function checkStates(browser: Browser, run: Run, route: string, viewports: readonly Viewport[], olds: readonly RouteCapture[], result: RouteResult): Promise<RouteResult> {
	const oldOrigin = run.old.origin;
	const newOrigin = run.new.origin;
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
		const out = await compareStates({ browser, oldOrigin, newOrigin, envs: { old: run.old, new: run.new }, route, viewport, states: forced, rules, noise, explain });
		failures.push(...out.failures);
		for (const [from, to] of out.explained) explained.set(from, to);
		shots.push(...out.shots);
		checked.push(...out.checked.map((label) => (viewports.length > 1 ? `${label} (${viewport.name})` : label)));
		skipped.push(...out.skipped);
	}
	return withFailures(result, [...result.failures.map((f) => explained.get(f) ?? f), ...failures], { shots: [...result.shots, ...shots], states: { checked, skipped } });
}

/** Writes go out only when both apps are staging or on this machine; otherwise both are held back, so they compare alike. */
export function writesAllowed(options: Pick<CheckOptions, 'oldOrigin' | 'newOrigin' | 'staging'>): boolean {
	return (Boolean(options.staging?.old) || isLoopback(options.oldOrigin)) && (Boolean(options.staging?.new) || isLoopback(options.newOrigin));
}

async function replayRoute(run: Run, dir: string, route: string): Promise<{ run: Run; failures: Failure[] }> {
	const recording = await readRecording(dir, route);
	if (!recording) {
		return { run, failures: [{ route, dimension: 'network', check: 'recorded data', expected: `a recording in ${dir}`, actual: 'none for this route', hint: HINTS.dataMissing }] };
	}
	const replay = { set: randomUUID(), responses: recording.responses };
	const next: Run = { ...run, old: { ...run.old, replay }, new: { ...run.new, replay } };
	const failures: Failure[] = [];
	if (recording.responses.some((r) => r.side === 'server')) {
		for (const [label, env] of [['old', next.old], ['new', next.new]] as const) {
			if (!(await pushRecording(env))) failures.push({ route, dimension: 'network', check: `recorded server responses on ${label.toUpperCase()}`, expected: 'served by the request recorder in the server', actual: 'the server does not run the request recorder, so it fetched live data', hint: HINTS.networkRecorder });
		}
	}
	return { run: next, failures };
}

export async function runCheck(options: CheckOptions): Promise<Report> {
	const startedAt = new Date().toISOString();
	const browser = options.browser ?? (await chromium.launch());
	const freeze: FreezeOptions | false = options.freeze === false ? false : { ...DEFAULT_FREEZE, ...options.freeze };
	const shared = { freeze, block: blocker(options.block), sendWrites: writesAllowed(options), writeFacts: options.source?.writes ?? [] };
	const base: Run = { old: defaultEnv(options.oldOrigin, shared), new: defaultEnv(options.newOrigin, shared), frozen: Boolean(freeze), ...(options.source ? { source: options.source } : {}) };
	try {
		const routes: RouteResult[] = [];
		for (const route of options.routes) {
			const { run, failures } = options.data?.mode === 'replay' ? await replayRoute(base, options.data.dir, route) : { run: base, failures: [] };
			const result = await checkRoute(browser, run, route, options.viewports, options.locales);
			routes.push(failures.length ? withFailures(result, [...failures, ...result.failures]) : result);
			const old = oldCaptures.get(result);
			if (options.data?.mode === 'record' && old) {
				const records = Object.values(old.pages)[0]?.network?.records ?? [];
				await writeRecording(options.data.dir, { route, recordedFrom: options.oldOrigin, at: startedAt, responses: recordable(records) });
			}
		}
		const sources = options.source?.nondeterminism.map((f) => ({ ...f, pinned: pinnedBy(`${f.kind} ${f.what ?? ''}`, f.side, freeze) }));
		return {
			version: 1,
			old: options.oldOrigin,
			new: options.newOrigin,
			startedAt,
			ok: routes.every((r) => r.ok),
			routes,
			pinned: pinnedSummary(freeze),
			...(sources ? { sources } : {}),
			...(options.data ? { data: options.data } : {}),
			writes: shared.sendWrites ? 'sent' : 'held back',
		};
	} finally {
		if (!options.browser) await browser.close();
	}
}

export function jsonReport(report: Report, diffs: Readonly<Record<string, string[]>> = {}) {
	return { ...report, routes: report.routes.map(({ visualDiffs: _, shots: __, journeys, ...route }) => ({ ...route, visualDiffs: diffs[route.route] ?? [], journeys: journeys?.length ?? 0 })) };
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
	for (const route of report.routes) {
		if (!route.journeys?.length) continue;
		await mkdir(join(dir, 'journeys'), { recursive: true });
		await writeFile(join(dir, 'journeys', `${slug(route.route)}.json`), `${JSON.stringify({ route: route.route, origin: report.old, viewport: 'desktop', journeys: route.journeys }, null, '\t')}\n`);
	}
	const path = join(dir, 'report.json');
	await writeFile(path, `${JSON.stringify(jsonReport(report, diffs), null, '\t')}\n`);
	await writeFile(join(dir, 'report.html'), renderHtml(report));
	return path;
}
