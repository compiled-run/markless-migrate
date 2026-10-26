import { existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page, type Request } from 'playwright';
import { deployOf, NetworkCache } from './slow-network-cache.ts';
import { GATED, noiseBand, resolution, settledNotSlower } from './slow-network-verdicts.ts';
import { NETWORK_PROFILES, startThrottle, type NetworkProfile, type Throttle } from './throttle.ts';

export const NETWORK_BROWSERS = ['chromium', 'firefox', 'webkit'] as const;
export type NetworkBrowser = (typeof NETWORK_BROWSERS)[number];
export const DEFAULT_NETWORK_RUNS = 5;
/** The first state-bearing control on the page that is not yet on: an unselected tab, else a closed disclosure. */
export const AUTO_CONTROL = '[role="tab"][aria-selected="false"]:visible, [aria-expanded="false"]:visible';
/** A person clicking a control that does not answer clicks again about this often (Firefox profiles of a tabs page, clicked until it answered: 250 to 300 ms). */
export const CLICK_EVERY_MS = 250;
const VIEWPORT = { width: 1350, height: 940 };
const QUIET_MS = 2000;
/** After the answer, the run waits for the network to go quiet this long at most: "in all" means by then. */
export const AFTER_ANSWER_MS = 60_000;

export interface NetworkRequest {
	readonly url: string;
	readonly type: string;
	/** ms after navigation start. */
	readonly start: number;
	readonly end: number;
	/** Response headers and body as they came over the network (compressed). */
	readonly bytes: number;
}

/** One cold load of one page over one network in one browser, then clicks on one control until it answers. */
export interface NetworkRun {
	/** All in ms after navigation start. */
	readonly ttfb?: number;
	readonly fcp?: number;
	/** The first frame with anything painted, from screenshots taken every 100 ms: the same measure in every browser, where FCP is not (Firefox reports none on some pages, WebKit reports it only once a blocking web font arrives, after the fallback text has shown). */
	readonly firstFrame?: number;
	/** Largest Contentful Paint, where the browser reports it. */
	readonly lcp?: number;
	readonly domContentLoaded?: number;
	readonly load?: number;
	/** The first click on the control, sent once it was on screen. */
	readonly firstClick?: number;
	/** The frame after the control first changed state (aria-selected, aria-expanded, aria-pressed, aria-checked, data-state, open). */
	readonly answered?: number;
	readonly clicks: number;
	/** No control to click was on the page by the time it had loaded and the network gone quiet. */
	readonly noControl?: boolean;
	/** Bytes the browser received over the link, TLS and framing included: by the answer, and once the network went quiet for 2 s (at most 60 s after the answer). */
	readonly bytesByAnswer?: number;
	readonly bytes: number;
	/** JavaScript downloaded (compressed, as sent) by the answer and in all. */
	readonly jsDownloadedByAnswer?: number;
	readonly jsDownloaded: number;
	/** JavaScript the page executed by the answer, or by the end of the load when there was nothing to click: bytes of source in functions and blocks that ran (Chromium only). */
	readonly jsExecutedByAnswer?: number;
	readonly requests: readonly NetworkRequest[];
	/** The longest time this process went without running a 100 ms timer: a machine that pauses or swaps the measurement skews every time in it. */
	readonly stalledMs?: number;
	readonly error?: string;
}

export const RUN_METRICS = ['ttfb', 'firstFrame', 'fcp', 'lcp', 'load', 'answered', 'visibleToAnswer', 'bytesByAnswer', 'bytes', 'jsDownloadedByAnswer', 'jsDownloaded', 'jsExecutedByAnswer'] as const;
export type RunMetric = (typeof RUN_METRICS)[number];

export const RUN_METRIC_LABEL: Readonly<Record<RunMetric, string>> = {
	ttfb: 'Time to first byte',
	firstFrame: 'First painted frame',
	fcp: 'FCP (as the browser reports it)',
	lcp: 'Largest paint (LCP)',
	load: 'Load event',
	answered: 'First click answered',
	visibleToAnswer: 'Painted to first click answered',
	bytesByAnswer: 'Downloaded by the answer',
	bytes: 'Downloaded in all',
	jsDownloadedByAnswer: 'JS downloaded by the answer',
	jsDownloaded: 'JS downloaded in all',
	jsExecutedByAnswer: 'JS executed by the answer (Chromium)',
};

export function runMetric(run: NetworkRun, metric: RunMetric): number | undefined {
	if (run.error) return undefined;
	if (metric === 'visibleToAnswer') {
		const painted = run.firstFrame ?? run.fcp;
		return run.answered !== undefined && painted !== undefined ? run.answered - painted : undefined;
	}
	return run[metric];
}

export function median(values: readonly number[]): number | undefined {
	if (!values.length) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface NetworkCell {
	readonly profile: string;
	readonly browser: NetworkBrowser;
	readonly runs: readonly NetworkRun[];
	readonly median: Readonly<Partial<Record<RunMetric, number>>>;
	/** The run whose answer is the median, kept whole for its request waterfall. */
	readonly medianRun?: NetworkRun;
	/** Why the cell was not measured: the browser is not installed, or the profile is one it cannot apply. */
	readonly unavailable?: string;
	/** The runs came from an earlier check of the same deploy. */
	readonly cached?: boolean;
	/** Fewer runs than asked for were taken: those left could not have made the new page slower here. */
	readonly settled?: boolean;
}

export function summarizeCell(profile: string, browser: NetworkBrowser, runs: readonly NetworkRun[]): NetworkCell {
	const ok = runs.filter((r) => !r.error);
	const m: Partial<Record<RunMetric, number>> = {};
	for (const metric of RUN_METRICS) {
		const value = median(ok.map((r) => runMetric(r, metric)).filter((v): v is number => v !== undefined));
		if (value !== undefined) m[metric] = Math.round(value);
	}
	const byAnswer = [...ok].filter((r) => r.answered !== undefined).sort((a, b) => a.answered! - b.answered!);
	const medianRun = byAnswer[(byAnswer.length - 1) >> 1] ?? ok[0];
	return { profile, browser, runs, median: m, ...(medianRun ? { medianRun } : {}) };
}

/** Bytes of `source` inside ranges that ran: V8 lists a function's whole range first and the blocks in it after, so the innermost range decides. */
export function executedBytes(entries: readonly { readonly source?: string; readonly functions: readonly { readonly ranges: readonly { readonly startOffset: number; readonly endOffset: number; readonly count: number }[] }[] }[]): number {
	let total = 0;
	for (const entry of entries) {
		const length = entry.source?.length ?? Math.max(0, ...entry.functions.flatMap((f) => f.ranges.map((r) => r.endOffset)));
		if (!length) continue;
		const ran = new Uint8Array(length);
		const ranges = entry.functions.flatMap((f) => f.ranges).sort((a, b) => b.endOffset - b.startOffset - (a.endOffset - a.startOffset));
		for (const r of ranges) ran.fill(r.count > 0 ? 1 : 0, Math.max(0, r.startOffset), Math.min(length, r.endOffset));
		for (const byte of ran) total += byte;
	}
	return total;
}

/** Whether every pixel of a PNG frame is the colour of its first, give or take a little compression noise. */
export function blankFrame(png: Buffer): boolean {
	const { data } = PNG.sync.read(png);
	const [r, g, b] = [data[0]!, data[1]!, data[2]!];
	for (let i = 4; i < data.length; i += 4) if (Math.abs(data[i]! - r) > 8 || Math.abs(data[i + 1]! - g) > 8 || Math.abs(data[i + 2]! - b) > 8) return false;
	return true;
}

export const FRAME_EVERY_MS = 100;

/** Epoch ms when the first screenshot with anything painted came back, taken every 100 ms until one is or `stop` says so. */
async function firstPaintedFrame(page: Page, stop: () => boolean): Promise<number | undefined> {
	while (!stop()) {
		const at = Date.now();
		// Playwright's screenshots wait for web fonts unless this is set, which holds a swap-font page's first frame back.
		const before = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
		process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
		const png = await page.screenshot({ scale: 'css', type: 'png', timeout: 5000 }).catch(() => undefined);
		if (before === undefined) delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
		else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = before;
		// Chromium holds a capture until the page can paint, so the frame is as late as the capture's return.
		if (png && !blankFrame(png)) return Date.now();
		await new Promise((r) => setTimeout(r, Math.max(0, FRAME_EVERY_MS - (Date.now() - at))));
	}
	return undefined;
}

/** A process stalled longer than this (a job queue pausing it, the machine swapping) has a run whose times are not the network's. */
export const STALL_MS = 1000;
const RETAKES = 2;
/** Fresh runs of a cached old page each check takes: the cached runs stand only while these land among them. */
export const CACHE_SAMPLES = 2;

/** Every gated time of each fresh run lies within the cached runs' range, widened by their own band. */
function agrees(cachedRuns: readonly NetworkRun[], fresh: readonly NetworkRun[]): boolean {
	const ok = fresh.filter((r) => !r.error);
	if (!ok.length) return false;
	for (const metric of GATED) {
		const before = cachedRuns.map((r) => runMetric(r, metric)).filter((v): v is number => v !== undefined);
		const now = ok.map((r) => runMetric(r, metric)).filter((v): v is number => v !== undefined);
		if (!before.length || !now.length) continue;
		const band = Math.max(noiseBand(before) ?? 0, resolution(metric));
		const [lo, hi] = [Math.min(...before) - band, Math.max(...before) + band];
		if (now.some((v) => v < lo || v > hi)) return false;
	}
	return true;
}

/** Watches this process's timers: `stop` returns the longest gap beyond the expected tick. */
export function stallWatch(everyMs = 100): { stop(): number } {
	let last = performance.now();
	let worst = 0;
	const timer = setInterval(() => {
		const now = performance.now();
		worst = Math.max(worst, now - last - everyMs);
		last = now;
	}, everyMs);
	return {
		stop: () => {
			clearInterval(timer);
			worst = Math.max(worst, performance.now() - last - everyMs);
			return Math.max(0, Math.round(worst));
		},
	};
}

// Runs in the page before its own scripts: notes trusted clicks, the first state change on a clicked control (or one
// with its role and text, should the framework replace the node), and the frame after it.
function observe() {
	const STATE = ['aria-selected', 'aria-expanded', 'aria-pressed', 'aria-checked', 'data-state', 'open'];
	const w = window as unknown as { __mmNet: { clicks: number[]; answered?: number; controls: Element[] } };
	const net = (w.__mmNet = { clicks: [], controls: [] } as { clicks: number[]; answered?: number; controls: Element[] });
	performance.setResourceTimingBufferSize?.(100_000);
	const key = (el: Element) => `${el.getAttribute('role') ?? el.tagName}|${(el.textContent ?? '').trim().slice(0, 80)}`;
	addEventListener(
		'click',
		(event) => {
			if (!event.isTrusted) return;
			const control = (event.target as Element | null)?.closest?.('[role],[aria-expanded],[aria-pressed],[aria-checked],[aria-selected],button,summary,a');
			net.clicks.push(performance.now());
			if (control && !net.controls.includes(control)) net.controls.push(control);
		},
		true,
	);
	const watch = () => {
		new MutationObserver((records) => {
			if (net.answered !== undefined || !net.clicks.length) return;
			const keys = new Set(net.controls.map(key));
			for (const record of records) {
				const el = record.target as Element;
				const name = record.attributeName ?? '';
				const now = el.getAttribute(name);
				// A first render that adds the attribute is not an answer; a value that turns on, or one that changes, is.
				if (record.oldValue === null || now === record.oldValue) continue;
				if ((name === 'aria-selected' || name === 'aria-expanded') && now !== 'true') continue;
				if (!net.controls.includes(el) && !keys.has(key(el))) continue;
				const binding = (window as unknown as { __mmNetAnswered?: (at: number) => void }).__mmNetAnswered;
				requestAnimationFrame(() => {
					if (net.answered !== undefined) return;
					net.answered = performance.now();
					binding?.(net.answered);
				});
				return;
			}
		}).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: STATE });
	};
	watch();
}

async function pageTimings(page: Page): Promise<Omit<NetworkRun, 'clicks' | 'bytes' | 'jsDownloaded' | 'requests' | 'firstClick' | 'answered'> & { origin: number; firstClick?: number; answered?: number; resources: { url: string; start: number; end: number }[] }> {
	return page.evaluate(async () => {
		const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
		const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
		let lcp: number | undefined;
		if (PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
			lcp = await new Promise<number | undefined>((resolve) => {
				let last: number | undefined;
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) last = entry.startTime;
				}).observe({ type: 'largest-contentful-paint', buffered: true });
				setTimeout(() => resolve(last), 50);
			});
		}
		const net = (window as unknown as { __mmNet?: { clicks: number[]; answered?: number } }).__mmNet;
		const at = (v: number | undefined) => (v === undefined || v <= 0 ? undefined : Math.round(v));
		const r: Record<string, number | undefined> = {
			origin: performance.timeOrigin,
			ttfb: at(nav?.responseStart),
			fcp: at(fcp),
			lcp: at(lcp),
			domContentLoaded: at(nav?.domContentLoadedEventEnd),
			load: at(nav?.loadEventEnd),
			firstClick: at(net?.clicks[0]),
			answered: at(net?.answered),
		};
		const resources = [nav, ...performance.getEntriesByType('resource')].filter((e): e is PerformanceResourceTiming => Boolean(e)).map((e) => ({ url: e.name, start: e.startTime, end: e.responseEnd }));
		return { ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)), resources } as never;
	});
}

export interface NetworkRunOptions {
	/** A Playwright selector for the control to click; default the first unselected tab or closed disclosure. */
	readonly control?: string;
	/** false skips the screenshots that find the first painted frame. */
	readonly firstFrame?: boolean;
	/** How long after the answer to wait for the network to go quiet, at most; default 60 s. */
	readonly afterAnswerMs?: number;
	/** Give up on a run after this long; default 120 s. */
	readonly timeoutMs?: number;
	/** Host names the proxy connects elsewhere (tests). */
	readonly hosts?: Readonly<Record<string, string>>;
}

const TYPES: Readonly<Record<NetworkBrowser, BrowserType>> = { chromium, firefox, webkit };

async function launch(name: NetworkBrowser, throttle: Throttle): Promise<Browser> {
	const proxy = { server: throttle.proxy, bypass: '' };
	// Loopback origins go through the proxy too: Chromium and Firefox send them past it unless told otherwise.
	if (name === 'chromium') return chromium.launch({ proxy, args: ['--proxy-bypass-list=<-loopback>', '--disable-quic'] });
	if (name === 'firefox') return firefox.launch({ proxy, firefoxUserPrefs: { 'network.proxy.allow_hijacking_localhost': true, 'network.http.http3.enable': false } });
	return TYPES[name].launch({ proxy });
}

/** One cold load of `url` over `profile` in a fresh `browser`, clicking the control every 250 ms from when it is on screen until it answers. */
export async function networkRun(url: string, profile: NetworkProfile, name: NetworkBrowser, options: NetworkRunOptions = {}): Promise<NetworkRun> {
	const watch = stallWatch();
	const run = await measureOnce(url, profile, name, options);
	const stalledMs = watch.stop();
	if (stalledMs < STALL_MS) return run;
	return { ...run, stalledMs, error: `this machine stalled the measurement for ${(stalledMs / 1000).toFixed(1)} s (a paused job or swapping): its times are not the network's` };
}

async function measureOnce(url: string, profile: NetworkProfile, name: NetworkBrowser, options: NetworkRunOptions): Promise<NetworkRun> {
	const timeoutMs = options.timeoutMs ?? 120_000;
	if (profile.devtools && name !== 'chromium') return { clicks: 0, bytes: 0, jsDownloaded: 0, requests: [], error: `${profile.name} is DevTools throttling, which only Chromium has` };
	// DevTools throttling happens in the browser; the proxy then only counts the bytes.
	const link = profile.devtools ? { ...profile, downBytesPerSecond: Infinity, upBytesPerSecond: Infinity, rttMs: 0 } : profile;
	const throttle = await startThrottle(link, options.hosts ? { hosts: options.hosts } : {});
	let browser: Browser | undefined;
	try {
		browser = await launch(name, throttle);
		const context = await browser.newContext({ viewport: VIEWPORT });
		const page = await context.newPage();
		if (profile.devtools) {
			const cdp = await context.newCDPSession(page);
			await cdp.send('Network.enable');
			await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.devtools.requestLatencyMs, downloadThroughput: profile.downBytesPerSecond, uploadThroughput: profile.upBytesPerSecond });
		}
		let answeredAt: (() => void) | undefined;
		const answered = new Promise<void>((resolve) => (answeredAt = resolve));
		await page.exposeFunction('__mmNetAnswered', () => answeredAt?.());
		await page.addInitScript(observe);
		const finished: Promise<{ request: Request; bytes: number; script: boolean } | undefined>[] = [];
		page.on('requestfinished', (request) => {
			finished.push(
				request
					.sizes()
					.then((s) => ({ request, bytes: s.responseHeadersSize + s.responseBodySize, script: request.resourceType() === 'script' }))
					.catch(() => undefined),
			);
		});
		const coverage = name === 'chromium';
		if (coverage) await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
		const deadline = Date.now() + timeoutMs;
		let loaded = false;
		page.once('load', () => (loaded = true));
		await page.goto(url, { waitUntil: 'commit', timeout: timeoutMs });
		let clicks = 0;
		let done = false;
		let seen = false;
		let noControl = false;
		const frame = options.firstFrame !== false ? firstPaintedFrame(page, () => done || noControl || Date.now() > deadline) : Promise.resolve(undefined);
		void answered.then(() => (done = true));
		const control = page.locator(options.control ?? AUTO_CONTROL).first();
		while (!done && Date.now() < deadline) {
			const started = Date.now();
			const box = await control.boundingBox({ timeout: CLICK_EVERY_MS }).catch(() => null);
			if (!box && !seen && loaded && Date.now() - throttle.lastActivity() > QUIET_MS) {
				noControl = true;
				break;
			}
			if (box && box.width > 0 && box.height > 0) {
				seen = true;
				if (box.y < 0 || box.y + box.height > VIEWPORT.height) await control.scrollIntoViewIfNeeded({ timeout: CLICK_EVERY_MS }).catch(() => {});
				else {
					await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
					clicks++;
				}
			}
			await Promise.race([answered, new Promise((r) => setTimeout(r, Math.max(0, CLICK_EVERY_MS - (Date.now() - started))))]);
		}
		const executed = coverage && (done || noControl) ? executedBytes((await page.coverage.stopJSCoverage()).filter((e) => e.url)) : undefined;
		const settle = Math.min(deadline, Date.now() + (options.afterAnswerMs ?? AFTER_ANSWER_MS));
		while (Date.now() < settle && Date.now() - throttle.lastActivity() < QUIET_MS) await new Promise((r) => setTimeout(r, 200));
		const painted = await frame;
		const timings = await pageTimings(page);
		const firstFrame = painted === undefined ? undefined : Math.max(0, Math.round(painted - timings.origin));
		const requests: NetworkRequest[] = [];
		let jsByAnswer = 0;
		let jsDownloaded = 0;
		const answerEpoch = timings.answered !== undefined ? timings.origin + timings.answered : undefined;
		// The page's own Resource Timing, where it lists the request: Chromium reports some preloads to Playwright as finishing seconds after their bytes arrived.
		const listed = new Map<string, { start: number; end: number }[]>();
		for (const r of timings.resources) if (r.end > 0) listed.set(r.url, [...(listed.get(r.url) ?? []), r]);
		for (const got of await Promise.all(finished)) {
			if (!got) continue;
			const own = listed.get(got.request.url())?.shift();
			const timing = got.request.timing();
			const start = Math.round(own ? own.start : timing.startTime - timings.origin);
			const end = Math.round(own ? own.end : timing.startTime - timings.origin + Math.max(timing.responseEnd, 0));
			requests.push({ url: got.request.url(), type: got.request.resourceType(), start, end, bytes: got.bytes });
			if (got.script) {
				jsDownloaded += got.bytes;
				if (answerEpoch !== undefined && timings.origin + end <= answerEpoch) jsByAnswer += got.bytes;
			}
		}
		requests.sort((a, b) => a.start - b.start);
		const { origin: _, resources: __, ...rest } = timings;
		return {
			...rest,
			...(firstFrame !== undefined ? { firstFrame } : {}),
			clicks,
			...(answerEpoch !== undefined ? { bytesByAnswer: throttle.downloadedBy(answerEpoch), jsDownloadedByAnswer: jsByAnswer } : {}),
			bytes: throttle.downloaded(),
			jsDownloaded,
			...(executed !== undefined ? { jsExecutedByAnswer: executed } : {}),
			requests,
			...(noControl ? { noControl } : {}),
			...(timings.answered === undefined && !noControl ? { error: seen ? `the control (${options.control ?? 'first unselected tab or closed disclosure'}) never answered a click within ${Math.round(timeoutMs / 1000)} s` : `no control (${options.control ?? 'first unselected tab or closed disclosure'}) showed, and the page had not finished loading, within ${Math.round(timeoutMs / 1000)} s` } : {}),
		};
	} catch (error) {
		return { clicks: 0, bytes: throttle.downloaded(), jsDownloaded: 0, requests: [], error: (error as Error).message.split('\n')[0]! };
	} finally {
		await browser?.close().catch(() => {});
		await throttle.close();
	}
}

/** Whether Playwright has this browser installed here. */
export function browserInstalled(name: NetworkBrowser): boolean {
	try {
		return existsSync(TYPES[name].executablePath());
	} catch {
		return false;
	}
}

export interface SlowNetworkOptions extends NetworkRunOptions {
	readonly profiles?: readonly string[];
	readonly browsers?: readonly NetworkBrowser[];
	readonly runs?: number;
	/** The control to click per url, in place of `control`. */
	readonly controls?: Readonly<Record<string, string>>;
	/** Pages measured at once, each over its own link; default 1. */
	readonly concurrency?: number;
	readonly onRun?: (label: string, run: NetworkRun) => void;
	/** Old-page runs reused from earlier checks of the same deploy: `deploys` maps each url to its fingerprint, `reuse` names the urls whose runs may be reused. */
	readonly cache?: { readonly store: NetworkCache; readonly deploys: Readonly<Record<string, string>>; readonly reuse: readonly string[] };
	/** Where check keeps old-page runs between checks (.migrate/slow-network). */
	readonly cacheDir?: string;
	/** Takes one run in place of networkRun (tests). */
	readonly runner?: typeof networkRun;
	/** Which url is the old page and which the new: a cell stops taking runs once its remaining runs could no longer make the new page slower. */
	readonly settle?: { readonly old: string; readonly new: string };
}

export interface SideNetwork {
	readonly url: string;
	readonly cells: readonly NetworkCell[];
}

/** Each url over each profile in each browser, `runs` cold loads apiece, the urls taken in turn so drift on this machine or the network falls on all of them alike. */
export async function measureSlowNetwork(urls: readonly string[], options: SlowNetworkOptions = {}): Promise<SideNetwork[]> {
	const profiles = (options.profiles ?? ['regular-3g']).map((name) => {
		const profile = NETWORK_PROFILES[name];
		if (!profile) throw new Error(`unknown network profile ${name}: one of ${Object.keys(NETWORK_PROFILES).join(', ')}`);
		return profile;
	});
	const browsers = options.browsers ?? ['chromium'];
	const runs = options.runs ?? DEFAULT_NETWORK_RUNS;
	const runner = options.runner ?? networkRun;
	const results = new Map<string, NetworkRun[]>();
	const hits = new Map<string, NetworkRun[]>();
	const cached = new Set<string>();
	const installed = new Map<NetworkBrowser, boolean>(browsers.map((b) => [b, options.runner ? true : browserInstalled(b)]));
	const skipped = (profile: NetworkProfile, b: NetworkBrowser) =>
		!installed.get(b) ? `${b} is not installed (npx playwright install ${b})` : profile.devtools && b !== 'chromium' ? `${profile.name} is Chrome DevTools throttling, which only Chromium has` : undefined;
	const k = (url: string, profile: string, b: string) => `${url}\n${profile}\n${b}`;
	const cacheKey = (url: string, profile: NetworkProfile, b: NetworkBrowser) => {
		const deploy = options.cache?.deploys[url];
		const control = options.controls?.[url] ?? options.control;
		return deploy && options.cache?.reuse.includes(url) ? { url, profile: profile.name, browser: b, runs, deploy, ...(control ? { control } : {}) } : undefined;
	};
	for (const profile of profiles)
		for (const b of browsers)
			for (const url of urls) {
				const key = skipped(profile, b) ? undefined : cacheKey(url, profile, b);
				const hit = key ? await options.cache!.store.get(key) : undefined;
				if (hit) {
					hits.set(k(url, profile.name, b), hit.slice(0, runs));
					cached.add(k(url, profile.name, b));
				}
			}
	const job = (url: string, profile: NetworkProfile, b: NetworkBrowser) => async () => {
		const control = options.controls?.[url] ?? options.control;
		let run = await runner(url, profile, b, { ...options, ...(control ? { control } : {}) });
		for (let retake = 0; retake < RETAKES && run.stalledMs !== undefined && run.stalledMs >= STALL_MS; retake++) run = await runner(url, profile, b, { ...options, ...(control ? { control } : {}) });
		results.set(k(url, profile.name, b), [...(results.get(k(url, profile.name, b)) ?? []), run]);
		options.onRun?.(`${b} ${profile.name} ${url}`, run);
	};
	const drain = async (jobs: (() => Promise<void>)[]) => {
		let next = 0;
		await Promise.all(
			Array.from({ length: Math.max(1, options.concurrency ?? 1) }, async () => {
				while (next < jobs.length) await jobs[next++]!();
			}),
		);
	};
	// A cell whose old page is measured afresh is settled once no runs still to come could make the new page slower there.
	const settled = new Set<string>();
	const settles = (profile: NetworkProfile, b: NetworkBrowser) => {
		const { old, new: next } = options.settle!;
		if (cached.has(k(old, profile.name, b)) || !settledNotSlower(results.get(k(old, profile.name, b)) ?? [], results.get(k(next, profile.name, b)) ?? [], runs)) return;
		settled.add(`${profile.name}\n${b}`);
	};
	const jobs: (() => Promise<void>)[] = [];
	for (let i = 0; i < runs; i++)
		for (const profile of profiles)
			for (const b of browsers) {
				if (skipped(profile, b)) continue;
				// A cached page is still taken a few times, to check the cache against this session.
				for (const url of i % 2 ? [...urls].reverse() : urls)
					if (!cached.has(k(url, profile.name, b)) || i < CACHE_SAMPLES)
						jobs.push(async () => {
							if (settled.has(`${profile.name}\n${b}`)) return;
							await job(url, profile, b)();
							if (options.settle) settles(profile, b);
						});
			}
	await drain(jobs);
	const again: (() => Promise<void>)[] = [];
	for (const key of [...cached]) {
		const [url, name, b] = key.split('\n') as [string, string, NetworkBrowser];
		const fresh = results.get(key) ?? [];
		if (agrees(hits.get(key)!, fresh)) results.set(key, [...hits.get(key)!, ...fresh]);
		else {
			cached.delete(key);
			for (let i = fresh.length; i < runs; i++) again.push(job(url, NETWORK_PROFILES[name]!, b));
		}
	}
	await drain(again);
	for (const profile of profiles)
		for (const b of browsers)
			for (const url of urls) {
				const key = cached.has(k(url, profile.name, b)) || skipped(profile, b) ? undefined : cacheKey(url, profile, b);
				if (key) await options.cache!.store.put(key, results.get(k(url, profile.name, b)) ?? []);
			}
	return urls.map((url) => ({
		url,
		cells: profiles.flatMap((p) =>
			browsers.map((b): NetworkCell => {
				const reason = skipped(p, b);
				if (reason) return { profile: p.name, browser: b, runs: [], median: {}, unavailable: reason };
				const cell = summarizeCell(p.name, b, results.get(k(url, p.name, b)) ?? []);
				return { ...cell, ...(cached.has(k(url, p.name, b)) ? { cached: true } : {}), ...(settled.has(`${p.name}\n${b}`) ? { settled: true } : {}) };
			}),
		),
	}));
}

const BYTE_METRICS = new Set<RunMetric>(['bytesByAnswer', 'bytes', 'jsDownloadedByAnswer', 'jsDownloaded', 'jsExecutedByAnswer']);

export function formatValue(metric: RunMetric, value: number | undefined): string {
	if (value === undefined) return '-';
	if (BYTE_METRICS.has(metric)) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)} kB`;
	return `${(value / 1000).toFixed(2)} s`;
}

/** One table per profile and browser: a row per metric, a column per page, medians of the runs. */
export function networkTables(sides: readonly SideNetwork[], names: readonly string[] = sides.map((s) => s.url)): string {
	const out: string[] = [];
	const keys = sides[0]?.cells.map((c) => [c.profile, c.browser] as const) ?? [];
	for (const [profile, browser] of keys) {
		const cells = sides.map((s) => s.cells.find((c) => c.profile === profile && c.browser === browser)!);
		const label = NETWORK_PROFILES[profile]?.label ?? profile;
		out.push(`${browser}, ${label}: median of ${Math.max(...cells.map((c) => c.runs.filter((r) => !r.error).length))} cold loads${cells.some((c) => c.settled) ? ' (stopped there: the runs left could not have made the new page slower)' : ''}`);
		const unavailable = cells.find((c) => c.unavailable)?.unavailable;
		if (unavailable) {
			out.push(`  ${unavailable}`, '');
			continue;
		}
		const rows = [['', ...names], ...RUN_METRICS.map((m) => [RUN_METRIC_LABEL[m], ...cells.map((c) => formatValue(m, c.median[m]))]).filter((row) => row.slice(1).some((v) => v !== '-'))];
		const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
		for (const row of rows) out.push(`  ${row.map((v, i) => (i ? v.padStart(widths[i]!) : v.padEnd(widths[i]!))).join('  ')}`);
		for (const [i, c] of cells.entries()) {
			const failed = c.runs.filter((r) => r.error);
			if (failed.length) out.push(`  ${names[i]}: ${failed.length} of ${c.runs.length} runs failed (${[...new Set(failed.map((r) => r.error))].join('; ')})`);
		}
		out.push('');
	}
	return out.join('\n');
}

/** Column names for the pages: the host alone, or host and path where two pages share a host. */
export function shortNames(urls: readonly string[]): string[] {
	const hosts = urls.map((u) => new URL(u).host);
	return urls.map((u, i) => (hosts.filter((h) => h === hosts[i]).length > 1 ? `${hosts[i]}${new URL(u).pathname}` : hosts[i]!));
}

/** A route's cold loads over slow networks, old and new side by side. */
export interface RouteNetwork {
	readonly old: SideNetwork;
	readonly new: SideNetwork;
	/** How long measuring the route took. */
	readonly ms?: number;
}

/** Cold loads of the route on old and new over each profile in each browser, the two sides taken in turn; the old page's runs are reused from `cacheDir` while its deploy is the same. */
export async function measureRouteNetwork(origins: { readonly old: string; readonly new: string }, route: string, options: SlowNetworkOptions = {}): Promise<RouteNetwork> {
	const started = Date.now();
	const urls = [new URL(route, origins.old).href, new URL(route, origins.new).href];
	const deploy = options.cacheDir ? await deployOf(urls[0]!) : undefined;
	const cache = options.cacheDir && deploy ? { store: new NetworkCache(options.cacheDir), deploys: { [urls[0]!]: deploy }, reuse: [urls[0]!] } : undefined;
	const [old, next] = await measureSlowNetwork(urls, { ...options, ...(cache ? { cache } : {}), settle: { old: urls[0]!, new: urls[1]! } });
	return { old: old!, new: next!, ms: Date.now() - started };
}

/** What check measures on every page unless --slow-network names others: the two Firefox presets, and Lighthouse's slow 4G with real round trips. */
export const DEFAULT_CHECK_PROFILES = ['regular-3g', 'regular-2g', 'slow-4g'] as const;
/** Cold loads a side: the old page's runs are split in two to find its own noise, which needs 4; 5 a side lets Mann-Whitney reach p = 0.004, and a median of 5 holds when 2 of them land on the slow side of a race between requests (measured on the shadcn port at Regular 2G). */
export const DEFAULT_CHECK_RUNS = 5;
export const DEFAULT_CHECK_CONCURRENCY = 2;
/** In check, "in all" ends this long after the answer: what the page fetched before it is the measure. */
export const CHECK_AFTER_ANSWER_MS = 10_000;
/** A run in check gives up after this long: the shadcn original took 113 s to answer on Regular 2G. */
export const CHECK_RUN_TIMEOUT_MS = 240_000;

export interface SlowNetworkFlags {
	readonly 'no-slow-network'?: boolean;
	readonly 'slow-network'?: readonly string[];
	readonly 'slow-network-browser'?: readonly string[];
	readonly 'slow-network-runs'?: string;
	readonly 'slow-network-control'?: string;
	readonly 'slow-network-concurrency'?: string;
}

/** check's slow-network options from its flags: on by default, off with --no-slow-network. */
export function slowNetworkFlags(values: SlowNetworkFlags): { readonly options?: SlowNetworkOptions; readonly error?: string } {
	if (values['no-slow-network']) {
		const given = (['slow-network', 'slow-network-browser', 'slow-network-runs', 'slow-network-control', 'slow-network-concurrency'] as const).filter((f) => values[f] !== undefined);
		return given.length ? { error: `--no-slow-network and --${given[0]} contradict each other` } : { options: undefined };
	}
	const profiles = [...(values['slow-network'] ?? DEFAULT_CHECK_PROFILES)];
	const unknown = profiles.find((p) => !NETWORK_PROFILES[p]);
	if (unknown) return { error: `unknown --slow-network ${unknown}: one of ${Object.keys(NETWORK_PROFILES).join(', ')}` };
	const browsers = [...(values['slow-network-browser'] ?? NETWORK_BROWSERS)] as NetworkBrowser[];
	const odd = browsers.find((b) => !NETWORK_BROWSERS.includes(b));
	if (odd) return { error: `unknown --slow-network-browser ${odd}: one of ${NETWORK_BROWSERS.join(', ')}` };
	const whole = (flag: 'slow-network-runs' | 'slow-network-concurrency', fallback: number, least: number) => {
		const raw = values[flag];
		const n = raw === undefined ? fallback : Number(raw);
		return Number.isInteger(n) && n >= least ? n : undefined;
	};
	const runs = whole('slow-network-runs', DEFAULT_CHECK_RUNS, 4);
	if (runs === undefined) return { error: "--slow-network-runs must be a whole number of at least 4: the old page's own runs are split in two to tell noise from a difference" };
	const concurrency = whole('slow-network-concurrency', DEFAULT_CHECK_CONCURRENCY, 1);
	if (concurrency === undefined) return { error: '--slow-network-concurrency must be a whole number of at least 1' };
	return { options: { profiles, browsers, runs, concurrency, ...(values['slow-network-control'] ? { control: values['slow-network-control'] } : {}) } };
}
