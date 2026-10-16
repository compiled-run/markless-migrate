import type { Browser, BrowserContext, Locator, Page, Request } from 'playwright';
import { contextOptions } from './capture.ts';
import { HINTS } from './hints.ts';
import { diffLines, lineTemplates, template } from './noise.ts';
import type { Dimension, Failure, Viewport } from './types.ts';

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
const MAX_JOURNEYS = 30;
const CONCURRENCY = 8;
const STEP_TIMEOUT = 3_000;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

// A redirect may name the app by another loopback host (Next builds it from the request); on the same port it is still this app.
export function localUrl(url: string, origin: string): string {
	const u = new URL(url);
	const o = new URL(origin);
	if (u.origin === o.origin || (LOOPBACK.has(u.hostname) && LOOPBACK.has(o.hostname) && u.port === o.port)) return u.pathname + u.search + u.hash;
	return url;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const key = (t: Target) => `${t.role}|${t.name}|${t.nth}`;

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
}

async function candidates(page: Page, origin: string): Promise<Candidate[]> {
	const out: Candidate[] = [];
	for (const role of ROLES) {
		const seen = new Map<string, number>();
		for (const locator of await page.getByRole(role).all()) {
			const line = (await locator.ariaSnapshot().catch(() => '')).split('\n')[0] ?? '';
			const name = /^- [\w-]+ "((?:[^"\\]|\\.)*)"/.exec(line)?.[1]?.replace(/\\(.)/g, '$1') ?? '';
			const nth = seen.get(name) ?? 0;
			seen.set(name, nth + 1);
			if (!(await locator.isVisible().catch(() => false)) || (await locator.isDisabled().catch(() => true))) continue;
			const info = await locator
				.evaluate((el) => ({ href: el.getAttribute('href') ?? undefined, type: (el.getAttribute('type') ?? '').toLowerCase(), options: el instanceof HTMLSelectElement ? [...el.options].map((o) => o.value) : [] }))
				.catch(() => undefined);
			if (!info) continue;
			if (role === 'link') {
				if (!info.href || /^(mailto|tel|javascript):/i.test(info.href)) continue;
				const url = new URL(info.href, page.url());
				if (url.origin !== origin || DESTRUCTIVE.test(url.pathname)) continue;
			}
			if (DESTRUCTIVE.test(name)) continue;
			out.push({ target: { role, name, nth }, href: info.href, type: info.type, options: info.options });
		}
	}
	const summaries = await page.locator('summary').all();
	const seen = new Map<string, number>();
	for (const locator of summaries) {
		const name = ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim();
		const nth = seen.get(name) ?? 0;
		seen.set(name, nth + 1);
		if (await locator.isVisible().catch(() => false)) out.push({ target: { role: 'summary', name, nth } });
	}
	return out;
}

async function forms(page: Page, origin: string): Promise<Step[]> {
	const steps: Step[] = [];
	const all = await page.locator('form').all();
	for (const form of all) {
		const action = await form.evaluate((f: HTMLFormElement) => f.action).catch(() => '');
		if (action && new URL(action).origin !== origin) continue;
		const fields: { target: Target; value: string; check?: boolean }[] = [];
		let submit: Target | undefined;
		for (const c of await candidates(page, origin)) {
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

function firstSteps(found: readonly Candidate[]): Step[] {
	const steps: Step[] = [];
	for (const c of found) {
		const t = c.target;
		if (t.role === 'link') steps.push({ action: 'click', target: t }, { action: 'press', key: 'Enter', target: t });
		else if (t.role === 'button' && c.type === 'submit') steps.push({ action: 'press', key: 'Enter', target: t });
		else if (t.role === 'button' || t.role === 'summary' || t.role === 'tab' || t.role.startsWith('menuitem') || t.role === 'option') steps.push({ action: 'click', target: t }, { action: 'press', key: 'Enter', target: t }, { action: 'press', key: 'Space', target: t });
		else if (t.role === 'checkbox' || t.role === 'radio' || t.role === 'switch') steps.push({ action: 'click', target: t }, { action: 'press', key: 'Space', target: t });
		else if (t.role === 'textbox' || t.role === 'searchbox' || t.role === 'spinbutton') steps.push({ action: 'fill', target: t, value: sample(c.type ?? '', t.name) });
		else if (t.role === 'combobox' && c.options && c.options.length > 1) steps.push({ action: 'select', target: t, value: c.options[1]! });
	}
	return steps;
}

function bodyShape(request: Request): string {
	const body = request.postData();
	if (!body) return '';
	const type = request.headers()['content-type'] ?? '';
	const kind = (value: string) => (/^-?\d+(\.\d+)?$/.test(value) ? 'number' : value === '' ? 'empty' : 'string');
	if (type.includes('application/x-www-form-urlencoded')) {
		return ` {${[...new URLSearchParams(body)].map(([k, v]) => `${k}: ${kind(v)}`).sort().join(', ')}}`;
	}
	if (type.includes('multipart/form-data')) {
		return ` {${[...body.matchAll(/name="([^"]+)"/g)].map((m) => m[1]).sort().join(', ')}}`;
	}
	try {
		const shape = (value: unknown): unknown => (Array.isArray(value) ? [value.length ? shape(value[0]) : 'empty'] : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort().map(([k, v]) => [k, shape(v)])) : typeof value);
		return ` ${JSON.stringify(shape(JSON.parse(body)))}`;
	} catch {
		return ` (${body.length} bytes)`;
	}
}

// App requests only: framework transport (React Server Component payloads, server-action posts, /_next/ data) and plain page loads are left to the URL.
function appRequest(request: Request, origin: string): string | undefined {
	const url = new URL(request.url());
	if (url.origin !== origin) return undefined;
	const type = request.resourceType();
	const headers = request.headers();
	if (url.pathname.startsWith('/_next/') || url.searchParams.has('_rsc') || headers.rsc || headers['next-action'] || headers['next-router-state-tree']) return undefined;
	if (type === 'document' ? request.method() === 'GET' : type !== 'fetch' && type !== 'xhr') return undefined;
	const query = [...url.searchParams.keys()].sort();
	return `${request.method()} ${url.pathname}${query.length ? `?${query.join('&')}` : ''}${bodyShape(request)}`;
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
	const line = (await page.locator(':focus').first().ariaSnapshot({ timeout: 500 }).catch(() => '')).split('\n')[0] ?? '';
	return line.replace(/^- /, '').replace(/:$/, '') || 'body';
}

async function snapshot(page: Page, origin: string): Promise<string[]> {
	// Indentation is structure, which the rendered check compares; a step's effect is which nodes appear and disappear.
	return (await page.locator('body').ariaSnapshot({ timeout: 5_000 }).catch(() => '')).split(origin).join('').split('\n').map((line) => line.trim());
}

const IDLE_MS = 150;
const IDLE_LIMIT_MS = 3_000;

// Settled: the page has loaded and no request has been in flight for 150ms (at most 3s), then two frames.
async function quiet(page: Page, inflight: () => number): Promise<void> {
	await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
	const deadline = Date.now() + IDLE_LIMIT_MS;
	let idleSince = Date.now();
	while (Date.now() < deadline) {
		if (inflight() > 0) idleSince = Date.now();
		else if (Date.now() - idleSince >= IDLE_MS) break;
		await new Promise((done) => setTimeout(done, 25));
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

export async function openSession(browser: Browser, origin: string, route: string, viewport: Viewport): Promise<Session> {
	const context = await browser.newContext(contextOptions(viewport));
	const host = new URL(origin).origin;
	await context.route('**/*', (r) => (new URL(r.request().url()).origin === host || r.request().url().startsWith('data:') ? r.continue() : r.abort()));
	const page = await context.newPage();
	page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
	let requests: string[] = [];
	let errors: string[] = [];
	const pending = new Set<Request>();
	page.on('request', (request) => {
		pending.add(request);
		const line = appRequest(request, host);
		if (line) requests.push(line);
	});
	page.on('requestfinished', (request) => pending.delete(request));
	page.on('requestfailed', (request) => pending.delete(request));
	const inflight = () => pending.size;
	let documentLoaded = false;
	page.on('request', (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoaded = true;
	});
	page.on('console', (message) => {
		// A failed resource load is reported by the assets check of the page that loads it.
		if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text().split(origin).join(''));
	});
	page.on('pageerror', (error) => errors.push(error.message.split(origin).join('')));
	await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
	await quiet(page, inflight);
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
			let failed: string | undefined;
			try {
				await perform(page, step);
			} catch (error) {
				failed = `${describeTarget(step.target)} could not be used: ${(error as Error).message.split('\n')[0]}`;
			}
			await quiet(page, inflight);
			const after = await snapshot(page, origin);
			const liveAfter = await page.evaluate(liveRegions).catch(() => [] as string[]);
			const { added, removed } = multisetDiff(before, after);
			return {
				url: localUrl(page.url(), origin),
				navigated: documentLoaded || new URL(page.url()).pathname !== startPath || (href !== null && new URL(href, page.url()).href === page.url()),
				added,
				removed,
				requests: [...requests],
				errors: [...errors],
				announcements: liveAfter.filter((line) => !liveBefore.includes(line)),
				focus: await focusLabel(page),
				...(failed ? { failed } : {}),
			};
		},
		close: () => context.close(),
	};
}

export async function replay(browser: Browser, origin: string, route: string, viewport: Viewport, journey: Journey): Promise<StepResult[]> {
	const session = await openSession(browser, origin, route, viewport);
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

/** Breadth first over the OLD page to depth 2: every control once from a fresh load, then whatever a step revealed. */
export async function explore(browser: Browser, origin: string, route: string, viewport: Viewport): Promise<RecordedJourney[]> {
	const host = new URL(origin).origin;
	const start = await openSession(browser, origin, route, viewport);
	let first: Step[];
	let initial: Set<string>;
	try {
		const found = await candidates(start.page, host);
		initial = new Set(found.map((c) => key(c.target)));
		first = [...firstSteps(found), ...(await forms(start.page, host))];
	} finally {
		await start.close();
	}
	const journeys: RecordedJourney[] = [];
	const level1 = await pool(first.slice(0, MAX_JOURNEYS), async (step) => {
		const session = await openSession(browser, origin, route, viewport);
		try {
			const result = await session.run(step);
			const path = new URL(session.page.url()).pathname;
			const stayed = !result.failed && path === new URL(route, origin).pathname;
			const revealed = stayed ? (await candidates(session.page, host)).filter((c) => !initial.has(key(c.target))) : [];
			const expanded = stayed && step.action === 'click' && (await locate(session.page, step.target).getAttribute('aria-expanded').catch(() => null)) === 'true';
			return { step, result, revealed, expanded };
		} finally {
			await session.close();
		}
	});
	const second: Journey[] = [];
	for (const { step, result, revealed, expanded } of level1) {
		journeys.push({ name: describeStep(step), steps: [step], expected: [result] });
		if (step.action !== 'click') continue;
		for (const c of revealed) second.push({ name: `${describeStep(step)}, then click ${describeTarget(c.target)}`, steps: [step, { action: 'click', target: c.target }] });
		if (expanded) {
			second.push({ name: `${describeStep(step)}, then press Escape`, steps: [step, { action: 'press', key: 'Escape', target: step.target }] });
			second.push({ name: `${describeStep(step)}, then press ArrowDown`, steps: [step, { action: 'press', key: 'ArrowDown', target: step.target }] });
		}
	}
	const room = Math.max(0, MAX_JOURNEYS - journeys.length);
	const level2 = await pool(second.slice(0, room), async (journey) => ({ ...journey, expected: await replay(browser, origin, route, viewport, journey) }));
	return [...journeys, ...level2];
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

export async function replayAll(browser: Browser, origin: string, route: string, viewport: Viewport, journeys: readonly Journey[]): Promise<Run> {
	return pool(journeys, (journey) => replay(browser, origin, route, viewport, journey));
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
				const diff = diffLines(lineTemplates(a![field], ...rest.map((r) => r[field])), n[field]);
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
