import type { Browser, Page, Request, Response } from 'playwright';
import { appHeaders, openPage, type SideEnv } from './browser.ts';
import { HINTS } from './hints.ts';
import { request as fetchApp } from './http.ts';
import { describeStep, describeTarget, locate, quiet, type RecordedJourney, type Step } from './journeys.ts';
import type { Failure, ResponsivenessSummary, RouteResult, Slowest, Viewport } from './types.ts';

export type SpeedName = 'desktop' | 'throttled';

export interface Speed {
	readonly name: SpeedName;
	readonly label: string;
	readonly cpu: number;
	readonly viewport: Viewport;
}

/** A mid-range phone: Lighthouse's mobile viewport, touch input, the CPU slowed by `cpu`. */
export function speeds(cpu: number): Speed[] {
	return [
		{ name: 'desktop', label: 'desktop', cpu: 1, viewport: { name: 'desktop', width: 1280, height: 800, isMobile: false } },
		{ name: 'throttled', label: `${cpu}x CPU, mobile`, cpu, viewport: { name: 'mobile', width: 412, height: 823, isMobile: true } },
	];
}

export interface ResponsivenessOptions {
	/** First in-page interaction at the throttled speed must answer within this; default 200 ms. */
	readonly budgetMs?: number;
	/** CPU slowdown of the mobile speed; default 4. */
	readonly cpu?: number;
	/** At most this many controls measured per route, in-page controls first; default 16. */
	readonly maxControls?: number;
	/** At most this many internal links measured per route, within maxControls; default 6. */
	readonly maxLinks?: number;
}

export const DEFAULT_BUDGET_MS = 200;
export const DEFAULT_CPU = 4;
const DEFAULT_MAX_CONTROLS = 16;
const DEFAULT_MAX_LINKS = 6;
const SLACK_MS = 16;
const SLACK_RATIO = 0.1;
const CONCURRENCY = 2;

export interface Fetch {
	readonly url: string;
	readonly kind: 'code' | 'data' | 'asset';
	readonly bytes: number;
}

export interface LongTask {
	readonly ms: number;
	/** The script that ran longest in it: URL, function and what invoked it. */
	readonly script?: string;
}

export interface Server {
	/** Request sent to first byte of the document, on this first hit. */
	readonly ttfb: number;
	/** The same document fetched again by the checker straight after, so a function that just started is warm. */
	readonly warmTtfb?: number;
	readonly htmlBytes: number;
	/** What the host says about the document: `x-vercel-cache: HIT`, `age: 30`, `cache-control`... */
	readonly served?: string;
}

export interface Sample {
	/** Trusted pointerdown (or first keydown when typing) to the next frame after its visible result; Event Timing duration when that is longer. */
	readonly ms?: number;
	/** `changed`: the page changed in place; `navigated`: the URL changed in the same document; `reloaded`: a new document loaded; `none`: nothing visible changed. */
	readonly result: 'changed' | 'navigated' | 'reloaded' | 'none';
	readonly eventMs?: number;
	/** The same interaction again on the same page. */
	readonly warmMs?: number;
	readonly fetches: readonly Fetch[];
	readonly longTasks: readonly LongTask[];
	/** Scripts first evaluated during the interaction (a framework runtime starting). */
	readonly evaluated: readonly string[];
	/** Prefetch hints and prefetched resources on the page when the pointer went down. */
	readonly prefetch?: number;
	readonly server?: Server;
	/** A write was held back, so its timing is not the app's. */
	readonly heldBack?: boolean;
	readonly failed?: string;
}

export interface SpeedTiming {
	readonly speed: SpeedName;
	readonly old: readonly Sample[];
	readonly new: readonly Sample[];
	/** What the verdict used: the slower OLD run, and the NEW run kept (the slower when every run exceeded, else the faster). */
	readonly oldMs?: number;
	readonly newMs?: number;
	/** Difference between repeated runs, per side, when the control was measured twice. */
	readonly spread?: { readonly old: number; readonly new: number };
	readonly ok: boolean;
	readonly problems: readonly string[];
	readonly cause?: string;
}

export interface ControlTiming {
	readonly control: string;
	readonly step: string;
	readonly kind: 'in-page' | 'navigation';
	readonly speeds: readonly SpeedTiming[];
}

export interface Worst {
	readonly control: string;
	readonly old?: number;
	readonly new?: number;
	/** The slowest OLD time on the route, of whichever control, for the run's headline. */
	readonly slowestOld?: number;
}

export interface Responsiveness {
	readonly budgetMs: number;
	readonly cpu: number;
	readonly controls: readonly ControlTiming[];
	readonly notMeasured: readonly { readonly control: string; readonly reason: string }[];
	/** The slowest new first interaction per speed, and the slowest new navigation. */
	readonly worst: { readonly interaction?: Partial<Record<SpeedName, Worst>>; readonly navigation?: Partial<Record<SpeedName, Worst>> };
}

/** In-page probe, run before the page's own scripts in every document: must stay self-contained. */
export function responsivenessProbe(): void {
	if (window !== window.top) return;
	const realOrigin = (Object.getOwnPropertyDescriptor(Performance.prototype, 'timeOrigin')!.get as () => number).call(performance);
	type Frame = { start: number; duration: number; scripts: { url: string; fn: string; invoker: string; type: string; duration: number; start: number }[] };
	const s = {
		down: -1,
		change: -1,
		paint: -1,
		urlAt: -1,
		navChange: -1,
		navPaint: -1,
		lastBefore: -1,
		prefetch: 0,
		url: location.href,
		events: [] as { duration: number; start: number }[],
		frames: [] as Frame[],
	};
	const noisy = new WeakSet<Node>();
	let armed = false;
	const paintAfter = (set: (t: number) => void) =>
		requestAnimationFrame(() => {
			const channel = new MessageChannel();
			channel.port1.onmessage = () => set(performance.now());
			channel.port2.postMessage(0);
		});
	const inContent = (node: Node) => {
		const el = node instanceof Element ? node : node.parentElement;
		if (!el) return false;
		if (!document.querySelector('main, [role="main"], article, h1')) return true;
		return Boolean(el.closest('main, [role="main"], article, h1') || el.querySelector?.('main, [role="main"], article, h1'));
	};
	new MutationObserver((records) => {
		const now = performance.now();
		if (s.down >= 0 && s.urlAt < 0 && location.href !== s.url) s.urlAt = now;
		for (const r of records) {
			// A node that changed between arming and the pointer going down (a clock, a carousel) is not the interaction's result.
			if (s.down < 0) {
				if (armed) noisy.add(r.target);
				continue;
			}
			if (noisy.has(r.target)) continue;
			if (s.change < 0) {
				s.change = now;
				paintAfter((t) => (s.paint = t));
			}
			const content = inContent(r.target) || [...r.addedNodes].some(inContent);
			if (s.urlAt < 0 && content) s.lastBefore = now;
			if (s.urlAt >= 0 && s.navChange < 0 && content) {
				s.navChange = now;
				paintAfter((t) => (s.navPaint = t));
			}
		}
	}).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
	const onUrl = () => {
		if (s.down >= 0 && s.urlAt < 0 && location.href !== s.url) s.urlAt = performance.now();
	};
	(globalThis as unknown as { navigation?: EventTarget }).navigation?.addEventListener('currententrychange', onUrl);
	addEventListener('popstate', onUrl);
	const start = (e: Event) => {
		if (!e.isTrusted || s.down >= 0) return;
		s.down = e.timeStamp;
		s.url = location.href;
		s.prefetch = document.querySelectorAll('link[rel~="prefetch"], link[rel~="prerender"], link[rel~="modulepreload"], script[type="speculationrules"]').length;
		(globalThis as unknown as { __mmDown?: (at: number) => void }).__mmDown?.(realOrigin + e.timeStamp);
	};
	addEventListener('pointerdown', start, { capture: true });
	addEventListener('keydown', start, { capture: true });
	try {
		new PerformanceObserver((list) => {
			for (const e of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) if (e.interactionId) s.events.push({ duration: e.duration, start: e.startTime });
		}).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
		new PerformanceObserver((list) => {
			for (const e of list.getEntries() as unknown as { startTime: number; duration: number; scripts: { sourceURL: string; sourceFunctionName: string; invoker: string; invokerType: string; duration: number; startTime: number }[] }[]) {
				s.frames.push({ start: e.startTime, duration: e.duration, scripts: e.scripts.map((x) => ({ url: x.sourceURL, fn: x.sourceFunctionName, invoker: x.invoker, type: x.invokerType, duration: x.duration, start: x.startTime })) });
			}
		}).observe({ type: 'long-animation-frame', buffered: true });
	} catch {}
	Object.defineProperty(globalThis, '__mmResponsiveness', {
		value: {
			read: () => ({
				...s,
				events: s.events.filter((e) => e.start >= s.down - 1),
				frames: s.frames.filter((f) => s.down >= 0 && f.start + f.duration >= s.down),
			}),
			arm: () => {
				armed = true;
			},
			reset: () => {
				Object.assign(s, { down: -1, change: -1, paint: -1, urlAt: -1, navChange: -1, navPaint: -1, lastBefore: -1, prefetch: 0, url: location.href, events: [], frames: [] });
			},
			loaded: () => {
				const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
				const paints = performance.getEntriesByType('paint');
				const fcp = paints.find((p) => p.name === 'first-contentful-paint') ?? paints.find((p) => p.name === 'first-paint');
				return { origin: realOrigin, fcp: fcp?.startTime, ttfb: nav ? nav.responseStart - nav.requestStart : undefined, bytes: nav?.encodedBodySize ?? 0 };
			},
		},
	});
}

interface ProbeState {
	down: number;
	change: number;
	paint: number;
	urlAt: number;
	navChange: number;
	navPaint: number;
	lastBefore: number;
	prefetch: number;
	events: { duration: number; start: number }[];
	frames: { start: number; duration: number; scripts: { url: string; fn: string; invoker: string; type: string; duration: number; start: number }[] }[];
}

const NOISE_WINDOW_MS = 300;
const probeCall = (page: Page, name: 'arm' | 'reset') => page.evaluate((n) => (globalThis as unknown as { __mmResponsiveness?: Record<string, () => void> }).__mmResponsiveness?.[n]?.(), name).catch(() => {});
const readProbe = (page: Page) => page.evaluate(() => (globalThis as unknown as { __mmResponsiveness?: { read(): unknown } }).__mmResponsiveness?.read() as ProbeState | undefined).catch(() => undefined);
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const LONG_TASK_MS = 50;

export function fetchKind(resourceType: string, url: string, contentType: string): Fetch['kind'] {
	if (resourceType === 'script' || /javascript|ecmascript|wasm/.test(contentType) || /\.(m?js|wasm)(\?|$)/.test(new URL(url).pathname)) return 'code';
	if (['fetch', 'xhr', 'document', 'eventsource', 'websocket'].includes(resourceType)) return 'data';
	return 'asset';
}

const short = (url: string, origin: string) => {
	try {
		const u = new URL(url);
		return u.origin === new URL(origin).origin ? u.pathname + u.search : u.href;
	} catch {
		return url || '(inline)';
	}
};

/** Plays the step as a person would: real mouse or touch input, keystrokes for typing. */
async function act(page: Page, step: Step, touch: boolean): Promise<void> {
	const target = locate(page, step.target);
	const options = { timeout: 5_000 };
	if (step.action === 'fill') {
		await target.focus(options);
		await page.keyboard.type(step.value);
		return;
	}
	if (step.action === 'submit') {
		for (const field of step.fields) {
			if (field.check) await locate(page, field.target).check(options);
			else await locate(page, field.target).fill(field.value, options);
		}
	}
	await (touch ? target.tap(options) : target.click(options));
}

function measurable(step: Step): boolean {
	return step.action === 'click' || step.action === 'fill' || step.action === 'submit';
}

/** One fresh page load, one first interaction, and the same interaction again when it stayed on the page. */
export async function measureOnce(browser: Browser, env: SideEnv, route: string, speed: Speed, step: Step, settleMs = 5_000): Promise<Sample> {
	const { context, page, log } = await openPage(browser, env, speed.viewport, { sameOriginOnly: true });
	try {
		let downAt: number | undefined;
		await context.exposeBinding('__mmDown', (_source, at: number) => {
			downAt ??= at;
		});
		await context.addInitScript(responsivenessProbe);
		if (speed.cpu > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: speed.cpu });
		page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
		context.on('page', (popup) => (popup !== page ? popup.close().catch(() => {}) : undefined));
		const pending = new Set<Request>();
		let watched: Request[] | undefined;
		let documents = 0;
		let documentResponse: Response | undefined;
		page.on('request', (r) => {
			pending.add(r);
			watched?.push(r);
			if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++;
		});
		page.on('requestfinished', (r) => pending.delete(r));
		page.on('requestfailed', (r) => pending.delete(r));
		page.on('response', (r) => {
			if (watched && r.request().isNavigationRequest() && r.frame() === page.mainFrame()) documentResponse = r;
		});
		const inflight = () => pending.size;
		const navigations = () => documents;
		await page.goto(new URL(route, env.origin).href, { waitUntil: 'load' });
		await quiet(page, inflight, navigations);
		await probeCall(page, 'arm');
		await sleep(NOISE_WINDOW_MS);
		watched = [];
		const writesBefore = log.writes.length;
		const before = documents;
		try {
			await act(page, step, speed.viewport.isMobile);
		} catch (error) {
			return { result: 'none', fetches: [], longTasks: [], evaluated: [], failed: `${describeTarget(step.target)} could not be used: ${(error as Error).message.split('\n')[0]}` };
		}
		const deadline = Date.now() + settleMs;
		await quiet(page, inflight, navigations);
		const reloaded = documents > before;
		let state: ProbeState | undefined;
		let ms: number | undefined;
		let result: Sample['result'] = 'none';
		let server: Server | undefined;
		if (reloaded && (documentResponse?.status() ?? 200) >= 400) {
			const at = short(documentResponse!.url(), env.origin);
			return { result: 'reloaded', fetches: [], longTasks: [], evaluated: [], failed: `the link leads to ${at}, which answers ${documentResponse!.status()}` };
		}
		if (reloaded) {
			result = 'reloaded';
			let loaded: { origin: number; fcp?: number; ttfb?: number; bytes: number } | undefined;
			while (Date.now() < deadline) {
				loaded = await page.evaluate(() => (globalThis as unknown as { __mmResponsiveness?: { loaded(): unknown } }).__mmResponsiveness?.loaded() as { origin: number; fcp?: number; ttfb?: number; bytes: number } | undefined).catch(() => undefined);
				if (loaded?.fcp !== undefined) break;
				await sleep(50);
			}
			if (loaded?.fcp !== undefined && downAt !== undefined) ms = Math.max(0, loaded.origin + loaded.fcp - downAt);
			if (loaded?.ttfb !== undefined) {
				const url = documentResponse?.url();
				const warmTtfb = url && new URL(url).origin === new URL(env.origin).origin ? await warmServer(env, url) : undefined;
				server = { ttfb: Math.round(loaded.ttfb), ...(warmTtfb !== undefined ? { warmTtfb } : {}), htmlBytes: loaded.bytes, ...servedBy(documentResponse) };
			}
		} else {
			while (Date.now() < deadline) {
				state = await readProbe(page);
				if (!state || !((state.change >= 0 && state.paint < 0) || (state.navChange >= 0 && state.navPaint < 0))) break;
				await sleep(25);
			}
			if (state && state.down >= 0) {
				const eventMs = state.events.length ? Math.max(...state.events.map((e) => e.duration)) : undefined;
				if (state.urlAt >= 0) {
					result = 'navigated';
					// Content swapped before the URL changed has no frame probe of its own: its time is when both had happened.
					const content = state.navPaint >= 0 ? state.navPaint : state.lastBefore >= 0 ? Math.max(state.lastBefore, state.urlAt) : state.paint;
					if (content >= 0) ms = Math.max(content - state.down, eventMs ?? 0);
				} else if (state.paint >= 0) {
					result = 'changed';
					ms = Math.max(state.paint - state.down, eventMs ?? 0);
				} else if (eventMs !== undefined) ms = eventMs;
			}
		}
		const fetches = await Promise.all(
			(watched ?? []).filter((r) => !r.failure()).map(async (r): Promise<Fetch> => {
				const response = await r.response().catch(() => null);
				const sizes = await r.sizes().catch(() => ({ responseBodySize: 0 }));
				return { url: short(r.url(), env.origin), kind: fetchKind(r.resourceType(), r.url(), response?.headers()['content-type'] ?? ''), bytes: sizes.responseBodySize };
			}),
		);
		watched = undefined;
		const longTasks = (state?.frames ?? []).filter((f) => f.duration >= LONG_TASK_MS).map((f): LongTask => {
			const top = [...f.scripts].sort((a, b) => b.duration - a.duration)[0];
			return { ms: Math.round(f.duration), ...(top ? { script: `${short(top.url, env.origin)}${top.fn ? ` ${top.fn}` : ''} (${top.invoker || top.type})` } : {}) };
		});
		const evaluated = [...new Set((state?.frames ?? []).flatMap((f) => f.scripts.filter((x) => x.type === 'classic-script' || x.type === 'module-script').map((x) => short(x.url, env.origin))))];
		const heldBack = log.writes.slice(writesBefore).some((w) => !w.sent);
		let warmMs: number | undefined;
		if (result === 'changed' && step.action !== 'submit') {
			await probeCall(page, 'reset');
			const warm = await act(page, step, speed.viewport.isMobile).then(
				() => true,
				() => false,
			);
			if (warm) {
				await quiet(page, inflight, navigations);
				const until = Date.now() + 2_000;
				let again = await readProbe(page);
				while (again && again.change >= 0 && again.paint < 0 && Date.now() < until) {
					await sleep(25);
					again = await readProbe(page);
				}
				if (again && again.down >= 0 && documents === before) {
					const eventMs = again.events.length ? Math.max(...again.events.map((e) => e.duration)) : 0;
					warmMs = again.paint >= 0 ? Math.max(again.paint - again.down, eventMs) : eventMs || undefined;
				}
			}
		}
		const eventMs = state?.events.length ? Math.max(...state.events.map((e) => e.duration)) : undefined;
		return {
			...(ms !== undefined ? { ms: Math.round(ms) } : {}),
			result,
			...(eventMs !== undefined ? { eventMs: Math.round(eventMs) } : {}),
			...(warmMs !== undefined ? { warmMs: Math.round(warmMs) } : {}),
			fetches,
			longTasks,
			evaluated,
			...(state?.prefetch ? { prefetch: state.prefetch } : {}),
			...(server ? { server } : {}),
			...(heldBack ? { heldBack } : {}),
		};
	} finally {
		await context.close().catch(() => {});
	}
}

function servedBy(response: Response | undefined): { served?: string } {
	if (!response) return {};
	const h = response.headers();
	const parts = ['x-vercel-cache', 'x-nextjs-cache', 'cf-cache-status', 'x-cache', 'age', 'cache-control', 'server'].flatMap((name) => (h[name] ? [`${name}: ${h[name]}`] : []));
	return parts.length ? { served: parts.join(', ') } : {};
}

async function warmServer(env: SideEnv, url: string): Promise<number | undefined> {
	const started = performance.now();
	try {
		const response = await fetchApp(new URL(url, env.origin), { headers: appHeaders(env) });
		const ttfb = performance.now() - started;
		await response.body?.cancel();
		return Math.round(ttfb);
	} catch {
		return undefined;
	}
}

/** Which first steps of the recorded journeys to time: pointer and typing steps, in-page controls before links, at most `max`. */
export function controlsToMeasure(journeys: readonly RecordedJourney[], options: { maxControls?: number; maxLinks?: number } = {}): { steps: { step: Step; navigates: boolean }[]; notMeasured: { control: string; reason: string }[] } {
	const maxControls = options.maxControls ?? DEFAULT_MAX_CONTROLS;
	const maxLinks = options.maxLinks ?? DEFAULT_MAX_LINKS;
	const firsts = new Map<string, { step: Step; navigates: boolean; failed: boolean }>();
	for (const j of journeys) {
		const step = j.steps[0];
		if (!step) continue;
		const key = `${step.target.role}|${step.target.name}|${step.target.nth}`;
		const prev = firsts.get(key);
		const entry = { step, navigates: Boolean(j.expected[0]?.navigated), failed: Boolean(j.expected[0]?.failed) };
		if (!prev || (!measurable(prev.step) && measurable(step))) firsts.set(key, entry);
	}
	const notMeasured: { control: string; reason: string }[] = [];
	const inPage: { step: Step; navigates: boolean }[] = [];
	const links: { step: Step; navigates: boolean }[] = [];
	for (const { step, navigates, failed } of firsts.values()) {
		const control = describeTarget(step.target);
		if (failed) notMeasured.push({ control, reason: 'it could not be used on the old page' });
		else if (!measurable(step)) notMeasured.push({ control, reason: `the journeys reach it only by ${step.action === 'press' ? 'keyboard' : 'choosing an option'}, which has no pointer input to time` });
		else (navigates ? links : inPage).push({ step, navigates });
	}
	const takeLinks = links.slice(0, Math.min(maxLinks, maxControls));
	const takeInPage = inPage.slice(0, Math.max(0, maxControls - takeLinks.length));
	for (const left of [...inPage.slice(takeInPage.length), ...links.slice(takeLinks.length)]) notMeasured.push({ control: describeTarget(left.step.target), reason: `over the ${maxControls}-control limit (${maxLinks} links) per route: raise --interaction-controls` });
	return { steps: [...takeInPage, ...takeLinks], notMeasured };
}

export interface Verdict {
	readonly ok: boolean;
	/** Another run is needed before the verdict holds: only one run exceeded. */
	readonly rerun: boolean;
	readonly oldMs?: number;
	readonly newMs?: number;
	readonly slower: boolean;
	readonly overBudget: boolean;
	readonly allowedMs?: number;
}

/** NEW fails only when every one of its runs exceeds the slower OLD run by max(16 ms, 10%), or the budget; one run over asks for another. */
export function judge(old: readonly (number | undefined)[], next: readonly (number | undefined)[], budgetMs?: number): Verdict {
	const olds = old.filter((n): n is number => n !== undefined);
	const news = next.filter((n): n is number => n !== undefined);
	if (!news.length) return { ok: true, rerun: false, slower: false, overBudget: false, ...(olds.length ? { oldMs: Math.max(...olds) } : {}) };
	const oldMs = olds.length ? Math.max(...olds) : undefined;
	const allowedMs = oldMs !== undefined ? oldMs + Math.max(SLACK_MS, oldMs * SLACK_RATIO) : undefined;
	const slow = (n: number) => allowedMs !== undefined && n > allowedMs;
	const over = (n: number) => budgetMs !== undefined && n > budgetMs;
	const exceeds = (n: number) => slow(n) || over(n);
	const all = news.every(exceeds);
	if (all && news.length < 2) return { ok: false, rerun: true, newMs: news[0]!, slower: slow(news[0]!), overBudget: over(news[0]!), ...(oldMs !== undefined ? { oldMs, allowedMs: allowedMs! } : {}) };
	const newMs = all ? Math.max(...news) : Math.min(...news.filter((n) => !exceeds(n)));
	return { ok: !all, rerun: false, newMs, slower: all && news.every(slow), overBudget: all && news.every(over), ...(oldMs !== undefined ? { oldMs, allowedMs: allowedMs! } : {}) };
}

const kB = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
const msText = (n: number | undefined) => (n === undefined ? 'no visible result' : `${n} ms`);

/** Why a NEW interaction was slow, from what its runs saw: code it fetched, a runtime starting, a long task, data it waited on, cold against warm. */
export function likelyCause(samples: readonly Sample[], kind: ControlTiming['kind'], old: readonly Sample[] = []): string {
	const s = [...samples].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))[0];
	if (!s) return 'not measured';
	const causes: string[] = [];
	if (kind === 'navigation') {
		const o = old[0];
		if (s.result === 'reloaded' && o && o.result === 'navigated') causes.push('a full page load where the old app navigates in the page (client-side), with a blank page between');
		if (s.server) {
			const oldServer = o?.server;
			const cold = s.server.warmTtfb !== undefined && s.server.ttfb > s.server.warmTtfb + 100 ? `, ${s.server.warmTtfb} ms when fetched again straight after (a cold server function)` : '';
			causes.push(`server time ${s.server.ttfb} ms to first byte${cold}${oldServer ? `, old ${oldServer.ttfb} ms` : ''}${s.server.served ? ` (${s.server.served})` : ''}`);
			if (s.server.htmlBytes) causes.push(`${kB(s.server.htmlBytes)} of HTML`);
		}
		if (o?.prefetch && !s.prefetch) causes.push(`the old page had ${o.prefetch} prefetch hint${o.prefetch === 1 ? '' : 's'} when the pointer went down, the new one none`);
		else if (!s.prefetch) causes.push('no prefetch');
	}
	const code = s.fetches.filter((f) => f.kind === 'code');
	if (kind === 'in-page' && code.length) causes.push(`code fetch: ${code.map((f) => `${f.url} (${kB(f.bytes)})`).join(', ')}`);
	if (s.evaluated.length) causes.push(`runtime start: ${s.evaluated.join(', ')} evaluated on the interaction`);
	const long = [...s.longTasks].sort((a, b) => b.ms - a.ms)[0];
	if (long) causes.push(`long task ${long.ms} ms${long.script ? `, top script ${long.script}` : ''}`);
	const data = s.fetches.filter((f) => f.kind === 'data' && !/^\/?$/.test(f.url));
	if (kind === 'in-page' && data.length) causes.push(`waits on ${data.length} data fetch${data.length === 1 ? '' : 'es'}: ${data.slice(0, 3).map((f) => f.url).join(', ')}`);
	if (s.warmMs !== undefined && s.ms !== undefined && s.ms > s.warmMs * 2 && s.ms - s.warmMs > SLACK_MS) causes.push(`first-interaction cost: ${s.ms} ms cold, ${s.warmMs} ms the second time`);
	return causes.join('; ') || 'no single cause seen: the handler itself is slower';
}

/** Times every pointer control and internal link the journeys exercised, on a fresh load, at desktop speed and on a throttled phone. */
export async function checkResponsiveness(browser: Browser, envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string, journeys: readonly RecordedJourney[], options: ResponsivenessOptions = {}): Promise<{ responsiveness: Responsiveness; failures: Failure[] }> {
	const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
	const cpu = options.cpu ?? DEFAULT_CPU;
	const picked = controlsToMeasure(journeys, options);
	const all = speeds(cpu);
	const controls: ControlTiming[] = new Array(picked.steps.length);
	const notMeasured = [...picked.notMeasured];
	const pair = pairFor(browser, envs, route);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, picked.steps.length) }, async () => {
			while (next < picked.steps.length) {
				const i = next++;
				const { step, navigates } = picked.steps[i]!;
				const kind = navigates ? 'navigation' : 'in-page';
				const timings: SpeedTiming[] = [];
				for (const speed of all) {
					const first = await pair(speed, step);
					const olds = [first.o];
					const news = [first.n];
					let verdict = verdictFor(kind, speed, olds, news, budgetMs);
					if (verdict.rerun) {
						const again = await pair(speed, step);
						olds.push(again.o);
						news.push(again.n);
						verdict = verdictFor(kind, speed, olds, news, budgetMs);
					}
					timings.push(timing(speed, kind, olds, news, verdict, budgetMs));
				}
				controls[i] = { control: describeTarget(step.target), step: describeStep(step), kind, speeds: timings };
			}
		}),
	);
	const measured = controls.filter(Boolean);
	await addVariance(measured, picked.steps, all, pair, budgetMs);
	const responsiveness: Responsiveness = { budgetMs, cpu, controls: measured, notMeasured, worst: worstOf(measured) };
	return { responsiveness, failures: failuresOf(route, measured, all) };
}

function pairFor(browser: Browser, envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string) {
	return async (speed: Speed, step: Step) => ({ o: await measureOnce(browser, envs.old, route, speed, step), n: await measureOnce(browser, envs.new, route, speed, step) });
}

// The slowest control at each speed is measured twice even when it passed, so the report states how much runs vary.
async function addVariance(controls: ControlTiming[], steps: readonly { step: Step }[], all: readonly Speed[], pair: (speed: Speed, step: Step) => Promise<{ o: Sample; n: Sample }>, budgetMs: number): Promise<void> {
	for (const speed of all) {
		let worst = -1;
		controls.forEach((c, i) => {
			const t = c.speeds.find((x) => x.speed === speed.name)!;
			const w = worst >= 0 ? controls[worst]!.speeds.find((x) => x.speed === speed.name)! : undefined;
			if ((t.newMs ?? -1) > (w?.newMs ?? -1)) worst = i;
		});
		if (worst < 0 || controls[worst]!.speeds.find((x) => x.speed === speed.name)!.new.length > 1) continue;
		const c = controls[worst]!;
		const at = c.speeds.findIndex((x) => x.speed === speed.name);
		const t = c.speeds[at]!;
		const again = await pair(speed, steps[worst]!.step);
		const olds = [...t.old, again.o];
		const news = [...t.new, again.n];
		const speedsCopy = [...c.speeds];
		speedsCopy[at] = timing(speed, c.kind, olds, news, verdictFor(c.kind, speed, olds, news, budgetMs), budgetMs);
		controls[worst] = { ...c, speeds: speedsCopy };
	}
}

function verdictFor(kind: ControlTiming['kind'], speed: Speed, olds: readonly Sample[], news: readonly Sample[], budgetMs: number): Verdict {
	if (olds.some((s) => s.heldBack) || news.some((s) => s.heldBack)) return { ok: true, rerun: false, slower: false, overBudget: false };
	// Navigation is held to the old app at the throttled speed only; the desktop figures are reported.
	if (kind === 'navigation' && speed.name !== 'throttled') return { ...judge(olds.map((s) => s.ms), news.map((s) => s.ms)), ok: true, rerun: false, slower: false, overBudget: false };
	return judge(
		olds.map((s) => s.ms),
		news.map((s) => s.ms),
		kind === 'in-page' && speed.name === 'throttled' ? budgetMs : undefined,
	);
}

function timing(speed: Speed, kind: ControlTiming['kind'], olds: readonly Sample[], news: readonly Sample[], verdict: Verdict, budgetMs: number): SpeedTiming {
	const problems: string[] = [];
	const oldMs = verdict.oldMs;
	const newMs = verdict.newMs;
	if (verdict.slower) problems.push(`slower than the old ${msText(oldMs)} by more than max(16 ms, 10%)`);
	if (verdict.overBudget) problems.push(`over the ${budgetMs} ms budget`);
	const oldChanged = olds.some((s) => s.result !== 'none');
	if (kind === 'in-page' && oldChanged && news.length && news.every((s) => s.result === 'none' && !s.failed && !s.heldBack)) problems.push('no visible result on the new page, where the old page changed');
	const code = news.flatMap((s) => (kind === 'in-page' ? s.fetches.filter((f) => f.kind === 'code') : []));
	if (code.length) problems.push(`fetched code on the first interaction: ${[...new Set(code.map((f) => `${f.url} (${kB(f.bytes)})`))].join(', ')}`);
	const spread = olds.length > 1 && news.length > 1 ? { old: range(olds), new: range(news) } : undefined;
	return {
		speed: speed.name,
		old: olds,
		new: news,
		...(oldMs !== undefined ? { oldMs } : {}),
		...(newMs !== undefined ? { newMs } : {}),
		...(spread ? { spread } : {}),
		ok: problems.length === 0,
		problems,
		...(problems.length ? { cause: likelyCause(news, kind, olds) } : {}),
	};
}

function range(samples: readonly Sample[]): number {
	const values = samples.flatMap((s) => (s.ms !== undefined ? [s.ms] : []));
	return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
}

export function worstOf(controls: readonly ControlTiming[]): Responsiveness['worst'] {
	const out: { interaction: Partial<Record<SpeedName, Worst>>; navigation: Partial<Record<SpeedName, Worst>> } = { interaction: {}, navigation: {} };
	for (const c of controls) {
		const bucket = c.kind === 'navigation' ? out.navigation : out.interaction;
		for (const t of c.speeds) {
			const current = bucket[t.speed];
			const slowestOld = Math.max(current?.slowestOld ?? -1, t.oldMs ?? -1);
			const kept = t.newMs !== undefined && (!current || (current.new ?? -1) < t.newMs) ? { control: c.control, ...(t.oldMs !== undefined ? { old: t.oldMs } : {}), new: t.newMs } : current;
			if (kept) bucket[t.speed] = { ...kept, ...(slowestOld >= 0 ? { slowestOld } : {}) };
		}
	}
	return { ...(Object.keys(out.interaction).length ? { interaction: out.interaction } : {}), ...(Object.keys(out.navigation).length ? { navigation: out.navigation } : {}) };
}

function failuresOf(route: string, controls: readonly ControlTiming[], all: readonly Speed[]): Failure[] {
	const failures: Failure[] = [];
	for (const c of controls) {
		for (const t of c.speeds) {
			if (t.ok) continue;
			const speed = all.find((s) => s.name === t.speed)!;
			const what = c.kind === 'navigation' ? 'navigation from' : 'first interaction with';
			const runs = (samples: readonly Sample[]) => samples.map((s) => msText(s.ms)).join(', ');
			failures.push({
				route,
				dimension: 'responsiveness',
				check: `${what} ${c.control} (${speed.label})`,
				viewport: speed.viewport.name,
				expected: `old ${msText(t.oldMs)} (runs ${runs(t.old)}); new within max(16 ms, 10%) of it${c.kind === 'in-page' && speed.name === 'throttled' ? ` and under the budget` : ''}${c.kind === 'in-page' ? ', fetching no code' : ''}`,
				actual: `new ${msText(t.newMs)} (runs ${runs(t.new)}); likely cause: ${t.cause}; ${t.problems.join('; ')}`,
				hint: c.kind === 'navigation' ? HINTS.navigation : HINTS.responsiveness,
			});
		}
	}
	return failures;
}

/** The run's slowest first interaction and navigation on each side, and each route's slowest control, for the headline. */
export function summarizeResponsiveness(routes: readonly RouteResult[], options: ResponsivenessOptions = {}): ResponsivenessSummary {
	const slowest = (kind: ControlTiming['kind']) => {
		const out: Partial<Record<SpeedName, Slowest>> = {};
		for (const r of routes) {
			for (const c of r.responsiveness?.controls ?? []) {
				if (c.kind !== kind) continue;
				for (const t of c.speeds) {
					const at = `${r.route}${r.role && r.role !== 'anonymous' ? ` as ${r.role}` : ''} ${c.control}`;
					const cur: Slowest = out[t.speed] ?? {};
					out[t.speed] = {
						...cur,
						...(t.oldMs !== undefined && t.oldMs > (cur.old ?? -1) ? { old: t.oldMs, oldAt: at } : {}),
						...(t.newMs !== undefined && t.newMs > (cur.new ?? -1) ? { new: t.newMs, newAt: at } : {}),
					};
				}
			}
		}
		return Object.keys(out).length ? out : undefined;
	};
	const interaction = slowest('in-page');
	const navigation = slowest('navigation');
	return {
		cpu: options.cpu ?? DEFAULT_CPU,
		budgetMs: options.budgetMs ?? DEFAULT_BUDGET_MS,
		...(interaction ? { interaction } : {}),
		...(navigation ? { navigation } : {}),
		routes: routes.flatMap((r) => (r.responsiveness ? [{ route: r.route, ...(r.role ? { role: r.role } : {}), ok: r.dimensions.responsiveness !== 'fail', ...(r.responsiveness.worst.interaction ? { interaction: r.responsiveness.worst.interaction } : {}), ...(r.responsiveness.worst.navigation ? { navigation: r.responsiveness.worst.navigation } : {}) }] : [])),
	};
}

const pair = (s: Slowest | undefined) => `old ${msText(s?.old)} → new ${msText(s?.new)}`;

/** `First interaction: old X ms → new Y ms (4x CPU)` and the same for navigation; desktop figures after. */
export function headlines(summary: ResponsivenessSummary): string[] {
	const lines: string[] = [];
	for (const [label, part] of [['First interaction', summary.interaction], ['Navigation', summary.navigation]] as const) {
		if (!part) continue;
		lines.push(`${label}: ${pair(part.throttled)} (${summary.cpu}x CPU)${part.desktop ? `; desktop ${pair(part.desktop)}` : ''}`);
	}
	return lines;
}

/** The slowest new control of a route at the throttled speed, old against new. */
export function worstLine(r: Responsiveness): string {
	const parts: string[] = [];
	const i = r.worst.interaction?.throttled;
	const n = r.worst.navigation?.throttled;
	if (i) parts.push(`slowest first interaction ${i.control}: old ${msText(i.old)} → new ${msText(i.new)}`);
	if (n) parts.push(`slowest navigation ${n.control}: old ${msText(n.old)} → new ${msText(n.new)}`);
	return `${parts.join('; ') || 'nothing timed'} (${r.cpu}x CPU)${r.notMeasured.length ? `; ${r.notMeasured.length} not timed` : ''}`;
}

export type RouteTiming = Responsiveness['worst'] & { readonly cpu: number };

/** The headlines across routes' last checks, as status shows them. */
export function timingHeadlines(routes: readonly { readonly route: string; readonly timing?: RouteTiming }[]): string[] {
	const timed = routes.filter((r) => r.timing);
	if (!timed.length) return [];
	const across = (kind: 'interaction' | 'navigation') => {
		const out: Partial<Record<SpeedName, Slowest>> = {};
		for (const r of timed) {
			for (const [speed, w] of Object.entries(r.timing![kind] ?? {}) as [SpeedName, Worst][]) {
				const cur: Slowest = out[speed] ?? {};
				const at = `${r.route} ${w.control}`;
				const old = w.slowestOld ?? w.old;
				out[speed] = { ...cur, ...(old !== undefined && old > (cur.old ?? -1) ? { old, oldAt: r.route } : {}), ...(w.new !== undefined && w.new > (cur.new ?? -1) ? { new: w.new, newAt: at } : {}) };
			}
		}
		return Object.keys(out).length ? out : undefined;
	};
	const interaction = across('interaction');
	const navigation = across('navigation');
	return headlines({ cpu: timed[0]!.timing!.cpu, budgetMs: DEFAULT_BUDGET_MS, ...(interaction ? { interaction } : {}), ...(navigation ? { navigation } : {}), routes: [] });
}
