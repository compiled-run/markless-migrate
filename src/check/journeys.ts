import type { Browser, BrowserContext, Locator, Page, Request } from 'playwright';
import { frameworkTransport, openPage, requestLine, type SideEnv } from './browser.ts';
import { originInQuery } from './capture.ts';
import { HINTS } from './hints.ts';
import { diffLines, lineTemplates, template } from './noise.ts';
import type { Dimension, Failure, Viewport, WriteLine } from './types.ts';

export interface Target {
	readonly role: string;
	readonly name: string;
	readonly nth: number;
}

export type Step =
	| { readonly action: 'click'; readonly target: Target }
	| { readonly action: 'press'; readonly key: 'Enter' | 'Space' | 'Escape' | 'ArrowDown'; readonly target: Target }
	| { readonly action: 'fill'; readonly target: Target; readonly value: string }
	| { readonly action: 'select'; readonly target: Target; readonly value: string }
	| { readonly action: 'submit'; readonly target: Target; readonly fields: readonly { readonly target: Target; readonly value: string; readonly check?: boolean }[] };

export interface StepResult {
	readonly url: string;
	readonly added: readonly string[];
	readonly removed: readonly string[];
	readonly requests: readonly string[];
	/** Requests of this step that write, and whether each was sent or held back. */
	readonly writes?: readonly WriteLine[];
	readonly errors: readonly string[];
	readonly announcements: readonly string[];
	readonly focus: string;
	/** The step loaded a document, changed the path or followed a link: the landing page's content and focus are that route's and router's own checks. */
	readonly navigated: boolean;
	/** Set when the step could not be performed, for example because its target is missing. */
	readonly failed?: string;
}

export interface Journey {
	readonly name: string;
	readonly steps: readonly Step[];
}

export interface RecordedJourney extends Journey {
	readonly expected: readonly StepResult[];
}

const ROLES = ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'textbox', 'searchbox', 'spinbutton', 'combobox'] as const;
const DESTRUCTIVE = /\b(log ?out|sign ?out|delete|remove|destroy|unsubscribe|deactivate|close (my|your) account)\b/i;
/** How long exploring one route may take by default; what is left is listed as not exercised. */
export const DEFAULT_JOURNEY_BUDGET_MS = 120_000;
const MAX_DEPTH = 4;
const CONCURRENCY = 8;
const STEP_TIMEOUT = 3_000;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

// A redirect may name the app by another loopback host (Next builds it from the request); on the same port it is still this app.
export function localUrl(url: string, origin: string): string {
	const u = new URL(url);
	const o = new URL(origin);
	if (u.origin === o.origin || (LOOPBACK.has(u.hostname) && LOOPBACK.has(o.hostname) && u.port === o.port)) return originInQuery(originInQuery(u.pathname + u.search + u.hash, o.origin), u.origin);
	return url;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function describeTarget(t: Target): string {
	return `${t.role}${t.name ? ` "${t.name}"` : ''}${t.nth ? ` #${t.nth + 1}` : ''}`;
}

export function describeStep(step: Step): string {
	switch (step.action) {
		case 'click':
			return `click ${describeTarget(step.target)}`;
		case 'press':
			return `press ${step.key} on ${describeTarget(step.target)}`;
		case 'fill':
			return `type "${step.value}" into ${describeTarget(step.target)}`;
		case 'select':
			return `choose "${step.value}" in ${describeTarget(step.target)}`;
		case 'submit':
			return `fill ${step.fields.map((f) => describeTarget(f.target)).join(', ')} and submit with ${describeTarget(step.target)}`;
	}
}

export function locate(page: Page, t: Target): Locator {
	if (t.role === 'summary') return page.locator('summary').filter({ hasText: new RegExp(`^\\s*${escapeRegex(t.name)}\\s*$`) }).nth(t.nth);
	return page.getByRole(t.role as Parameters<Page['getByRole']>[0], { name: t.name, exact: true }).nth(t.nth);
}

function sample(type: string, name: string): string {
	const n = name.toLowerCase();
	if (type === 'email' || n.includes('email')) return 'ada@example.com';
	if (type === 'number' || type === 'range') return '42';
	if (type === 'tel' || n.includes('phone')) return '+44 20 7946 0000';
	if (type === 'url') return 'https://example.com';
	if (type === 'date') return '2026-10-27';
	if (type === 'search') return 'coffee';
	if (n.includes('name')) return 'Ada Lovelace';
	return 'Sample text from markless-migrate';
}

interface Candidate {
	readonly target: Target;
	readonly href?: string;
	readonly type?: string;
	readonly options?: readonly string[];
	/** Where it sits: main content, a shared layout landmark (header, nav, aside, footer) or neither. */
	readonly region: string;
	readonly importance: number;
	/** Same on every route that renders the same layout control; per route otherwise. */
	readonly signature: string;
	/** Why check does not use it, when it does not. */
	readonly skip?: string;
	/** Exercised by another dimension rather than by a journey. */
	readonly covered?: string;
}

const LAYOUT = new Set(['header', 'banner', 'nav', 'navigation', 'aside', 'complementary', 'footer', 'contentinfo']);

/** Main content first, and in it tables and forms: a page's own controls before the shared header and sidebar. */
function importance(place: { region: string; table: boolean; form: boolean; dialog: boolean }): number {
	if (place.table) return 4;
	if (place.form) return 3;
	if (place.region === 'main' || place.dialog) return 2;
	return LAYOUT.has(place.region) ? 0 : 1;
}

export const isLayout = (c: Pick<Candidate, 'region'>) => LAYOUT.has(c.region);

async function candidates(page: Page, origin: string): Promise<Candidate[]> {
	const out: Candidate[] = [];
	const inRegion = new Map<string, number>();
	const add = (c: Omit<Candidate, 'signature'>) => {
		const group = `${c.region}|${c.target.role}|${c.target.name}`;
		const n = inRegion.get(group) ?? 0;
		inRegion.set(group, n + 1);
		out.push({ ...c, signature: isLayout(c) ? `${group}|${n}` : `page|${c.target.role}|${c.target.name}|${c.target.nth}` });
	};
	for (const role of ROLES) {
		const seen = new Map<string, number>();
		for (const locator of await page.getByRole(role).all()) {
			const line = (await locator.ariaSnapshot({ timeout: STEP_TIMEOUT }).catch(() => '')).split('\n')[0] ?? '';
			const name = /^- [\w-]+ "((?:[^"\\]|\\.)*)"/.exec(line)?.[1]?.replace(/\\(.)/g, '$1') ?? '';
			const nth = seen.get(name) ?? 0;
			seen.set(name, nth + 1);
			if (!(await locator.isVisible().catch(() => false)) || (await locator.isDisabled().catch(() => true))) continue;
			const info = await locator.evaluate(describeElement, undefined, { timeout: STEP_TIMEOUT }).catch(() => undefined);
			if (!info) continue;
			const target = { role, name, nth };
			const base = { target, href: info.href, type: info.type, options: info.options, region: info.region, importance: importance(info) };
			if (role === 'link') {
				if (!info.href || /^(mailto|tel):/i.test(info.href)) {
					add({ ...base, covered: 'its address is compared by the rendered check' });
					continue;
				}
				if (/^javascript:/i.test(info.href)) {
					add(base);
					continue;
				}
				const url = new URL(info.href, page.url());
				if (url.origin !== origin) {
					add({ ...base, covered: 'it leaves the app: its address is compared by the rendered check' });
					continue;
				}
				if (DESTRUCTIVE.test(url.pathname)) {
					add({ ...base, skip: 'its address looks destructive (sign out, delete...), so check does not follow it' });
					continue;
				}
			}
			if (DESTRUCTIVE.test(name)) {
				add({ ...base, skip: 'its name looks destructive (sign out, delete...), so check does not use it' });
				continue;
			}
			add(base);
		}
	}
	const summaries = await page.locator('summary').all();
	const seen = new Map<string, number>();
	for (const locator of summaries) {
		const name = ((await locator.textContent({ timeout: STEP_TIMEOUT }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
		const nth = seen.get(name) ?? 0;
		seen.set(name, nth + 1);
		if (!(await locator.isVisible().catch(() => false))) continue;
		const info = await locator.evaluate(describeElement, undefined, { timeout: STEP_TIMEOUT }).catch(() => undefined);
		if (info) add({ target: { role: 'summary', name, nth }, region: info.region, importance: importance(info) });
	}
	return out;
}

function describeElement(el: Element) {
	const main = el.closest('main, [role="main"]');
	const landmark = main ? null : el.closest('header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"]');
	return {
		href: el.getAttribute('href') ?? undefined,
		type: (el.getAttribute('type') ?? '').toLowerCase(),
		options: el instanceof HTMLSelectElement ? [...el.options].map((o) => o.value) : [],
		region: main ? 'main' : landmark ? (landmark.getAttribute('role') ?? landmark.tagName.toLowerCase()) : '',
		table: Boolean(el.closest('table, [role="table"], [role="grid"], [role="treegrid"]')),
		form: Boolean(el.closest('form')) || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName),
		dialog: Boolean(el.closest('dialog, [role="dialog"], [role="alertdialog"]')),
	};
}

async function forms(page: Page, origin: string, found: readonly Candidate[]): Promise<Step[]> {
	const steps: Step[] = [];
	const all = await page.locator('form').all();
	for (const form of all) {
		const action = await form.evaluate((f: HTMLFormElement) => f.action).catch(() => '');
		if (action && new URL(action).origin !== origin) continue;
		const fields: { target: Target; value: string; check?: boolean }[] = [];
		let submit: Target | undefined;
		for (const c of found) {
			if (c.skip || c.covered) continue;
			const inForm = await locate(page, c.target)
				.evaluate((el, f) => f.contains(el), await form.elementHandle())
				.catch(() => false);
			if (!inForm) continue;
			if (['textbox', 'searchbox', 'spinbutton'].includes(c.target.role)) fields.push({ target: c.target, value: sample(c.type ?? '', c.target.name) });
			else if (c.target.role === 'checkbox') fields.push({ target: c.target, value: 'on', check: true });
			else if (c.target.role === 'button' && (c.type === 'submit' || c.type === '') && !submit) submit = c.target;
		}
		if (submit) steps.push({ action: 'submit', target: submit, fields });
	}
	return steps;
}

/** The one step that uses an element as a visitor would, so a journey made of it exercises the element. */
function primaryStep(c: Candidate): Step | undefined {
	const t = c.target;
	if (t.role === 'textbox' || t.role === 'searchbox' || t.role === 'spinbutton') return { action: 'fill', target: t, value: sample(c.type ?? '', t.name) };
	if (t.role === 'combobox' && c.options?.length) return c.options.length > 1 ? { action: 'select', target: t, value: c.options[1]! } : undefined;
	if (t.role === 'button' && c.type === 'submit') return { action: 'press', key: 'Enter', target: t };
	return { action: 'click', target: t };
}

/** The keyboard paths to the same element: Enter on links and buttons, Space on buttons and toggles. */
function keyboardSteps(c: Candidate): Step[] {
	const t = c.target;
	if (t.role === 'link') return [{ action: 'press', key: 'Enter', target: t }];
	if (t.role === 'button' && c.type === 'submit') return [];
	if (t.role === 'button' || t.role === 'summary' || t.role === 'tab' || t.role.startsWith('menuitem') || t.role === 'option') return [{ action: 'press', key: 'Enter', target: t }, { action: 'press', key: 'Space', target: t }];
	if (t.role === 'checkbox' || t.role === 'radio' || t.role === 'switch') return [{ action: 'press', key: 'Space', target: t }];
	return [];
}

// App requests only: framework transport (React Server Component payloads, server-action posts, /_next/ data) and plain page loads are left to the URL.
function appRequest(request: Request, origin: string): string | undefined {
	const url = new URL(request.url());
	if (url.origin !== origin) return undefined;
	const type = request.resourceType();
	if (frameworkTransport(request, url)) return undefined;
	if (type === 'document' ? request.method() === 'GET' : type !== 'fetch' && type !== 'xhr') return undefined;
	return requestLine(request.method(), url, origin, request.postData(), request.headers()['content-type'] ?? '');
}

function multisetDiff(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
	const counts = new Map<string, number>();
	for (const line of before) counts.set(line, (counts.get(line) ?? 0) + 1);
	const added: string[] = [];
	for (const line of after) {
		const n = counts.get(line) ?? 0;
		if (n > 0) counts.set(line, n - 1);
		else added.push(line);
	}
	const removed = [...counts.entries()].flatMap(([line, n]) => Array.from({ length: n }, () => line));
	return { added, removed };
}

function liveRegions() {
	return [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], output')]
		.filter((el) => el.checkVisibility({ visibilityProperty: true }))
		.map((el) => `${el.getAttribute('role') ?? el.tagName.toLowerCase()}: ${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`);
}

async function focusLabel(page: Page): Promise<string> {
	// Asks whether anything has focus first, so a snapshot slowed by load is waited for instead of read as "body".
	const focused = await page.evaluate(() => Boolean(document.activeElement && document.activeElement !== document.body)).catch(() => false);
	if (!focused) return 'body';
	const line = (await page.locator(':focus').first().ariaSnapshot({ timeout: STEP_TIMEOUT }).catch(() => '')).split('\n')[0] ?? '';
	return line.replace(/^- /, '').replace(/:$/, '') || 'body';
}

async function snapshot(page: Page, origin: string): Promise<string[]> {
	// Indentation is structure, which the rendered check compares; a step's effect is which nodes appear and disappear.
	return (await page.locator('body').ariaSnapshot({ timeout: 5_000 }).catch(() => '')).split(origin).join('').split('\n').map((line) => line.trim());
}

const IDLE_MS = 150;
const IDLE_LIMIT_MS = 3_000;

const pendingTimers = (page: Page) => page.evaluate(() => (globalThis as { __markless_migrate_pending_timers__?: () => number }).__markless_migrate_pending_timers__?.() ?? 0).catch(() => 0);

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// A <meta http-equiv="refresh"> that sends the visitor to another address within a few seconds.
function scheduledRefresh(): { delay: number } | null {
	const meta = document.querySelector('meta[http-equiv="refresh" i]');
	const [delay, rest = ''] = (meta?.getAttribute('content') ?? '').split(/[;,](.*)/s);
	const seconds = Number.parseFloat(delay ?? '');
	const target = /url\s*=\s*['"]?([^'"\s]+)/i.exec(rest)?.[1];
	if (!meta || !(seconds >= 0 && seconds <= 5) || !target || new URL(target, location.href).href === location.href) return null;
	return { delay: seconds };
}

// No request in flight and no timeout of up to a second due for 150 ms (at most 3 s); a poll that came back late means the checker itself was held up, and what began meanwhile may not have been seen yet.
async function idle(page: Page, inflight: () => number): Promise<void> {
	const deadline = Date.now() + IDLE_LIMIT_MS;
	let idleSince = Date.now();
	let last = idleSince;
	while (Date.now() < deadline) {
		const busy = inflight() > 0 || (await pendingTimers(page)) > 0;
		const now = Date.now();
		if (busy || now - last > IDLE_MS / 2) idleSince = now;
		else if (now - idleSince >= IDLE_MS) break;
		last = now;
		await sleep(25);
	}
}

/** Settled: the page has loaded and gone idle; a redirect that loads another document (a script's or a meta refresh's) is followed, and that document waited for the same way; then two frames. */
export async function quiet(page: Page, inflight: () => number, navigations: () => number = () => 0): Promise<void> {
	for (let round = 0; round < 5; round++) {
		await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
		const before = navigations();
		await idle(page, inflight);
		const refresh = await page.evaluate(scheduledRefresh).catch(() => null);
		if (refresh && typeof refresh === 'object') {
			const until = Date.now() + refresh.delay * 1000 + 2_000;
			while (navigations() === before && Date.now() < until) await sleep(25);
		}
		if (navigations() === before) break;
	}
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))).catch(() => {});
}

async function perform(page: Page, step: Step): Promise<void> {
	const options = { timeout: STEP_TIMEOUT };
	const target = locate(page, step.target);
	switch (step.action) {
		case 'click':
			return target.click(options);
		case 'press':
			await target.focus(options);
			return page.keyboard.press(step.key);
		case 'fill':
			return target.fill(step.value, options);
		case 'select':
			await target.selectOption(step.value, options);
			return;
		case 'submit':
			for (const field of step.fields) {
				if (field.check) await locate(page, field.target).check(options);
				else await locate(page, field.target).fill(field.value, options);
			}
			return target.click(options);
	}
}

export interface Session {
	readonly context: BrowserContext;
	readonly page: Page;
	run(step: Step): Promise<StepResult>;
	close(): Promise<void>;
}

export async function openSession(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<Session> {
	const origin = env.origin;
	const { context, page, log } = await openPage(browser, env, viewport, { sameOriginOnly: true });
	const host = new URL(origin).origin;
	page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
	let requests: Request[] = [];
	let errors: string[] = [];
	const pending = new Set<Request>();
	page.on('request', (request) => {
		pending.add(request);
		requests.push(request);
	});
	page.on('requestfinished', (request) => pending.delete(request));
	page.on('requestfailed', (request) => pending.delete(request));
	const inflight = () => pending.size;
	let documentLoaded = false;
	let documents = 0;
	page.on('request', (request) => {
		if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
		documentLoaded = true;
		documents++;
	});
	const navigations = () => documents;
	page.on('console', (message) => {
		// A failed resource load is reported by the assets check of the page that loads it.
		if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text().split(origin).join(''));
	});
	page.on('pageerror', (error) => errors.push(error.message.split(origin).join('')));
	await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
	await quiet(page, inflight, navigations);
	// Where a redirect landed is the http and auth checks' business; a step that stays there compares alike.
	const landing = localUrl(page.url(), origin);
	const redirected = landing !== localUrl(new URL(route, origin).href, origin);
	return {
		context,
		page,
		async run(step) {
			const startPath = new URL(page.url()).pathname;
			const href = step.target.role === 'link' ? await locate(page, step.target).getAttribute('href', { timeout: STEP_TIMEOUT }).catch(() => null) : null;
			documentLoaded = false;
			const before = await snapshot(page, origin);
			const liveBefore = await page.evaluate(liveRegions).catch(() => [] as string[]);
			requests = [];
			errors = [];
			const writesBefore = log.writes.length;
			let failed: string | undefined;
			try {
				await perform(page, step);
			} catch (error) {
				failed = `${describeTarget(step.target)} could not be used: ${(error as Error).message.split('\n')[0]}`;
			}
			await quiet(page, inflight, navigations);
			const after = await snapshot(page, origin);
			const liveAfter = await page.evaluate(liveRegions).catch(() => [] as string[]);
			const { added, removed } = multisetDiff(before, after);
			const writes = log.writes.slice(writesBefore);
			const writeOf = new Map(writes.map((w) => [w.request, w.line]));
			return {
				url: redirected && localUrl(page.url(), origin) === landing ? 'the page the route redirected to' : localUrl(page.url(), origin),
				navigated: documentLoaded || new URL(page.url()).pathname !== startPath || (href !== null && new URL(href, page.url()).href === page.url()),
				added,
				removed,
				requests: requests.flatMap((r) => {
					const line = writeOf.get(r) ?? appRequest(r, host);
					return line ? [line] : [];
				}),
				...(writes.length ? { writes: writes.map((w) => ({ line: w.line, reason: w.reason, sent: w.sent })) } : {}),
				errors: [...errors],
				announcements: liveAfter.filter((line) => !liveBefore.includes(line)),
				focus: await focusLabel(page),
				...(failed ? { failed } : {}),
			};
		},
		close: () => context.close(),
	};
}

export async function replay(browser: Browser, env: SideEnv, route: string, viewport: Viewport, journey: Journey): Promise<StepResult[]> {
	const session = await openSession(browser, env, route, viewport);
	try {
		const results: StepResult[] = [];
		for (const step of journey.steps) {
			const result = await session.run(step);
			results.push(result);
			if (result.failed) break;
		}
		return results;
	} finally {
		await session.close();
	}
}

async function pool<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await task(items[i]!);
			}
		}),
	);
	return out;
}

export interface ExploreOptions {
	/** Wall-clock time exploring may take; elements not reached by then are listed as not exercised. */
	readonly budgetMs?: number;
	/** At most this many journeys, most important elements first. */
	readonly maxJourneys?: number;
	/** The route of this run that exercises a shared layout control, when it is another route. */
	readonly owner?: (signature: string) => string | undefined;
}

/** One interactive element of the OLD page and how check used it. */
export interface ElementCoverage {
	/** Role and name, and the steps that reveal it when it is not on the page at load. */
	readonly element: string;
	readonly signature: string;
	/** In a shared header, nav, sidebar or footer: exercised once per run, by the first route that has it. */
	readonly layout: boolean;
	/** The journey that uses it, or the check that covers it. */
	readonly by?: string;
	/** Why no journey used it. */
	readonly reason?: string;
	/** The route of this run whose journeys exercise it. */
	readonly shared?: string;
	/** The journeys of this route that use it. */
	readonly journeys?: readonly string[];
}

export interface Exploration {
	readonly journeys: RecordedJourney[];
	readonly elements: readonly ElementCoverage[];
	/** Keyboard and dismiss journeys left out when the budget ran out. */
	readonly skipped: number;
}

interface Item {
	readonly journey: Journey;
	readonly element?: Tracked;
	readonly depth: number;
	/** Expand after it: collect what the last step revealed. */
	readonly expand: boolean;
}

interface Tracked {
	readonly candidate: Candidate;
	readonly element: string;
	readonly signature: string;
	readonly layout: boolean;
	readonly prefix: readonly Step[];
	by?: string;
	reason?: string;
	shared?: string;
	readonly journeys: string[];
}

/** Explores the OLD page until every interactive element is used by a journey or the budget runs out: the page's own controls first, then what each reveals, then keyboard paths. */
export async function explore(browser: Browser, env: SideEnv, route: string, viewport: Viewport, options: ExploreOptions = {}): Promise<Exploration> {
	const origin = env.origin;
	const host = new URL(origin).origin;
	const started = Date.now();
	const budget = options.budgetMs ?? DEFAULT_JOURNEY_BUDGET_MS;
	const cap = options.maxJourneys ?? Number.POSITIVE_INFINITY;
	const tracked: Tracked[] = [];
	const known = new Set<string>();
	const journeys: RecordedJourney[] = [];
	const later: Item[] = [];
	let formSteps: Step[] = [];

	const track = (found: readonly Candidate[], prefix: readonly Step[], parent: Tracked | undefined): Tracked[] => {
		const fresh: Tracked[] = [];
		for (const c of found) {
			const id = `${c.target.role}|${c.target.name}|${c.target.nth}`;
			if (known.has(id)) continue;
			known.add(id);
			const layout = parent ? parent.layout : isLayout(c);
			const signature = parent ? `${parent.signature} > ${c.target.role}|${c.target.name}|${c.target.nth}` : c.signature;
			const element = `${describeTarget(c.target)}${prefix.length ? ` (after ${prefix.map(describeStep).join(', then ')})` : ''}`;
			const t: Tracked = { candidate: c, element, signature, layout, prefix, journeys: [] };
			const owner = layout ? options.owner?.(signature) : undefined;
			if (owner && owner !== route) t.shared = owner;
			else if (c.covered) t.by = c.covered;
			else if (c.skip) t.reason = c.skip;
			tracked.push(t);
			fresh.push(t);
		}
		return fresh;
	};
	const itemsFor = (elements: readonly Tracked[], depth: number): { primary: Item[]; keyboard: Item[] } => {
		const primary: Item[] = [];
		const keyboard: Item[] = [];
		for (const t of [...elements].sort((a, b) => b.candidate.importance - a.candidate.importance)) {
			if (t.shared || t.by || t.reason) continue;
			const step = primaryStep(t.candidate);
			if (!step) {
				t.reason = 'it offers nothing to choose';
				continue;
			}
			const steps = [...t.prefix, step];
			primary.push({ journey: { name: steps.map(describeStep).join(', then '), steps }, element: t, depth, expand: step.action === 'click' || step.action === 'fill' || step.action === 'select' });
			for (const k of keyboardSteps(t.candidate)) {
				const ks = [...t.prefix, k];
				keyboard.push({ journey: { name: ks.map(describeStep).join(', then '), steps: ks }, depth, expand: false });
			}
		}
		return { primary, keyboard };
	};
	const outOfBudget = () => Date.now() - started > budget || journeys.length >= cap;

	const start = await openSession(browser, env, route, viewport);
	let wave: Item[];
	try {
		const found = await candidates(start.page, host);
		const first = itemsFor(track(found, [], undefined), 1);
		formSteps = await forms(start.page, host, found);
		wave = [...first.primary, ...formSteps.map((step): Item => ({ journey: { name: describeStep(step), steps: [step] }, depth: 1, expand: false }))];
		later.push(...first.keyboard);
	} finally {
		await start.close();
	}

	const runItem = async (item: Item) => {
		const session = await openSession(browser, env, route, viewport);
		try {
			const expected: StepResult[] = [];
			for (const step of item.journey.steps) {
				const result = await session.run(step);
				expected.push(result);
				if (result.failed) break;
			}
			const last = expected.at(-1)!;
			const done = expected.length === item.journey.steps.length && !last.failed;
			const stayed = done && new URL(session.page.url()).pathname === new URL(route, origin).pathname;
			const revealed = item.expand && stayed ? await candidates(session.page, host) : [];
			const step = item.journey.steps.at(-1)!;
			const expanded = stayed && step.action === 'click' && (await locate(session.page, step.target).getAttribute('aria-expanded', { timeout: 500 }).catch(() => null)) === 'true';
			return { item, expected, done, failed: last.failed, revealed, expanded };
		} finally {
			await session.close();
		}
	};

	for (let depth = 1; wave.length; depth++) {
		const room = Math.max(0, cap - journeys.length);
		const runnable = wave.slice(0, room);
		for (const item of wave.slice(room)) if (item.element) item.element.reason = `out of the journey budget (${options.maxJourneys} journeys)`;
		const results = await pool(runnable, async (item) => (outOfBudget() ? undefined : runItem(item)));
		const next: Item[] = [];
		for (const [i, r] of results.entries()) {
			const item = runnable[i]!;
			if (!r) {
				if (item.element) item.element.reason = budgetReason(budget, options.maxJourneys);
				continue;
			}
			journeys.push({ ...item.journey, expected: r.expected });
			if (item.element) {
				if (r.done) item.element.by = item.journey.name;
				else item.element.reason = `it could not be used on the old page: ${r.failed ?? 'the journey stopped before it'}`;
			}
			if (r.expanded) {
				for (const key of ['Escape', 'ArrowDown'] as const) {
					const steps = [...item.journey.steps, { action: 'press' as const, key, target: item.journey.steps.at(-1)!.target }];
					later.push({ journey: { name: steps.map(describeStep).join(', then '), steps }, depth, expand: false });
				}
			}
			if (!r.revealed.length) continue;
			const fresh = track(r.revealed, item.journey.steps, item.element);
			if (depth >= MAX_DEPTH) {
				for (const t of fresh) if (!t.shared && !t.by && !t.reason) t.reason = `it appears only after ${MAX_DEPTH} steps, deeper than check explores`;
				continue;
			}
			const items = itemsFor(fresh, depth + 1);
			next.push(...items.primary);
			later.push(...items.keyboard);
		}
		wave = next;
	}

	const room = Math.max(0, cap - journeys.length);
	const extra = await pool(later.slice(0, room), async (item) => (outOfBudget() ? undefined : runItem(item)));
	let skipped = Math.max(0, later.length - room);
	for (const [i, r] of extra.entries()) {
		if (!r) {
			skipped++;
			continue;
		}
		const item = later[i]!;
		journeys.push({ ...item.journey, expected: r.expected });
	}
	for (const t of tracked) {
		const at = t.prefix.length;
		for (const j of journeys) if (j.steps.length > at && sameSteps(t.prefix, j.steps.slice(0, at)) && sameTarget(j.steps[at]!.target, t.candidate.target)) t.journeys.push(j.name);
	}
	const elements = tracked.map((t): ElementCoverage => ({
		element: t.element,
		signature: t.signature,
		layout: t.layout,
		...(t.by ? { by: t.by } : {}),
		...(t.reason && !t.by ? { reason: t.reason } : {}),
		...(t.shared ? { shared: t.shared } : {}),
		...(t.journeys.length ? { journeys: t.journeys } : {}),
	}));
	return { journeys, elements, skipped };
}

function budgetReason(budgetMs: number, maxJourneys: number | undefined): string {
	return `out of the journey budget (${Math.round(budgetMs / 1000)} s${maxJourneys !== undefined ? ` or ${maxJourneys} journeys` : ''}): raise --journey-budget${maxJourneys !== undefined ? ' or --max-journeys' : ''}`;
}

const sameTarget = (a: Target, b: Target) => a.role === b.role && a.name === b.name && a.nth === b.nth;
const sameSteps = (a: readonly Step[], b: readonly Step[]) => a.length === b.length && a.every((s, i) => s.action === b[i]!.action && sameTarget(s.target, b[i]!.target));

/** The initial interactive elements of the OLD page, to decide which route of a run exercises each shared layout control. */
export async function survey(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<string[]> {
	const session = await openSession(browser, env, route, viewport);
	try {
		return (await candidates(session.page, new URL(env.origin).origin)).filter(isLayout).map((c) => c.signature);
	} finally {
		await session.close();
	}
}

function stable(values: readonly string[]): (value: string) => boolean {
	return template(values[0]!, ...values.slice(1)).test;
}

function format(result: StepResult, parts: readonly string[]): string {
	const out: string[] = [];
	if (parts.includes('failed') && result.failed) out.push(result.failed);
	if (parts.includes('url')) out.push(`URL ${result.url}`);
	if (parts.includes('added')) out.push(`appears: ${result.added.join(' | ') || '(nothing)'}`);
	if (parts.includes('removed')) out.push(`disappears: ${result.removed.join(' | ') || '(nothing)'}`);
	if (parts.includes('requests')) out.push(`requests: ${result.requests.join(', ') || '(none)'}`);
	if (parts.includes('errors')) out.push(`console errors: ${result.errors.join(' | ') || '(none)'}`);
	if (parts.includes('announcements')) out.push(`announced: ${result.announcements.join(' | ') || '(nothing)'}`);
	if (parts.includes('focus')) out.push(`focus on ${result.focus}`);
	return out.join('; ');
}

/** The first step of each journey whose result on NEW differs from every OLD run, where the OLD runs agree. */
/** Step results of every journey in one run, in journey order. */
export type Run = readonly (readonly StepResult[])[];

export async function replayAll(browser: Browser, env: SideEnv, route: string, viewport: Viewport, journeys: readonly Journey[]): Promise<Run> {
	return pool(journeys, (journey) => replay(browser, env, route, viewport, journey));
}

export function compareJourneys(route: string, olds: readonly Run[], journeys: readonly Journey[], next: Run): Failure[] {
	const failures: Failure[] = [];
	journeys.forEach((journey, j) => {
		const runs = olds.map((o) => o[j]!);
		const actual = next[j]!;
		for (let k = 0; k < journey.steps.length; k++) {
			const step = journey.steps[k]!;
			const oldSteps = runs.map((r) => r[k]);
			if (oldSteps.some((s) => !s || s.failed)) break;
			const [a, ...rest] = oldSteps as StepResult[];
			const n = actual[k];
			const dimension: Dimension = step.action === 'press' ? 'a11y' : 'behaviour';
			const check = `${journey.steps.length > 1 ? `${journey.name} (step ${k + 1})` : journey.name}`;
			const hint = step.action === 'press' ? HINTS.keyboard : HINTS.behaviour;
			if (!n || n.failed) {
				failures.push({ route, dimension, check, expected: format(a!, ['url', 'added']), actual: n?.failed ?? 'the journey stopped before this step', hint });
				break;
			}
			const parts: string[] = [];
			if (!stable([a!.url, ...rest.map((r) => r.url)])(n.url)) parts.push('url');
			const navigated = n.navigated || oldSteps.some((x) => x!.navigated);
			for (const field of navigated ? (['requests'] as const) : (['added', 'removed', 'requests', 'announcements'] as const)) {
				// Requests in flight together finish in any order (a client retrying hosts it shuffled), so they count as a set.
				const lines = (r: StepResult) => (field === 'requests' ? [...r[field]].sort() : r[field]);
				const diff = diffLines(lineTemplates(lines(a!), ...rest.map(lines)), lines(n));
				if (diff.changed.length || diff.missing.length || diff.unexpected.length) parts.push(field);
			}
			const errors = diffLines(lineTemplates(a!.errors, ...rest.map((r) => r.errors)), n.errors);
			if (errors.unexpected.length || errors.changed.length) parts.push('errors');
			if (!navigated && !stable([a!.focus, ...rest.map((r) => r.focus)])(n.focus)) parts.push('focus');
			if (parts.length) {
				failures.push({ route, dimension, check, expected: format(a!, parts), actual: format(n, parts), hint });
				break;
			}
		}
	});
	return failures;
}
