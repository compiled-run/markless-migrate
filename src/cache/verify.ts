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
	/** The page answers a fragment request differently but its Vary does not name the header. */
	| 'missing-vary'
	/** A document request answered with a fragment, or a fragment request with a document. */
	| 'wrong-body'
	/** A page that reads the query answered without the value it was asked for, or with another value's. */
	| 'query-not-rendered'
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
	/** After the cache entries expired (or in fresh entries): the fragment asked for first, then the document twice, and the reverse. */
	readonly orders?: { readonly fragmentFirst: readonly Probe[]; readonly documentFirst: readonly Probe[] };
	/** For a page that reads the query: one probe per value asked for. */
	readonly query?: readonly QueryProbe[];
	/** Function invocations a new visitor's page view caused after the passes: every same-origin response the browser loaded. */
	readonly invocations?: number;
}

/** One request of an order probe: what was asked for and what came back. */
export interface Probe {
	readonly asked: 'fragment' | 'document';
	readonly response: ResponseFacts;
}

export interface QueryProbe {
	readonly key: string;
	readonly value: string;
	/** The document and, where the router fetches fragments by path, the fragment URL, each asked twice. */
	readonly responses: readonly { readonly url: string; readonly facts: ResponseFacts; readonly rendered: boolean }[];
	/** The old site's page for the same URL shows the value: the port must too. */
	readonly oldRendered?: boolean;
	/** A response that showed another probe's value. */
	readonly otherValue?: string;
}

export interface CachingReport {
	readonly origin: string;
	readonly checkedAt: string;
	readonly routes: readonly RouteObservation[];
	readonly findings: readonly CachingFinding[];
	readonly numbers: CachingNumbers;
	/** What the check could not test, and why. */
	readonly notes: readonly string[];
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
		if (!last.vary.includes(fragmentHeader.toLowerCase()) && observed.fragment.response.bodyHash !== doc.bodyHash) add('missing-vary', `answers a ${fragmentHeader} request with a different body but Vary is "${last.vary.join(', ')}"`);
	}
	if (html) {
		type Asked = [Probe['asked'], ResponseFacts, string];
		const checked: Asked[] = [
			...passes.map((f, i): Asked => ['document', f, `pass ${i + 1}`]),
			...(observed.fragmentPasses ?? []).map((f, i): Asked => ['fragment', f, `fragment URL pass ${i + 1}`]),
			...(observed.fragment ? [['fragment', observed.fragment.response, `the ${fragmentHeader}: 1 request`] as Asked, ['document', observed.fragment.documentAfter, `the document after the ${fragmentHeader}: 1 request`] as Asked] : []),
			...(['fragmentFirst', 'documentFirst'] as const).flatMap((order) => (observed.orders?.[order] ?? []).map((p, i): Asked => [p.asked, p.response, `${order === 'fragmentFirst' ? 'fragment' : 'document'} first after expiry, request ${i + 1}`])),
		];
		const wrong = new Map<Probe['asked'], { first: string; n: number }>();
		for (const [asked, f, when] of checked) {
			if (f.status !== 200 || f.fragmentBody === undefined || f.fragmentBody === (asked === 'fragment')) continue;
			const seen = wrong.get(asked);
			if (seen) seen.n++;
			else wrong.set(asked, { first: `${when}: a ${asked} request got ${asked === 'fragment' ? 'the document' : 'a fragment'} (${f.cdn?.raw ?? 'no CDN header'})`, n: 1 });
		}
		for (const { first, n } of wrong.values()) add('wrong-body', `${first}${n > 1 ? `, and ${n - 1} more` : ''}`);
	}
	for (const q of observed.query ?? []) {
		const missing = q.responses.find((r) => r.facts.status === 200 && !r.rendered);
		if (q.otherValue) add('query-not-rendered', `?${q.key}=${q.value} was answered with the page for ${q.key}=${q.otherValue}: the CDN keeps one entry for both values`);
		else if (missing && q.oldRendered) add('query-not-rendered', `${missing.url} does not show ${q.value}, which the old site's page for it does (${missing.facts.cdn?.raw ?? 'no CDN header'}): the page did not get its query`);
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
		// A view that never reaches load still counts what it ran; one slow page must not end the check.
		await page.goto(url, { waitUntil: 'load', timeout: 30_000 }).catch(() => {});
		await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
	} finally {
		await context.close();
	}
	return n;
}

export interface VerifyOptions {
	readonly fragmentHeader?: string;
	readonly fragmentPath?: string;
	/** The comments the router ends a fragment response with: each response is told fragment or document by them. */
	readonly fragmentMarkers?: readonly string[];
	/** The old site, asked the same query URLs: a value its page shows, the port's must show too. */
	readonly oldOrigin?: string;
	/** Requests per route after the first (default 2): the first may be a miss, the later ones show the CDN keeping it. */
	readonly passes?: number;
	readonly gapMs?: number;
	readonly assets?: boolean;
	/** Load each page in a browser to count the function invocations a view causes (default true). */
	readonly pageViews?: boolean;
	/** Routes read at once (default 4). */
	readonly concurrency?: number;
	/** Longest revalidation the check waits out to ask for fragment and document in both orders after expiry, in seconds (default 130; 0 skips the wait). */
	readonly expiryWaitS?: number;
	/** Routes on ISR with revalidation whose expiry is waited out (default 3, all waited out at once). */
	readonly expiryRoutes?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PROBE_KEY = '__mm_cache_probe';

/** Reads the new deployment's caching route by route and judges it against the plan. */
export async function verifyCaching(origin: string, planned: readonly RouteCaching[], options: VerifyOptions = {}, oldHashed: readonly { path: string; longLived: boolean }[] = []): Promise<CachingReport> {
	const routes: RouteObservation[] = [];
	const findings: CachingFinding[] = [];
	const notes: string[] = [];
	const oldLong = new Set(oldHashed.filter((a) => a.longLived).map((a) => a.path));
	const markers = options.fragmentMarkers ?? [];
	const fetchOne = async (url: string, headers: Record<string, string> = {}): Promise<{ facts: ResponseFacts; html: string }> => {
		const got = await fetchPage(url, headers);
		const fragmentBody = markers.length && /html/.test(got.facts.contentType) ? markers.some((m) => got.body.trimEnd().endsWith(m)) : undefined;
		return { facts: { ...got.facts, ...(fragmentBody !== undefined ? { fragmentBody } : {}) }, html: got.body };
	};
	const fragmentUrl = (url: string) => (options.fragmentPath ? new URL(`${options.fragmentPath}${new URL(url).pathname}${new URL(url).search}`, origin).href : undefined);
	const ask = async (asked: Probe['asked'], url: string): Promise<Probe> => {
		if (asked === 'document') return { asked, response: (await fetchOne(url)).facts };
		const byPath = fragmentUrl(url);
		return { asked, response: (await fetchOne(byPath ?? url, byPath ? {} : { [options.fragmentHeader!]: '1' })).facts };
	};
	const order = async (url: string, first: Probe['asked']): Promise<Probe[]> => {
		const second = first === 'fragment' ? 'document' : 'fragment';
		const out = [await ask(first, url)];
		await sleep(options.gapMs ?? 800);
		out.push(await ask(second, url));
		await sleep(options.gapMs ?? 800);
		out.push(await ask(second, url));
		return out;
	};
	const fragments = Boolean(options.fragmentPath || options.fragmentHeader);
	let assetsChecked = false;
	const browser = options.pageViews === false ? undefined : await chromium.launch();
	const one = async (p: RouteCaching): Promise<RouteObservation> => {
		const url = new URL(p.route, origin).href;
		const passes: ResponseFacts[] = [];
		let html = '';
		for (let i = 0; i <= (options.passes ?? 2); i++) {
			if (i) await sleep(options.gapMs ?? 800);
			const got = await fetchOne(url);
			passes.push(got.facts);
			html = got.html;
		}
		let fragment: RouteObservation['fragment'];
		if (options.fragmentHeader && !options.fragmentPath && p.html) {
			const response = (await fetchOne(url, { [options.fragmentHeader]: '1' })).facts;
			const documentAfter = (await fetchOne(url)).facts;
			fragment = { response, documentAfter };
		}
		const fragmentPasses: ResponseFacts[] = [];
		const byPath = fragmentUrl(url);
		if (byPath && p.html) {
			for (let i = 0; i <= (options.passes ?? 2); i++) {
				if (i) await sleep(options.gapMs ?? 800);
				fragmentPasses.push((await fetchOne(byPath)).facts);
			}
		}
		const last = passes.at(-1)!;
		let orders: RouteObservation['orders'];
		if (fragments && p.html && p.class !== 'no-cache' && last.status === 200) {
			const fresh = (n: number) => `${url}${url.includes('?') ? '&' : '?'}${PROBE_KEY}=${Date.now().toString(36)}${n}`;
			const tried = { fragmentFirst: await order(fresh(1), 'fragment'), documentFirst: await order(fresh(2), 'document') };
			// A made-up query value is a fresh entry only where the cache keys on the whole URL; elsewhere the first answer is the kept one.
			if (!servedByCdn(tried.fragmentFirst[0]!.response) && !servedByCdn(tried.documentFirst[0]!.response)) orders = tried;
		}
		const query = p.html && last.status === 200 && p.allowQuery?.length ? await queryProbes(url, p.allowQuery) : undefined;
		const invocations = browser && /html/.test(last.contentType) ? await pageInvocations(browser, url) : invoked(last) ? 1 : 0;
		if (options.assets !== false && !assetsChecked && /html/.test(last.contentType)) {
			assetsChecked = true;
			findings.push(...(await assetFindings(origin, p.route, html, oldLong)));
		}
		return { route: p.route, class: p.class, passes, ...(fragment ? { fragment } : {}), ...(fragmentPasses.length ? { fragmentPasses } : {}), ...(orders ? { orders } : {}), ...(query ? { query } : {}), invocations };
	};
	const queryProbes = async (url: string, keys: readonly string[]): Promise<QueryProbe[]> => {
		const out: QueryProbe[] = [];
		for (const key of keys) {
			const values = [1, 2].map((n) => `mm${Date.now().toString(36)}q${n}`);
			for (const value of values) {
				const at = new URL(url);
				at.searchParams.set(key, value);
				const urls = [at.href, fragmentUrl(at.href)].filter((u): u is string => Boolean(u));
				const responses: QueryProbe['responses'][number][] = [];
				let otherValue: string | undefined;
				for (const u of urls)
					for (let i = 0; i < 2; i++) {
						if (i) await sleep(options.gapMs ?? 800);
						const got = await fetchOne(u);
						responses.push({ url: new URL(u).pathname + new URL(u).search, facts: got.facts, rendered: got.html.includes(value) });
						const other = values.find((v) => v !== value && got.html.includes(v));
						if (other) otherValue = other;
					}
				const old = options.oldOrigin ? await fetchPage(new URL(at.pathname + at.search, options.oldOrigin).href).catch(() => undefined) : undefined;
				out.push({ key, value, responses, ...(old ? { oldRendered: old.body.includes(value) } : {}), ...(otherValue ? { otherValue } : {}) });
			}
		}
		return out;
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
	if (fragments) await expiryOrders(todo, observed);
	for (const [i, o] of observed.entries()) {
		routes.push(o);
		findings.push(...judgeRoute(todo[i]!, o, options.fragmentHeader));
	}
	for (const o of observed) for (const key of new Set((o.query ?? []).filter((q) => !q.oldRendered && q.responses.some((r) => !r.rendered)).map((q) => q.key))) notes.push(`${o.route}?${key}=: neither the old site's page nor the port's shows a made-up value, so whether the port renders its query is not told by this probe`);
	return { origin, checkedAt: new Date().toISOString(), routes, findings, numbers: numbersOf(routes), notes };

	/** Waits out the revalidation of a few ISR pages and asks for fragment and document in both orders on the expired entries. */
	async function expiryOrders(todo: readonly RouteCaching[], observed: RouteObservation[]): Promise<void> {
		const maxWait = options.expiryWaitS ?? 130;
		const isr = todo.map((p, i) => ({ p, i })).filter(({ p, i }) => p.html && p.class !== 'no-cache' && observed[i]!.passes.at(-1)!.status === 200 && !observed[i]!.orders);
		const finite = isr.filter(({ p }) => p.class === 'isr' && (p.revalidate ?? 0) > 0);
		const never = isr.length - finite.length;
		if (never) notes.push(`${never} cached page${never === 1 ? '' : 's'} never expire before the next deploy: fragment and document were not asked for in both orders after expiry, only told apart on every request`);
		const waited = finite.filter(({ p }) => p.revalidate! <= maxWait).slice(0, options.expiryRoutes ?? 3);
		const skipped = finite.length - waited.length;
		if (skipped) notes.push(`${skipped} page${skipped === 1 ? '' : 's'} on ISR with revalidation not asked for in both orders after expiry (${maxWait ? `waits up to ${maxWait} s for ${options.expiryRoutes ?? 3} pages` : 'the wait is off'})`);
		if (!waited.length) return;
		const wait = (Math.max(...waited.map(({ p }) => p.revalidate!)) + 2) * 1000;
		const runs: Record<number, { fragmentFirst?: Probe[]; documentFirst?: Probe[] }> = {};
		for (const first of ['fragment', 'document'] as const) {
			await sleep(wait);
			await Promise.all(waited.map(async ({ p, i }) => ((runs[i] ??= {})[first === 'fragment' ? 'fragmentFirst' : 'documentFirst'] = await order(new URL(p.route, origin).href, first))));
		}
		for (const { i } of waited) observed[i] = { ...observed[i]!, orders: { fragmentFirst: runs[i]!.fragmentFirst!, documentFirst: runs[i]!.documentFirst! } };
	}
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
	'missing-vary': 'a fragment request answered differently without Vary naming it',
	'wrong-body': 'fragment and document share a cache entry',
	'query-not-rendered': 'a page that reads the query does not render it',
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
	const ordered = report.routes.filter((r) => r.orders).length;
	if (ordered) lines.push(`  ${ordered} page${ordered === 1 ? '' : 's'} asked for fragment then document and document then fragment after expiry`);
	for (const note of report.notes ?? []) lines.push(`  note ${note}`);
	return `${lines.join('\n')}\n`;
}
