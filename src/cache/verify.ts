import { chromium, type Browser } from 'playwright';
import { assetPaths } from '../switch/deploy.ts';
import type { CacheClass, RouteCaching } from './classify.ts';
import { fetchFacts, fetchPage, type ResponseFacts } from './evidence.ts';
import { isContentHashed, longLived, parseCacheControl, staleForever } from './headers.ts';

export type CachingProblem =
	/** A response the route's class says is personal was answered from, or offered to, a shared cache. */
	| 'cached-personal'
	/** A response that sets a cookie was answered from, or offered to, a shared cache. */
	| 'cached-set-cookie'
	/** The page answers a fragment request differently but its Vary does not name the header, or the CDN served one for the other. */
	| 'missing-vary'
	/** An HTML page a browser or CDN may keep without asking long after its data changed. */
	| 'stale-forever'
	/** A page the same for every visitor that the CDN does not keep. */
	| 'uncached-static'
	/** A cached page whose fragment URL, which the router fetches on every prefetch and navigation, the CDN does not keep. */
	| 'uncached-fragment'
	/** Cached on the old site, not on the new one. */
	| 'worse-than-old'
	/** A content-hashed file that browsers are not told to keep. */
	| 'short-lived-asset';

export interface CachingFinding {
	readonly route: string;
	readonly problem: CachingProblem;
	readonly detail: string;
}

/** What the new deployment did with one route over the passes. */
export interface RouteObservation {
	readonly route: string;
	readonly class: CacheClass;
	readonly passes: readonly ResponseFacts[];
	/** The answer to a fragment request, and the document fetched straight after it. */
	readonly fragment?: { readonly response: ResponseFacts; readonly documentAfter: ResponseFacts };
	/** The answers to the page's fragment URL over the passes. */
	readonly fragmentPasses?: readonly ResponseFacts[];
	/** Function invocations a new visitor's page view caused after the passes: every same-origin response the browser loaded. */
	readonly invocations?: number;
}

export interface CachingReport {
	readonly origin: string;
	readonly checkedAt: string;
	readonly routes: readonly RouteObservation[];
	readonly findings: readonly CachingFinding[];
	readonly numbers: CachingNumbers;
}

export interface CachingNumbers {
	readonly routes: number;
	readonly byClass: Record<CacheClass, number>;
	/** HTML GETs on the second pass a CDN answered (HIT, STALE or PRERENDER), as a share. */
	readonly secondPassHitRate: number;
	/** Function invocations per page view by a new visitor, after the passes, averaged. */
	readonly invocationsPerView: number;
	/** Median time to the response headers, first and second pass, in ms. */
	readonly ttfbFirstMs: number;
	readonly ttfbSecondMs: number;
}

const SERVED_BY_CDN = new Set(['hit', 'stale', 'prerender']);

export const servedByCdn = (f: ResponseFacts) => (f.cdn ? SERVED_BY_CDN.has(f.cdn.status) : false);

/** A response the host may hand to other visitors: the CDN answered it, or its headers let a shared cache keep it. */
export function shareable(f: ResponseFacts): boolean {
	if (servedByCdn(f)) return true;
	const cc = parseCacheControl(f.cacheControl);
	if (cc.private || cc.noStore) return false;
	return (cc.sMaxAge ?? 0) > 0 || (cc.public === true && (cc.maxAge ?? 0) > 0);
}

/** Whether serving this response ran a function on Vercel: a cache miss or bypass whose id names a function region. */
export function invoked(f: ResponseFacts): boolean {
	return f.cdn?.vendor === 'vercel' && ranFunction(f.cdn.raw, f.vercelId);
}

const ranFunction = (cache: string | undefined, id: string | undefined) => Boolean(cache) && !SERVED_BY_CDN.has(cache!.toLowerCase()) && (id ?? '').split('::').length >= 3;

export const median = (values: readonly number[]) => {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

/** Problems with one route's caching on the new app, from what it answered. Pure: the evidence decides. */
export function judgeRoute(planned: RouteCaching, observed: RouteObservation, fragmentHeader?: string): CachingFinding[] {
	const out: CachingFinding[] = [];
	const route = planned.route;
	const add = (problem: CachingProblem, detail: string) => out.push({ route, problem, detail });
	const passes = observed.passes;
	const last = passes.at(-1)!;
	if (last.status !== 200) return out;
	const html = /html/.test(last.contentType);
	if (planned.class === 'no-cache') {
		const shared = passes.find(shareable);
		if (shared) add('cached-personal', `never cached by the plan (${planned.reasons[0]}), but the new app answered ${shared.cdn ? `x-vercel-cache: ${shared.cdn.raw}` : `Cache-Control: ${shared.cacheControl}`}`);
		else if (planned.old.shared) add('worse-than-old', `the old site's CDN kept it (${planned.old.cdn ?? planned.old.cacheControl}), but the new page cannot be shared: ${planned.reasons[0]}`);
	}
	const cookie = passes.find((p) => p.setCookies.length && shareable(p));
	if (cookie) add('cached-set-cookie', `sets ${cookie.setCookies.join(', ')} on a response a shared cache keeps (${cookie.cdn?.raw ?? cookie.cacheControl})`);
	if (html) {
		const cc = parseCacheControl(last.cacheControl);
		if (cc.immutable || (cc.maxAge ?? 0) >= 86_400) add('stale-forever', `HTML with Cache-Control: ${last.cacheControl}: browsers keep it without asking`);
		else if (planned.class === 'isr' && staleForever(cc)) add('stale-forever', `its data changes (${planned.reasons[0]}) but Cache-Control: ${last.cacheControl} keeps it until the next deploy`);
	}
	if (planned.class !== 'no-cache') {
		const later = passes.slice(1);
		if (later.length && !later.some(servedByCdn)) {
			const what = later.map((p) => p.cdn?.raw ?? 'no CDN header').join(', ');
			if (planned.old.shared) add('worse-than-old', `the old site's CDN kept it (${planned.old.cdn ?? planned.old.cacheControl}); the new app answered ${what} on every later request`);
			else add('uncached-static', `the same for every visitor (${planned.reasons[0]}), but the new app answered ${what} on every later request`);
		}
	}
	const fragmentLater = observed.fragmentPasses?.slice(1) ?? [];
	if (planned.class !== 'no-cache' && html && fragmentLater.length && fragmentLater.every((p) => p.status === 200) && !fragmentLater.some(servedByCdn)) {
		add('uncached-fragment', `the page is cached, but its fragment URL answered ${fragmentLater.map((p) => p.cdn?.raw ?? 'no CDN header').join(', ')} on every later request: each prefetch and in-place navigation runs a function`);
	}
	if (fragmentHeader && observed.fragment && html) {
		const doc = passes.at(-1)!;
		const { response, documentAfter } = observed.fragment;
		const differs = response.bodyHash !== doc.bodyHash;
		if (!last.vary.includes(fragmentHeader.toLowerCase()) && differs) add('missing-vary', `answers a ${fragmentHeader} request with a different body but Vary is "${last.vary.join(', ')}"`);
		if (!differs && servedByCdn(response)) add('missing-vary', `a ${fragmentHeader} request got the cached document (${response.cdn?.raw}): the CDN keeps one entry for both`);
		if (documentAfter.bodyHash !== doc.bodyHash && documentAfter.bodyHash === response.bodyHash) add('missing-vary', `the document request after a ${fragmentHeader} request got the fragment (${documentAfter.cdn?.raw}): the CDN keeps one entry for both`);
	}
	return out;
}

/** Same-origin content-hashed files the page loads that browsers are not told to keep. */
async function assetFindings(origin: string, route: string, html: string, oldLongLived: ReadonlySet<string>): Promise<CachingFinding[]> {
	const out: CachingFinding[] = [];
	for (const path of assetPaths(html, origin).filter(isContentHashed).slice(0, 40)) {
		const facts = await fetchFacts(new URL(path, origin).href).catch(() => undefined);
		if (!facts || facts.status !== 200) continue;
		const cc = parseCacheControl(facts.cacheControl);
		if (!longLived(cc)) out.push({ route, problem: 'short-lived-asset', detail: `${path}: Cache-Control: ${facts.cacheControl ?? '(none)'}${oldLongLived.has(path) ? ' (the old site let browsers keep it)' : ''}` });
	}
	return out;
}

/** Function invocations one page view by a new visitor causes: every same-origin response the browser loads, in a fresh context. */
async function pageInvocations(browser: Browser, url: string): Promise<number> {
	const context = await browser.newContext();
	let n = 0;
	try {
		const page = await context.newPage();
		const origin = new URL(url).origin;
		page.on('response', (response) => {
			if (new URL(response.url()).origin !== origin) return;
			const h = response.headers();
			if (ranFunction(h['x-vercel-cache'], h['x-vercel-id'])) n++;
		});
		await page.goto(url, { waitUntil: 'load' });
		await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
	} finally {
		await context.close();
	}
	return n;
}

async function facts(url: string, headers: Record<string, string> = {}): Promise<{ facts: ResponseFacts; html: string }> {
	const got = await fetchPage(url, headers);
	return { facts: got.facts, html: got.body };
}

export interface VerifyOptions {
	readonly fragmentHeader?: string;
	readonly fragmentPath?: string;
	/** Requests per route after the first (default 2): the first may be a miss, the later ones show the CDN keeping it. */
	readonly passes?: number;
	readonly gapMs?: number;
	readonly assets?: boolean;
	/** Load each page in a browser to count the function invocations a view causes (default true). */
	readonly pageViews?: boolean;
	/** Routes read at once (default 4). */
	readonly concurrency?: number;
}

/** Reads the new deployment's caching route by route and judges it against the plan. */
export async function verifyCaching(origin: string, planned: readonly RouteCaching[], options: VerifyOptions = {}, oldHashed: readonly { path: string; longLived: boolean }[] = []): Promise<CachingReport> {
	const routes: RouteObservation[] = [];
	const findings: CachingFinding[] = [];
	const oldLong = new Set(oldHashed.filter((a) => a.longLived).map((a) => a.path));
	let assetsChecked = false;
	const browser = options.pageViews === false ? undefined : await chromium.launch();
	const one = async (p: RouteCaching): Promise<RouteObservation> => {
		const url = new URL(p.route, origin).href;
		const passes: ResponseFacts[] = [];
		let html = '';
		for (let i = 0; i <= (options.passes ?? 2); i++) {
			if (i) await new Promise((r) => setTimeout(r, options.gapMs ?? 800));
			const got = await facts(url);
			passes.push(got.facts);
			html = got.html;
		}
		let fragment: RouteObservation['fragment'];
		if (options.fragmentHeader && p.html) {
			const response = (await facts(url, { [options.fragmentHeader]: '1' })).facts;
			const documentAfter = (await facts(url)).facts;
			fragment = { response, documentAfter };
		}
		const fragmentPasses: ResponseFacts[] = [];
		if (options.fragmentPath && p.html) {
			const fragmentUrl = new URL(`${options.fragmentPath}${new URL(url).pathname}`, origin).href;
			for (let i = 0; i <= (options.passes ?? 2); i++) {
				if (i) await new Promise((r) => setTimeout(r, options.gapMs ?? 800));
				fragmentPasses.push((await facts(fragmentUrl)).facts);
			}
		}
		const last = passes.at(-1)!;
		const invocations = browser && /html/.test(last.contentType) ? await pageInvocations(browser, url) : invoked(last) ? 1 : 0;
		if (options.assets !== false && !assetsChecked && /html/.test(last.contentType)) {
			assetsChecked = true;
			findings.push(...(await assetFindings(origin, p.route, html, oldLong)));
		}
		return { route: p.route, class: p.class, passes, ...(fragment ? { fragment } : {}), ...(fragmentPasses.length ? { fragmentPasses } : {}), invocations };
	};
	const todo = planned.filter((r) => r.status === 200);
	const observed: RouteObservation[] = new Array(todo.length);
	let next = 0;
	try {
		await Promise.all(
			Array.from({ length: Math.min(options.concurrency ?? 4, todo.length) }, async () => {
				while (next < todo.length) {
					const i = next++;
					observed[i] = await one(todo[i]!);
				}
			}),
		);
	} finally {
		await browser?.close();
	}
	for (const [i, o] of observed.entries()) {
		routes.push(o);
		findings.push(...judgeRoute(todo[i]!, o, options.fragmentHeader));
	}
	return { origin, checkedAt: new Date().toISOString(), routes, findings, numbers: numbersOf(routes) };
}

export function numbersOf(routes: readonly RouteObservation[]): CachingNumbers {
	const byClass: Record<CacheClass, number> = { prerender: 0, isr: 0, 'no-cache': 0 };
	for (const r of routes) byClass[r.class]++;
	const htmlSecond = routes.map((r) => r.passes[1]).filter((f): f is ResponseFacts => Boolean(f && /html/.test(f.contentType)));
	const views = routes.filter((r) => r.invocations !== undefined);
	return {
		routes: routes.length,
		byClass,
		secondPassHitRate: htmlSecond.length ? htmlSecond.filter(servedByCdn).length / htmlSecond.length : 0,
		invocationsPerView: views.length ? views.reduce((n, r) => n + r.invocations!, 0) / views.length : 0,
		ttfbFirstMs: median(routes.map((r) => r.passes[0]!.ttfbMs)),
		ttfbSecondMs: median(routes.map((r) => r.passes[1]?.ttfbMs ?? r.passes[0]!.ttfbMs)),
	};
}

const LABEL: Record<CachingProblem, string> = {
	'cached-personal': 'a personal page is cached',
	'cached-set-cookie': 'a response setting a cookie is cached',
	'missing-vary': 'fragment and document share a cache entry',
	'stale-forever': 'HTML kept long after it changes',
	'uncached-static': 'a static page the CDN does not keep',
	'uncached-fragment': 'a cached page whose fragment the CDN does not keep',
	'worse-than-old': 'cached on the old site, not on the new',
	'short-lived-asset': 'a content-hashed file not kept by browsers',
};

export function summarizeCachingReport(report: CachingReport): string {
	const n = report.numbers;
	const lines = [
		`Caching on ${report.origin}: ${n.routes} routes (prerender ${n.byClass.prerender}, revalidated ${n.byClass.isr}, never cached ${n.byClass['no-cache']})`,
		`  CDN hit rate on the second pass ${Math.round(n.secondPassHitRate * 100)}%, ${n.invocationsPerView.toFixed(2)} function invocations per page view, TTFB median ${n.ttfbFirstMs} ms first, ${n.ttfbSecondMs} ms second`,
	];
	if (!report.findings.length) lines.push('  no caching problems');
	for (const f of report.findings) lines.push(`  red  ${f.route}: ${LABEL[f.problem]}: ${f.detail}`);
	return `${lines.join('\n')}\n`;
}
