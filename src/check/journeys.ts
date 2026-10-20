import type { Browser, BrowserContext, Locator, Page, Request } from 'playwright';
import { frameworkTransport, openPage, requestLine, type OpenOptions, type SideEnv } from './browser.ts';
import { markHandlers } from './handlers.ts';
import { originInQuery } from './capture.ts';
import { HINTS } from './hints.ts';
import { signInCookies, storageKeys } from './storage.ts';
import { diffLines, lineTemplates, template } from './noise.ts';
import type { Dimension, Failure, Viewport, WriteLine } from './types.ts';
import { storageCandidate, type StorageOwner } from './automatic.ts';
import { loadPage } from './infrastructure.ts';
import { describeStructure, STRUCTURE_ENGINE, type Structure } from './structure.ts';

export interface Target {
	readonly role: string;
	readonly name: string;
	readonly nth: number;
	/** An element with no text or label (a chart bar, a grid's icon button): found again by its structure and position, not its name. */
	readonly structure?: Structure;
}

export type Key = 'Enter' | 'Space' | 'Escape' | 'ArrowDown' | 'ArrowUp' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export type Step =
	| { readonly action: 'click'; readonly target: Target }
	| { readonly action: 'press'; readonly key: Key; readonly target: Target }
	| { readonly action: 'fill'; readonly target: Target; readonly value: string }
	| { readonly action: 'select'; readonly target: Target; readonly value: string }
	| { readonly action: 'submit'; readonly target: Target; readonly fields: readonly { readonly target: Target; readonly value: string; readonly check?: boolean }[] };

export interface StepResult {
	readonly url: string;
	readonly added: readonly string[];
	readonly removed: readonly string[];
	/** Nodes on the page before and after the step, but in another order (a sorted table's rows). */
	readonly moved?: readonly string[];
	readonly requests: readonly string[];
	/** Requests of this step that write, and whether each was sent or held back. */
	readonly writes?: readonly WriteLine[];
	readonly errors: readonly string[];
	readonly announcements: readonly string[];
	readonly focus: string;
	/** What the step added to (`+`) and removed from (`-`) what the page keeps in the browser: storage keys, IndexedDB stores, cookies. */
	readonly storage?: readonly string[];
	/** The step loaded a document, changed the path or followed a link: the landing page's content and focus are that route's and router's own checks. */
	readonly navigated: boolean;
	/** Set when the step could not be performed, for example because its target is missing. */
	readonly failed?: string;
	/** How the step's target could not be reached, when it could not: `occluded`, `hidden`, `offscreen`, `disabled`, `missing` or `timeout`. */
	readonly unreachable?: Unreachability;
	/** Dialogs the step opened (`confirm: Delete this note?`); a step that ends the session or deletes accepts them, any other dismisses them. */
	readonly dialogs?: readonly string[];
	/** The step ended on a page the front door serves from the old app, on the old app's own origin: what that page keeps in the browser is the old app's, on another origin, so it is not compared. */
	readonly door?: boolean;
	/** What the step changed on <html> and <body> (attributes, class names: shown, not compared), in the page colours, colour scheme, scroll lock and pointer-events, and in stored values: `page background: rgb(255, 255, 255) → rgb(24, 25, 32)`, `localStorage theme: "light" → "dark"`. */
	readonly state?: readonly string[];
	/** The step reloaded the page: what it shows and keeps after the reload is compared with what it showed before. */
	readonly reloaded?: boolean;
}

export interface Journey {
	readonly name: string;
	readonly steps: readonly Step[];
	/** Its last step uses a control that ends the session or deletes (Sign out, Delete): run after every other journey, each in a fresh session. */
	readonly destructive?: boolean;
	/** What is done after the steps, each compared like a step (see CycleAct). */
	readonly cycle?: readonly CycleAct[];
}

/**
 * One act after a journey's steps: use its last control `again`, or `use` it under the name it shows now (a toggle labelled with its
 * state, "currently light mode"); `reopen` with the step before it (what a close button closed);
 * press `escape`; `reload`; go `back`; click `outside` what the control opened, at a point of the old page that holds no control;
 * or `navigate` by following an in-site link.
 */
export type CycleAct = 'again' | 'reopen' | 'escape' | 'reload' | 'back' | { readonly use: Target } | { readonly outside: { readonly x: number; readonly y: number } } | { readonly navigate: Target };

/** How many times a control that stays on the page is used in a row: a two-state toggle comes back, a three-way one goes round. */
export const CYCLE_USES = 3;
const CYCLE_ACTS = 5;

export interface RecordedJourney extends Journey {
	readonly expected: readonly StepResult[];
}

const ROLES = ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'textbox', 'searchbox', 'spinbutton', 'combobox', 'slider', 'treeitem', 'columnheader', 'row', 'gridcell'] as const;
/** Roles that are structure as often as controls: one counts only when it is focusable, sortable, selectable, answers input itself, or is a row of an interactive grid. */
const STRUCTURAL = new Set(['columnheader', 'row', 'gridcell']);
/** Rows and cells of one grid are alike: the first few of each are exercised, the rest counted as covered by them. */
const SAMPLED = new Set(['row', 'gridcell', 'treeitem']);
const SAMPLES = 2;
/** An element found by its listeners rather than its role: located by its text or label. */
export const CLICKABLE = 'clickable';
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

/** The accessible name in an aria snapshot's first line; YAML single-quotes the whole line when the name holds `: ` or starts with `{`. */
export function snapshotName(line: string): string {
	const quoted = /^- '(.*)'(:?)$/.exec(line);
	const entry = quoted ? quoted[1]!.replace(/''/g, "'") : line.replace(/^- /, '');
	return /^[\w-]+ "((?:[^"\\]|\\.)*)"/.exec(entry)?.[1]?.replace(/\\(.)/g, '$1') ?? '';
}

export function describeTarget(t: Target): string {
	if (t.structure) return `${t.role} ${describeStructure(t.structure)} (no name: matched by structure and position)`;
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

/** Elements labelled `name`: the innermost one whose text is exactly it, or one with no text and that aria-label or title. */
export function labelled(name: string): string {
	const v = name.includes("'") ? `concat('${name.split("'").join(`', "'", '`)}')` : `'${name}'`;
	return `//body//*[(normalize-space(.)=${v} and not(*[normalize-space(.)=${v}])) or (normalize-space(.)='' and (@aria-label=${v} or @title=${v}))]`;
}

export function locate(page: Page, t: Target): Locator {
	if (t.structure) return page.locator(`${STRUCTURE_ENGINE}=${JSON.stringify(t.structure)}`);
	if (t.role === CLICKABLE) return page.locator(`xpath=${labelled(t.name)}`).nth(t.nth);
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
	/** Takes keyboard focus (a tabindex or a native control). */
	readonly focusable?: boolean;
	/** Rows, cells and tree items of one grid or tree: alike, so only the first few of a group are exercised. */
	readonly group?: string;
	/** It ends the session or deletes (its name or address says so). */
	readonly destructive?: boolean;
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
	await markHandlers(page);
	for (const role of ROLES) {
		const seen = new Map<string, number>();
		for (const locator of await page.getByRole(role).all()) {
			const line = (await locator.ariaSnapshot({ timeout: STEP_TIMEOUT }).catch(() => '')).split('\n')[0] ?? '';
			const name = snapshotName(line);
			const nth = seen.get(name) ?? 0;
			seen.set(name, nth + 1);
			if (!(await locator.isVisible().catch(() => false)) || (await locator.isDisabled().catch(() => true))) continue;
			const info = await locator.evaluate(describeElement, undefined, { timeout: STEP_TIMEOUT }).catch(() => undefined);
			if (!info) continue;
			if (STRUCTURAL.has(role) && !(info.focusable || info.handler || info.sortable || info.selectable || (info.grid && role === 'row' && !info.header))) continue;
			const target = { role, name, nth };
			const base = { target, href: info.href, type: info.type, options: info.options, region: info.region, importance: importance(info), ...(info.focusable ? { focusable: true } : {}), ...(SAMPLED.has(role) ? { group: `${role}|${info.container}` } : {}) };
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
					add({ ...base, destructive: true });
					continue;
				}
			}
			add(DESTRUCTIVE.test(name) ? { ...base, destructive: true } : base);
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
	let unnamed = 0;
	for (const c of await page.evaluate(clickables).catch(() => [])) {
		const target = { role: CLICKABLE, name: c.name, nth: c.name ? c.nth : unnamed++, ...(c.name ? {} : { structure: c.structure }) };
		const base = { target, region: c.region, importance: importance(c), ...(c.focusable ? { focusable: true } : {}) };
		add(c.name && DESTRUCTIVE.test(c.name) ? { ...base, destructive: true } : base);
	}
	return out;
}

function describeElement(el: Element) {
	const handlers = (globalThis as { __markless_migrate_handlers__?: WeakSet<Element> }).__markless_migrate_handlers__;
	const grid = el.closest('[role="grid"], [role="treegrid"], [role="tree"], [role="table"], table');
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
		focusable: el.hasAttribute('tabindex') && (el as HTMLElement).tabIndex >= 0,
		handler: Boolean(handlers?.has(el)),
		sortable: el.hasAttribute('aria-sort'),
		selectable: el.hasAttribute('aria-selected'),
		grid: Boolean(grid && /^(grid|treegrid|tree)$/.test(grid.getAttribute('role') ?? '')),
		header: Boolean(el.querySelector('[role="columnheader"], th')),
		container: grid ? [...document.querySelectorAll('[role="grid"], [role="treegrid"], [role="tree"], [role="table"], table')].indexOf(grid) : -1,
	};
}

/** Elements that answer a click or a key themselves but have no interactive role, each with its label and its index among the elements `labelled` finds for it. */
function clickables() {
	const handlers = (globalThis as { __markless_migrate_handlers__?: WeakSet<Element> }).__markless_migrate_handlers__;
	if (!handlers) return [];
	// The same expression as labelled(), written out here because a page with a CSP may refuse eval.
	const xpathFor = (name: string) => {
		const v = name.includes("'") ? `concat('${name.split("'").join(`', "'", '`)}')` : `'${name}'`;
		return `//body//*[(normalize-space(.)=${v} and not(*[normalize-space(.)=${v}])) or (normalize-space(.)='' and (@aria-label=${v} or @title=${v}))]`;
	};
	// The same scope as the structure selector engine (structure.ts) computes, written out here because this runs in the page.
	const LANDMARK: Record<string, string> = { main: 'main', nav: 'navigation', header: 'banner', footer: 'contentinfo', aside: 'complementary', form: 'form', table: 'table', dialog: 'dialog', figure: 'figure', svg: 'svg', ul: 'list', ol: 'list' };
	const scopeOf = (el: Element) => {
		const parts: string[] = [];
		for (let at = el.parentElement; at; at = at.parentElement) {
			const role = at.getAttribute('role') ?? LANDMARK[at.localName];
			if (role && role !== 'presentation' && role !== 'none' && role !== 'generic') parts.unshift(role);
		}
		return parts.join('>');
	};
	const control = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="textbox"], [role="searchbox"], [role="spinbutton"], [role="combobox"], [role="slider"], [role="treeitem"], [contenteditable=""], [contenteditable="true"]';
	const label = (el: Element) => ((el.textContent ?? '').replace(/\s+/g, ' ').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 80);
	const cell = '[role="columnheader"], [role="row"], [role="gridcell"]';
	// A header's own label listening for the header's click is the header, already counted by its role.
	const ownLabel = (el: Element) => !!el.closest(cell) && label(el.closest(cell)!) === label(el);
	const hits = [...(document.body?.querySelectorAll('*') ?? [])].filter((el) => handlers.has(el) && !el.matches(control) && !el.closest(control) && !el.querySelector(control) && !el.matches(cell) && !(label(el) && ownLabel(el)) && el.querySelectorAll('*').length <= 40 && el.checkVisibility({ visibilityProperty: true }));
	const outer = hits.filter((el) => !hits.some((other) => other !== el && other.contains(el)));
	return outer.map((el) => {
		const name = label(el);
		let nth = 0;
		if (name) {
			const found = document.evaluate(xpathFor(name), document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
			for (let i = 0; i < found.snapshotLength; i++) {
				const node = found.snapshotItem(i)!;
				if (node === el || el.contains(node)) {
					nth = i;
					break;
				}
			}
		}
		const main = el.closest('main, [role="main"]');
		const landmark = main ? null : el.closest('header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"]');
		const scope = scopeOf(el);
		const structure = { tag: el.localName, scope, index: [...document.querySelectorAll(el.localName)].filter((other) => scopeOf(other) === scope && other.checkVisibility({ visibilityProperty: true })).indexOf(el) };
		return {
			name,
			nth,
			structure,
			region: main ? 'main' : landmark ? (landmark.getAttribute('role') ?? landmark.tagName.toLowerCase()) : '',
			table: Boolean(el.closest('table, [role="table"], [role="grid"], [role="treegrid"]')),
			form: Boolean(el.closest('form')),
			dialog: Boolean(el.closest('dialog, [role="dialog"], [role="alertdialog"]')),
			focusable: el.hasAttribute('tabindex') && (el as HTMLElement).tabIndex >= 0,
		};
	});
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
			if (c.skip || c.covered || c.destructive) continue;
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
	if (t.role === 'slider') return { action: 'press', key: 'ArrowRight', target: t };
	return { action: 'click', target: t };
}

/** The keyboard paths to the same element: Enter on links and buttons, Space on buttons and toggles. */
function keyboardSteps(c: Candidate): Step[] {
	const t = c.target;
	const keys = (...list: Key[]): Step[] => list.map((key) => ({ action: 'press', key, target: t }));
	if (t.role === 'link') return keys('Enter');
	if (t.role === 'button' && c.type === 'submit') return [];
	if (t.role === 'tab') return keys('Enter', 'Space', 'ArrowRight');
	if (t.role === 'button' || t.role === 'summary' || t.role.startsWith('menuitem') || t.role === 'option') return keys('Enter', 'Space');
	if (t.role === 'checkbox' || t.role === 'radio' || t.role === 'switch') return keys('Space');
	if (t.role === 'columnheader') return keys('Enter');
	if (t.role === 'row') return keys('Space', 'Enter', 'ArrowDown');
	if (t.role === 'gridcell') return keys('ArrowDown', 'ArrowRight', 'Enter');
	if (t.role === 'treeitem') return keys('Enter', 'ArrowRight', 'ArrowDown');
	if (t.role === 'slider') return keys('ArrowLeft', 'Home', 'End');
	if (t.role === CLICKABLE && c.focusable) return keys('Enter', 'Space');
	return [];
}

// App requests only: framework transport (React Server Component payloads, server-action posts, /_next/ data) and plain page loads are left to the URL.
function appRequest(request: Request, origins: readonly string[]): string | undefined {
	const url = new URL(request.url());
	const origin = origins.find((o) => url.origin === o);
	if (!origin) return undefined;
	const type = request.resourceType();
	if (frameworkTransport(request, url)) return undefined;
	if (type === 'document' ? request.method() === 'GET' : type !== 'fetch' && type !== 'xhr') return undefined;
	return requestLine(request.method(), url, origin, request.postData(), request.headers()['content-type'] ?? '');
}

function storageChange(before: readonly string[], after: readonly string[]): string[] {
	const { added, removed } = multisetDiff(before, after);
	return [...added.map((k) => `+ ${k}`), ...removed.map((k) => `- ${k}`)];
}

// Runs in the page: what a theme, a mode or a preference is kept as, `subject\tvalue`; a colour is read once a transition on <html> or <body> has ended (at most 1 s).
async function pageState(): Promise<string[]> {
	const root = document.documentElement;
	const body = document.body as HTMLElement | null;
	const own = [root, body].filter((el): el is HTMLElement => Boolean(el));
	const running = own.flatMap((el) => el.getAnimations()).filter((a) => a instanceof CSSTransition && /^(background|color|color-scheme|all)/.test(a.transitionProperty));
	if (running.length) await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => {}))), new Promise((done) => setTimeout(done, 1_000))]);
	const out: string[] = [];
	const clip = (v: string) => (v.length > 120 ? `${v.slice(0, 120)}…` : v);
	for (const el of own) {
		const tag = el.localName;
		for (const a of el.attributes) {
			if (a.name.startsWith('data-markless-migrate')) continue;
			if (a.name === 'class') for (const c of el.classList) out.push(`${tag} class +${c}\t`);
			else out.push(`${tag} ${a.name}\t${clip(a.value)}`);
		}
	}
	const opaque = (c: string) => c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c);
	const bodyBg = body ? getComputedStyle(body).backgroundColor : '';
	out.push(`page background\t${opaque(bodyBg) ? bodyBg : getComputedStyle(root).backgroundColor}`);
	out.push(`page text colour\t${getComputedStyle(body ?? root).color}`);
	out.push(`page color-scheme\t${getComputedStyle(root).colorScheme}`);
	out.push(`page overflow\t${getComputedStyle(root).overflow} / ${body ? getComputedStyle(body).overflow : ''}`);
	out.push(`page pointer-events\t${getComputedStyle(body ?? root).pointerEvents}`);
	for (const [label, store] of [['localStorage', () => localStorage], ['sessionStorage', () => sessionStorage]] as const) {
		try {
			const s = store();
			for (let i = 0; i < s.length; i++) out.push(`${label} ${s.key(i)}\t${clip(JSON.stringify(s.getItem(s.key(i)!)))}`);
		} catch {}
	}
	return out;
}

async function readState(page: Page, signedIn: ReadonlySet<string>): Promise<string[]> {
	const inPage = await page.evaluate(pageState).catch(() => [] as string[]);
	const cookies = (await page.context().cookies(page.url()).catch(() => [])).filter((c) => !signedIn.has(c.name)).map((c) => `cookie ${c.name}\t${c.value.length > 120 ? `${c.value.slice(0, 120)}…` : c.value}`);
	return [...inPage, ...cookies];
}

/** What changed between two readings of the page state, one line per subject: `html data-theme: light → dark`, `html class +dark`. */
export function stateChange(before: readonly string[], after: readonly string[]): string[] {
	const split = (lines: readonly string[]) => new Map(lines.map((l) => [l.slice(0, l.indexOf('\t')), l.slice(l.indexOf('\t') + 1)]));
	const a = split(before);
	const b = split(after);
	const out: string[] = [];
	for (const key of new Set([...a.keys(), ...b.keys()])) {
		const was = a.get(key);
		const now = b.get(key);
		if (was === now) continue;
		const cls = / class \+/.exec(key);
		if (cls) out.push(now === undefined ? key.replace(' class +', ' class -') : key);
		else out.push(`${key}: ${was ?? '(none)'} → ${now ?? '(none)'}`);
	}
	return out.sort();
}

const MOVED_WINDOW = 800;
const MOVED_MAX = 40;

/** Lines both snapshots have that the step put in another order: what is outside the longest common subsequence of the lines both keep. */
export function movedLines(before: readonly string[], after: readonly string[]): string[] {
	const { added, removed } = multisetDiff(before, after);
	const drop = (lines: readonly string[], gone: readonly string[]) => {
		const counts = new Map<string, number>();
		for (const g of gone) counts.set(g, (counts.get(g) ?? 0) + 1);
		return lines.filter((l) => {
			const n = counts.get(l) ?? 0;
			if (!n) return true;
			counts.set(l, n - 1);
			return false;
		});
	};
	const a = drop(before, removed);
	const b = drop(after, added);
	let start = 0;
	while (start < a.length && a[start] === b[start]) start++;
	let end = 0;
	while (end < a.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
	const x = a.slice(start, a.length - end);
	const y = b.slice(start, b.length - end);
	if (!x.length) return [];
	if (x.length > MOVED_WINDOW) return [`${x.length} lines in another order`];
	const table = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
	for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) table[i]![j] = x[i] === y[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
	const kept = new Set<number>();
	for (let i = 0, j = 0; i < x.length && j < y.length; ) {
		if (x[i] === y[j]) {
			kept.add(j);
			i++;
			j++;
		} else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
		else j++;
	}
	return y.filter((_, j) => !kept.has(j)).slice(0, MOVED_MAX);
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

async function snapshot(page: Page, origins: readonly string[]): Promise<string[]> {
	// Indentation is structure, which the rendered check compares; a step's effect is which nodes appear and disappear.
	// The app's own host name inside a URL's query (`utm_source=old.example`) is where the page runs, not what it shows.
	let text = await page.locator('body').ariaSnapshot({ timeout: 5_000 }).catch(() => '');
	for (const origin of origins) text = text.split(origin).join('').split(`=${new URL(origin).hostname}&`).join('={host}&');
	return text.split('\n').map((line) => line.trim());
}

const unOrigin = (text: string, origins: readonly string[]) => origins.reduce((t, o) => t.split(o).join(''), text);

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

export type Unreachability = 'occluded' | 'hidden' | 'offscreen' | 'disabled' | 'missing' | 'timeout';

/** A step's target that could not be used even after scrolling it to the middle, hovering what holds it, focusing it and dismissing overlays. */
export class UnreachableError extends Error {
	readonly kind: Unreachability;
	constructor(kind: Unreachability, detail: string) {
		super(`${kind}: ${detail}`);
		this.kind = kind;
	}
}

interface Diagnosis {
	readonly kind: Unreachability | 'ok';
	readonly detail: string;
}

// Runs in the page: why a visitor's pointer cannot reach the element.
function diagnose(el: Element): Diagnosis {
	const name = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}${(e.textContent ?? '').trim() ? ` "${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"` : ''}`;
	if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return { kind: 'disabled', detail: 'it is disabled' };
	const r = el.getBoundingClientRect();
	if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) || r.width < 1 || r.height < 1) {
		let at: Element | null = el;
		while (at) {
			const style = getComputedStyle(at);
			if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || at.hasAttribute('hidden')) return { kind: 'hidden', detail: `it is hidden (${at === el ? 'itself' : `inside ${name(at)}`}: ${style.display === 'none' ? 'display: none' : style.visibility === 'hidden' ? 'visibility: hidden' : style.opacity === '0' ? 'opacity: 0' : 'hidden'})` };
			at = at.parentElement;
		}
		return { kind: 'hidden', detail: `it has no size (${Math.round(r.width)}x${Math.round(r.height)})` };
	}
	const left = r.left + scrollX;
	const top = r.top + scrollY;
	const doc = document.documentElement;
	if (left + r.width <= 0 || top + r.height <= 0 || left >= doc.scrollWidth || top >= doc.scrollHeight) return { kind: 'offscreen', detail: `it sits outside the page at (${Math.round(left)}, ${Math.round(top)})` };
	const x = r.left + r.width / 2;
	const y = r.top + r.height / 2;
	if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { kind: 'offscreen', detail: `its centre (${Math.round(x)}, ${Math.round(y)}) cannot be scrolled into the ${innerWidth}x${innerHeight} viewport` };
	const hit = document.elementFromPoint(x, y);
	if (hit && hit !== el && hit.contains(el) && getComputedStyle(el).pointerEvents === 'none') return { kind: 'hidden', detail: 'it does not take the pointer (pointer-events: none)' };
	if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) return { kind: 'occluded', detail: `covered by ${name(hit)} at its centre (${Math.round(x)}, ${Math.round(y)})` };
	return { kind: 'ok', detail: '' };
}

// Runs in the page: marks the element's ancestors, nearest first, so each can be hovered in turn.
function markAncestors(el: Element): number {
	let n = 0;
	for (let at = el.parentElement; at && at !== document.body && n < 6; at = at.parentElement) at.setAttribute('data-markless-migrate-holder', String(n++));
	return n;
}

// Runs in the page: the button that dismisses the overlay covering the point, if one says so.
function markDismiss(point: { x: number; y: number }): boolean {
	const hit = document.elementFromPoint(point.x, point.y);
	let layer: Element | null = hit;
	while (layer && !['fixed', 'sticky'].includes(getComputedStyle(layer).position) && !layer.matches('dialog, [role="dialog"], [role="alertdialog"]')) layer = layer.parentElement;
	const scope = layer ?? hit;
	const button = scope && [...scope.querySelectorAll('button, [role="button"], a[href]')].find((b) => /^(accept( all)?( cookies)?|agree|i agree|allow( all)?|ok|okay|got it|close|dismiss|no,? thanks|reject( all)?|decline|continue|[x×✕✖])$/i.test(((b.textContent ?? '').trim() || b.getAttribute('aria-label') || '').trim()));
	if (!button) return false;
	button.setAttribute('data-markless-migrate-dismiss', '');
	return true;
}

const QUICK = 1_500;

/** Uses the target as a visitor would; when the pointer cannot reach it, scrolls it to the middle, focuses it, hovers what holds it and dismisses what covers it, and names why when nothing does. */
async function reach(page: Page, target: Locator, act: (t: Locator, timeout: number) => Promise<unknown>, throughLabel = false): Promise<void> {
	let first: unknown;
	try {
		await act(target, QUICK);
		return;
	} catch (error) {
		first = error;
	}
	const tried: string[] = [];
	const retry = async (remedy: string, apply: () => Promise<unknown>): Promise<boolean> => {
		tried.push(remedy);
		await apply().catch(() => {});
		try {
			await act(target, QUICK);
			return true;
		} catch {
			return false;
		}
	};
	const look = async (): Promise<Diagnosis> => (await target.count().catch(() => 0)) ? await target.evaluate(diagnose, undefined, { timeout: QUICK }).catch(() => ({ kind: 'timeout', detail: 'it did not settle' }) as Diagnosis) : { kind: 'missing', detail: 'it is not on the page' };
	let found = await look();
	if (found.kind === 'missing' || found.kind === 'disabled') throw new UnreachableError(found.kind, found.detail);
	if (throughLabel && (found.kind === 'hidden' || found.kind === 'occluded')) {
		// A radio or checkbox drawn by its label (code-group tabs, custom toggles) is used through the label, as a person does.
		const mark = `${Date.now()}-${Math.random()}`;
		const labelled = await target.evaluate((el, value) => {
			const label = el instanceof HTMLInputElement ? el.labels?.[0] : undefined;
			label?.setAttribute('data-markless-migrate-label', value);
			return Boolean(label);
		}, mark).catch(() => false);
		if (labelled) {
			tried.push('using its label');
			try {
				await act(page.locator(`[data-markless-migrate-label="${mark}"]`), QUICK);
				return;
			} catch {}
		}
	}
	if (found.kind === 'hidden') {
		const holders = await target.evaluate(markAncestors).catch(() => 0);
		for (let i = 0; i < holders; i++) {
			const holder = page.locator(`[data-markless-migrate-holder="${i}"]`).first();
			if (!(await holder.isVisible().catch(() => false))) continue;
			if (await retry('hovering what holds it', () => holder.hover({ timeout: QUICK }))) return;
			break;
		}
		if (await retry('focusing it', () => target.focus({ timeout: QUICK }))) return;
		found = await look();
	}
	if (found.kind === 'offscreen' || found.kind === 'occluded') {
		if (await retry('scrolling it to the middle', () => target.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' })))) return;
		if (await retry('focusing it', () => target.focus({ timeout: QUICK }))) return;
		found = await look();
	}
	if (found.kind === 'occluded') {
		if (await retry('pressing Escape', () => page.keyboard.press('Escape'))) return;
		const box = await target.boundingBox().catch(() => null);
		if (box && (await page.evaluate(markDismiss, { x: box.x + box.width / 2, y: box.y + box.height / 2 }).catch(() => false))) {
			if (await retry('dismissing the overlay', () => page.locator('[data-markless-migrate-dismiss]').first().click({ timeout: QUICK }))) return;
		}
		found = await look();
	}
	if (found.kind === 'ok' || found.kind === 'timeout') throw new UnreachableError('timeout', `${(first as Error).message.split('\n')[0]}${tried.length ? `, also after ${tried.join(', ')}` : ''}`);
	throw new UnreachableError(found.kind, `${found.detail}${tried.length ? `, still after ${[...new Set(tried)].join(', ')}` : ''}`);
}

const USED = 'data-markless-migrate-used';

async function perform(page: Page, step: Step): Promise<void> {
	const target = locate(page, step.target);
	await target
		.evaluate((el, used) => {
			for (const other of document.querySelectorAll(`[${used}]`)) other.removeAttribute(used);
			el.setAttribute(used, '');
		}, USED, { timeout: QUICK })
		.catch(() => {});
	switch (step.action) {
		case 'click':
			return reach(page, target, (t, timeout) => t.click({ timeout }), true);
		case 'press':
			await reach(page, target, (t, timeout) => t.focus({ timeout }));
			return page.keyboard.press(step.key);
		case 'fill':
			return reach(page, target, (t, timeout) => t.fill(step.value, { timeout }));
		case 'select':
			return reach(page, target, (t, timeout) => t.selectOption(step.value, { timeout }));
		case 'submit':
			for (const field of step.fields) await reach(page, locate(page, field.target), (t, timeout) => (field.check ? t.check({ timeout }) : t.fill(field.value, { timeout })));
			return reach(page, target, (t, timeout) => t.click({ timeout }));
	}
}

export interface Session {
	readonly context: BrowserContext;
	readonly page: Page;
	/** `destructive`: the step uses a control that ends the session or deletes, so its dialogs are accepted and, when writes are held back, every request it makes to the app is held back too. */
	run(step: Step, destructive?: boolean): Promise<StepResult>;
	/** One act of a journey's cycle after its `steps`. */
	cycle(steps: readonly Step[], act: CycleAct): Promise<StepResult>;
	/** Console errors the page logged while it loaded, before any step. */
	readonly loadErrors: readonly string[];
	close(): Promise<void>;
}

/** `loops`: track loops so the caller can hold them (motion records what an interaction starts, not what a loop keeps doing). */
export async function openSession(browser: Browser, env: SideEnv, route: string, viewport: Viewport, options: Pick<OpenOptions, 'loops'> = {}): Promise<Session> {
	const origin = env.origin;
	const { context, page, log } = await openPage(browser, env, viewport, { sameOriginOnly: true, ...options });
	const host = new URL(origin).origin;
	const oldHost = env.frontDoor ? new URL(env.frontDoor.old).origin : undefined;
	const hosts = oldHost && oldHost !== host ? [host, oldHost] : [host];
	const onOld = (url: string) => oldHost !== undefined && hosts.length > 1 && new URL(url).origin === oldHost;
	const here = (url: string) => (onOld(url) ? localUrl(url, oldHost!) : localUrl(url, origin));
	let dialogs: string[] = [];
	let accepting = false;
	page.on('dialog', (dialog) => {
		dialogs.push(`${dialog.type()}: ${dialog.message()}`);
		(accepting ? dialog.accept() : dialog.dismiss()).catch(() => {});
	});
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
	const signedIn = new Set([...signInCookies(env.storageState), ...signInCookies(env.frontDoor?.storageState)]);
	page.on('console', (message) => {
		// A failed resource load is reported by the assets check of the page that loads it.
		if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(unOrigin(message.text(), hosts));
	});
	page.on('pageerror', (error) => errors.push(unOrigin(error.message, hosts)));
	await loadPage(page, new URL(route, origin).href);
	await quiet(page, inflight, navigations);
	const loadErrors = [...errors];
	// Where a redirect landed is the http and auth checks' business; a step that stays there compares alike.
	const landing = here(page.url());
	const redirected = landing !== localUrl(new URL(route, origin).href, origin);
	const observe = async (act: () => Promise<void>, what: string, step: Step | undefined, destructive: boolean, reload: boolean): Promise<StepResult> => {
		const startPath = new URL(page.url()).pathname;
		const href = step?.target.role === 'link' ? await locate(page, step.target).getAttribute('href', { timeout: STEP_TIMEOUT }).catch(() => null) : null;
		documentLoaded = false;
		const before = await snapshot(page, hosts);
		const liveBefore = await page.evaluate(liveRegions).catch(() => [] as string[]);
		const stateBefore = await readState(page, signedIn);
		requests = [];
		errors = [];
		const writesBefore = log.writes.length;
		const keptBefore = await storageKeys(page, signedIn);
		let failed: string | undefined;
		let unreachable: Unreachability | undefined;
		dialogs = [];
		accepting = destructive;
		log.holdAll = destructive && !env.sendWrites;
		try {
			await act();
		} catch (error) {
			failed = `${what} could not be used: ${(error as Error).message.split('\n')[0]}`;
			if (error instanceof UnreachableError) unreachable = error.kind;
		}
		await quiet(page, inflight, navigations);
		log.holdAll = false;
		accepting = false;
		const after = await snapshot(page, hosts);
		const liveAfter = await page.evaluate(liveRegions).catch(() => [] as string[]);
		const { added, removed } = multisetDiff(before, after);
		const moved = documentLoaded && !reload ? [] : movedLines(before, after);
		const writes = log.writes.slice(writesBefore);
		const writeOf = new Map(writes.map((w) => [w.request, w.line]));
		const state = stateChange(stateBefore, await readState(page, signedIn));
		return {
			url: redirected && here(page.url()) === landing ? 'the page the route redirected to' : here(page.url()),
			navigated: reload ? new URL(page.url()).pathname !== startPath : documentLoaded || new URL(page.url()).pathname !== startPath || (href !== null && new URL(href, page.url()).href === page.url()),
			...(reload ? { reloaded: true } : {}),
			added,
			removed,
			...(moved.length ? { moved } : {}),
			requests: requests.flatMap((r) => {
				const line = writeOf.get(r) ?? appRequest(r, hosts);
				return line ? [line] : [];
			}),
			...(writes.length ? { writes: writes.map((w) => ({ line: w.line, reason: w.reason, sent: w.sent })) } : {}),
			errors: [...errors],
			announcements: liveAfter.filter((line) => !liveBefore.includes(line)),
			focus: await focusLabel(page),
			storage: storageChange(keptBefore, await storageKeys(page, signedIn)),
			...(failed ? { failed } : {}),
			...(unreachable ? { unreachable } : {}),
			...(dialogs.length ? { dialogs: [...dialogs] } : {}),
			...(onOld(page.url()) ? { door: true } : {}),
			...(state.length ? { state } : {}),
		};
	};
	return {
		context,
		page,
		loadErrors,
		run: (step, destructive = false) => observe(() => perform(page, step), describeTarget(step.target), step, destructive, false),
		cycle(steps, act) {
			const use = (step: Step) => observe(() => perform(page, step), describeTarget(step.target), step, false, false);
			if (act === 'again') return use(steps.at(-1)!);
			if (typeof act === 'object' && 'use' in act) return use({ ...steps.at(-1)!, target: act.use } as Step);
			if (act === 'reopen') return use(steps.at(-2) ?? steps.at(-1)!);
			if (act === 'escape') return observe(() => page.keyboard.press('Escape'), 'Escape', undefined, false, false);
			if (act === 'reload') return observe(async () => void (await page.reload({ waitUntil: 'load', timeout: 30_000 })), 'reloading the page', undefined, false, true);
			if (act === 'back') return observe(async () => void (await page.goBack({ waitUntil: 'load', timeout: 10_000 })), 'going back', undefined, false, false);
			if ('outside' in act) return observe(() => page.mouse.click(act.outside.x, act.outside.y), `a click at (${act.outside.x}, ${act.outside.y})`, undefined, false, false);
			return use({ action: 'click', target: act.navigate });
		},
		close: () => context.close(),
	};
}

export async function replay(browser: Browser, env: SideEnv, route: string, viewport: Viewport, journey: Journey): Promise<StepResult[]> {
	const session = await openSession(browser, env, route, viewport);
	try {
		const results: StepResult[] = [];
		for (const [i, step] of journey.steps.entries()) {
			const result = await session.run(step, Boolean(journey.destructive) && i === journey.steps.length - 1);
			results.push(result);
			if (result.failed) return results;
		}
		for (const act of journey.cycle ?? []) {
			const result = await session.cycle(journey.steps, act);
			results.push(result);
			if (result.failed) break;
		}
		return results;
	} finally {
		await session.close();
	}
}

/** The session one journey that ends the session or deletes runs in: with writes sent and a signed-in role it signs in afresh, so ending it spends no other journey's session; a role with only a saved session holds that journey's writes back instead. */
export async function destructiveEnv(env: SideEnv): Promise<SideEnv> {
	if (!env.sendWrites) return env;
	const door = env.frontDoor;
	if ((env.storageState && !env.signIn) || (door?.storageState && !door.signIn)) return { ...env, sendWrites: false };
	return {
		...env,
		...(env.storageState ? { storageState: await env.signIn!() } : {}),
		...(door?.storageState ? { frontDoor: { ...door, storageState: await door.signIn!() } } : {}),
	};
}

/** Journeys that end the session or delete, one at a time, each in a fresh session. */
export async function replayDestructive(browser: Browser, env: SideEnv, route: string, viewport: Viewport, journeys: readonly Journey[]): Promise<Run> {
	const out: StepResult[][] = [];
	for (const journey of journeys) out.push(await replay(browser, await destructiveEnv(env), route, viewport, journey));
	return out;
}

export async function pool<T, R>(items: readonly T[], size: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(size, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await task(items[i]!, i);
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
	/** Paths the new app serves in this run (the rest the front door sends to the old app): a stored mode is followed to one of them. */
	readonly serves?: (path: string) => boolean;
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
	/** It ends the session or deletes: used last, in a fresh session, and compared by the request it makes (held back unless writes are sent). */
	readonly destructive?: boolean;
	/** It could not be used on the old page: the journey that tried and why, to try it on the new page too. */
	readonly unreachable?: { readonly journey: Journey; readonly kind: Unreachability };
}

export interface Exploration {
	readonly journeys: RecordedJourney[];
	readonly elements: readonly ElementCoverage[];
	/** Keyboard and dismiss journeys left out when the budget ran out. */
	readonly skipped: number;
	/** Repeated-use and closing sequences left out when the budget ran out. */
	readonly sequencesSkipped?: number;
	/** Journeys that end the session or delete, not run here: run.ts runs them after every other journey on both sides. */
	readonly deferred: readonly { readonly journey: Journey; readonly signature: string }[];
}

interface Item {
	readonly journey: Journey;
	readonly element?: Tracked;
	readonly depth: number;
	/** Expand after it: collect what the last step revealed. */
	readonly expand: boolean;
	/** Run the journey, then find its cycle (runCycle); the cycled journey replaces the plain one. */
	readonly discover?: boolean;
	/** Which sequences run first when the budget is short: a control that changed the page's mode or what it stores (URGENT: right after its first use), then one that opened something. */
	readonly rank?: number;
	/** The element a sequence uses again: when an URGENT one is out of the budget, the element counts as not exercised. */
	readonly of?: Tracked;
}

const URGENT = 3;

/** Roles whose use leaves a state behind that the next use reads (on, off, selected, sorted, open). */
const STATEFUL_ROLES = new Set(['checkbox', 'switch', 'radio', 'tab', 'option', 'menuitemcheckbox', 'menuitemradio', 'summary', 'columnheader', 'treeitem']);
const STATEFUL_ARIA = ['aria-pressed', 'aria-checked', 'aria-expanded', 'aria-selected', 'aria-sort'];

interface Tracked {
	readonly candidate: Candidate;
	readonly element: string;
	readonly signature: string;
	readonly layout: boolean;
	readonly prefix: readonly Step[];
	by?: string;
	reason?: string;
	shared?: string;
	unreachable?: { readonly journey: Journey; readonly kind: Unreachability };
	readonly journeys: string[];
}

const cyclable = (step: Step) => step.action === 'click' && step.target.role !== 'link';

/** Whether a control can be used again now: `ok`, covered by an open dialog (Escape may close it), or gone. */
async function usable(page: Page, target: Target): Promise<'ok' | 'modal' | 'no'> {
	const found = locate(page, target);
	if (!(await found.count().catch(() => 0))) return 'no';
	const kind = (await found.evaluate(diagnose, undefined, { timeout: QUICK }).catch(() => ({ kind: 'timeout' }) as Diagnosis)).kind;
	if (kind === 'ok' || kind === 'offscreen') return 'ok';
	const modal = await page.evaluate(() => [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]')].some((d) => d.checkVisibility())).catch(() => false);
	return kind === 'occluded' && modal ? 'modal' : 'no';
}

// Runs in the page: the dialogs, menus, listboxes and popovers shown now, and a point outside all of them that holds no control.
function overlays(): { keys: string[]; outside: { x: number; y: number } | null } {
	const shown = [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [popover]')].filter((el) => el.checkVisibility() && (!el.hasAttribute('popover') || el.matches(':popover-open')));
	const keys = shown.map((el) => `${el.localName}|${el.getAttribute('role') ?? ''}|${el.id}|${el.getAttribute('aria-label') ?? ''}`);
	const boxes = shown.map((el) => el.getBoundingClientRect());
	const control = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"], [tabindex], [contenteditable=""], [contenteditable="true"]';
	let outside: { x: number; y: number } | null = null;
	for (const fy of [0.5, 0.9, 0.1, 0.7, 0.3]) {
		for (const fx of [0.05, 0.95, 0.5, 0.25, 0.75]) {
			const x = Math.round(innerWidth * fx);
			const y = Math.round(innerHeight * fy);
			if (boxes.some((b) => x >= b.left - 4 && x <= b.right + 4 && y >= b.top - 4 && y <= b.bottom + 4)) continue;
			const hit = document.elementFromPoint(x, y);
			if (!hit || (hit.closest(control) && !shown.includes(hit))) continue;
			outside = { x, y };
			break;
		}
		if (outside) break;
	}
	return { keys, outside };
}

/** The control the last step used, under the role and name it shows now; undefined when it is gone or is found by its structure. */
async function retarget(page: Page, t: Target): Promise<Target | undefined> {
	if (t.structure || t.role === CLICKABLE || t.role === 'summary') return undefined;
	const marked = page.locator(`[${USED}]`).first();
	if (!(await marked.count().catch(() => 0))) return undefined;
	const name = snapshotName((await marked.ariaSnapshot({ timeout: QUICK }).catch(() => '')).split('\n')[0] ?? '');
	const alike = await page.getByRole(t.role as Parameters<Page['getByRole']>[0], { name, exact: true }).all();
	for (const [nth, el] of alike.entries()) if (await el.evaluate((e, used) => e.hasAttribute(used), USED).catch(() => false)) return { role: t.role, name, nth };
	return undefined;
}

/** Uses the control of a journey's last step again until it has been used CYCLE_USES times, closing with Escape a dialog it opened in between; reloads when the journey stored something and uses it once more. Acts the old page would not take are left out, so both sides replay only what the old one did. */
async function runCycle(session: Session, steps: readonly Step[], expected: StepResult[], preset?: readonly CycleAct[]): Promise<CycleAct[]> {
	const step = steps.at(-1)!;
	const cycle: CycleAct[] = [];
	let current = (await retarget(session.page, step.target)) ?? step.target;
	const take = async (wanted: CycleAct): Promise<boolean> => {
		const act: CycleAct = wanted === 'again' && !sameTarget(current, step.target) ? { use: current } : wanted;
		if ((wanted === 'again' || act === 'reopen') && (await usable(session.page, act === 'reopen' ? (steps.at(-2) ?? step).target : current)) !== 'ok') return false;
		const result = await session.cycle(steps, act);
		if (result.failed) return false;
		cycle.push(act);
		expected.push(result);
		if (wanted === 'again') current = (await retarget(session.page, current)) ?? current;
		return true;
	};
	if (preset) {
		for (const act of preset) if (!(await take(act)) && act !== 'again') break;
		return cycle;
	}
	let uses = 1;
	while (uses < CYCLE_USES && cycle.length < CYCLE_ACTS) {
		const now = await usable(session.page, current);
		if (now === 'ok') {
			if (!(await take('again')) || expected.at(-1)!.navigated) return cycle;
			uses++;
		} else if (now === 'modal' && cycle.at(-1) !== 'escape') {
			if (!(await take('escape'))) break;
		} else {
			if (uses === 1 && steps.length > 1 && cyclable(steps.at(-2)!)) await take('reopen');
			break;
		}
	}
	if (expected.some(stores) && (await take('reload'))) await take('again');
	return cycle;
}

const stores = (r: StepResult) => Boolean(r.storage?.length || r.state?.some((line) => /^(localStorage|sessionStorage|cookie) /.test(line)));

const closedBy = (act: CycleAct) => (act === 'escape' ? 'Escape' : act === 'back' ? 'going back' : 'a click outside it');

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
	const deferred: { journey: Journey; signature: string }[] = [];
	const sequences: Item[] = [];

	const sampled = new Map<string, number>();
	const track = (found: readonly Candidate[], prefix: readonly Step[], parent: Tracked | undefined): Tracked[] => {
		const fresh: Tracked[] = [];
		for (const raw of found) {
			const id = `${raw.target.role}|${raw.target.name}|${raw.target.nth}`;
			if (known.has(id)) continue;
			known.add(id);
			const seen = raw.group ? (sampled.get(raw.group) ?? 0) : 0;
			if (raw.group) sampled.set(raw.group, seen + 1);
			if (raw.group && seen >= SAMPLES) continue;
			const c = raw;
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
			if (t.candidate.destructive) {
				deferred.push({ journey: { name: steps.map(describeStep).join(', then '), steps, destructive: true }, signature: t.signature });
				t.reason = 'it ends the session or deletes, so it is used after every other journey';
				continue;
			}
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
	let navLink: Target | undefined;
	try {
		const found = await candidates(start.page, host);
		const here = new URL(route, origin);
		// Another page the new app serves, else this page again by a link to it (an in-place navigation), else any page of the app.
		const rank = (c: Candidate) => {
			if (c.target.role !== 'link' || !c.href || c.covered || c.destructive || /^javascript:/i.test(c.href)) return 0;
			const to = new URL(c.href, here);
			if (to.origin !== host) return 0;
			if (to.pathname === here.pathname) return to.hash ? 0 : 2;
			return options.serves?.(to.pathname) ? 3 : 1;
		};
		const links = found.map((c) => ({ c, rank: rank(c) * 2 + (isLayout(c) ? 1 : 0) })).filter((l) => l.rank > 1);
		navLink = links.sort((a, b) => b.rank - a.rank)[0]?.c.target;
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
			const page = session.page;
			const primary = Boolean(item.element);
			let opened: string[] = [];
			let outside: { x: number; y: number } | null = null;
			let historyGrew = false;
			for (const [i, step] of item.journey.steps.entries()) {
				const watch = primary && i === item.journey.steps.length - 1;
				const before = watch ? await page.evaluate(overlays).catch(() => undefined) : undefined;
				const historyBefore = watch ? await page.evaluate(() => history.length).catch(() => 0) : 0;
				const result = await session.run(step);
				expected.push(result);
				if (result.failed) break;
				if (!before) continue;
				const now = await page.evaluate(overlays).catch(() => undefined);
				opened = now ? now.keys.filter((k) => !before.keys.includes(k)) : [];
				outside = now?.outside ?? null;
				historyGrew = (await page.evaluate(() => history.length).catch(() => 0)) > historyBefore;
			}
			const last = expected.at(-1)!;
			const done = expected.length === item.journey.steps.length && !last.failed;
			const stayed = done && new URL(page.url()).pathname === new URL(route, origin).pathname && !last.navigated;
			// The control just used, renamed by its use ("currently light mode"), is the same control, not one it revealed.
			const renamed = item.expand && stayed ? await retarget(page, item.journey.steps.at(-1)!.target) : undefined;
			const revealed = item.expand && stayed ? (await candidates(page, host)).filter((c) => !renamed || !sameTarget(c.target, renamed)) : [];
			const steps = item.journey.steps;
			const step = steps.at(-1)!;
			const expanded = stayed && step.action === 'click' && (await locate(page, step.target).getAttribute('aria-expanded', { timeout: 500 }).catch(() => null)) === 'true';
			const sequences: Item[] = [];
			let journey: Journey = item.journey;
			if ((item.discover || item.journey.cycle) && stayed) {
				const { cycle: _, ...plain } = item.journey;
				const cycle = await runCycle(session, steps, expected, item.journey.cycle);
				journey = cycle.length ? { ...plain, cycle } : plain;
			} else if (primary && stayed && cyclable(step)) {
				const now = await usable(page, step.target);
				const marked = await locate(page, step.target).evaluate((el, names) => names.some((n) => el.hasAttribute(n)), STATEFUL_ARIA, { timeout: QUICK }).catch(() => false);
				const changed = Boolean(last.state?.length);
				const stored = stores(last);
				const reopens = now === 'no' && steps.length > 1 && cyclable(steps.at(-2)!);
				if (changed || opened.length || marked || STATEFUL_ROLES.has(step.target.role) || reopens) sequences.push({ journey: item.journey, depth: item.depth, expand: false, discover: true, rank: changed ? URGENT : opened.length ? 2 : reopens ? 0 : 1, of: item.element });
				const closes: CycleAct[] = opened.length ? [...(now === 'modal' ? [] : ['escape' as const]), ...(outside ? [{ outside }] : []), ...(historyGrew ? ['back' as const] : [])] : [];
				for (const close of closes) sequences.push({ journey: { name: `${item.journey.name}, closed by ${closedBy(close)}`, steps, cycle: [close, 'again'] }, depth: item.depth, expand: false, rank: 2, of: item.element });
				if (stored && navLink) sequences.push({ journey: { name: `${item.journey.name}, then follow ${describeTarget(navLink)}`, steps, cycle: [{ navigate: navLink }, 'again', 'reload'] }, depth: item.depth, expand: false, rank: URGENT, of: item.element });
			}
			return { item: { ...item, journey }, expected, done, failed: last.failed, unreachable: last.unreachable, revealed, expanded, sequences, empty: !item.discover && Boolean(item.journey.cycle) && !journey.cycle?.length };
		} finally {
			await session.close();
		}
	};

	type Ran = Awaited<ReturnType<typeof runItem>>;
	let sequencesSkipped = 0;
	const applySequence = (item: Item, r: Ran | undefined): void => {
		if (!r) {
			if (item.discover || item.journey.cycle) sequencesSkipped++;
			if ((item.rank ?? 0) >= URGENT && item.of?.by) {
				item.of.by = undefined;
				item.of.reason = `it was used once, but using it again, after a reload or after following a link is ${budgetReason(budget, options.maxJourneys)}`;
			}
			return;
		}
		if (r.empty) return;
		if (!item.discover) return void journeys.push({ ...r.item.journey, expected: r.expected });
		const at = journeys.findIndex((j) => j.name === item.journey.name && !j.cycle);
		if (at >= 0 && r.item.journey.cycle?.length) journeys[at] = { ...r.item.journey, expected: r.expected };
	};

	for (let depth = 1; wave.length; depth++) {
		const room = Math.max(0, cap - journeys.length);
		const runnable = wave.slice(0, room);
		for (const item of wave.slice(room)) if (item.element) item.element.reason = `out of the journey budget (${options.maxJourneys} journeys)`;
		// A control that changed the page's mode or what it stores is used again straight after, before deeper controls can spend the budget.
		const results = await pool(runnable, CONCURRENCY, async (item) => {
			if (outOfBudget()) return undefined;
			const r = await runItem(item);
			const urgent: { item: Item; r: Ran | undefined }[] = [];
			for (const s of r.sequences) if ((s.rank ?? 0) >= URGENT) urgent.push({ item: s, r: outOfBudget() ? undefined : await runItem(s) });
			return { ...r, urgent };
		});
		const next: Item[] = [];
		for (const [i, r] of results.entries()) {
			const item = r?.item ?? runnable[i]!;
			if (!r) {
				if (item.element) item.element.reason = budgetReason(budget, options.maxJourneys);
				continue;
			}
			journeys.push({ ...item.journey, expected: r.expected });
			sequences.push(...r.sequences.filter((s) => (s.rank ?? 0) < URGENT));
			if (item.element) {
				if (r.done) item.element.by = item.journey.name;
				else {
					item.element.reason = `it could not be used on the old page: ${r.failed ?? 'the journey stopped before it'}`;
					if (r.unreachable) item.element.unreachable = { journey: item.journey, kind: r.unreachable };
				}
			}
			for (const u of r.urgent) applySequence(u.item, u.r);
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

	// Repeated use and closing sequences, then keyboard paths; a cycled journey takes the place of its plain one.
	const ordered = [...sequences.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)), ...later];
	// --max-journeys counts journeys: a cycle that replaces its plain journey takes no slot.
	let room = Math.max(0, cap - journeys.length);
	const fits = ordered.map((item) => item.discover || room-- > 0);
	const extra = await pool(ordered, CONCURRENCY, async (item, i) => (fits[i] && !outOfBudget() ? runItem(item) : undefined));
	let skipped = 0;
	for (const [i, item] of ordered.entries()) {
		const r = extra[i];
		if (!r && !item.discover && !item.journey.cycle) skipped++;
		applySequence(item, r);
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
		...(t.candidate.destructive ? { destructive: true } : {}),
		...(t.unreachable && !t.by ? { unreachable: t.unreachable } : {}),
	}));
	for (const [group, n] of sampled) {
		if (n <= SAMPLES) continue;
		const role = group.split('|')[0]!;
		elements.push({ element: `${n - SAMPLES} more ${role}${n - SAMPLES === 1 ? '' : 's'} of the same ${role === 'treeitem' ? 'tree' : 'grid'}`, signature: `sampled|${group}`, layout: false, by: `alike: the first ${SAMPLES} are exercised` });
	}
	return { journeys, elements, skipped, sequencesSkipped, deferred };
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
	if (parts.includes('moved')) out.push(`moves: ${result.moved?.join(' | ') || '(nothing)'}`);
	if (parts.includes('requests')) out.push(`requests: ${result.requests.join(', ') || '(none)'}`);
	if (parts.includes('errors')) out.push(`console errors: ${result.errors.join(' | ') || '(none)'}`);
	if (parts.includes('announcements')) out.push(`announced: ${result.announcements.join(' | ') || '(nothing)'}`);
	if (parts.includes('focus')) out.push(`focus on ${result.focus}`);
	if (parts.includes('state')) out.push(`changed: ${result.state?.join(' | ') || '(nothing)'}`);
	if (parts.includes('storage')) out.push(`kept in the browser: ${result.storage?.join(', ') || '(no change)'}`);
	if (parts.includes('dialogs')) out.push(`dialogs: ${result.dialogs?.join(' | ') || '(none)'}`);
	return out.join('; ');
}

/** The first step of each journey whose result on NEW differs from every OLD run, where the OLD runs agree. */
/** Step results of every journey in one run, in journey order. */
export type Run = readonly (readonly StepResult[])[];

/** Journeys whose cycle changed how the page looks (its background, text colour or colour scheme): a theme or mode, which an OS in dark mode can start from another state. */
export function themed(journeys: readonly RecordedJourney[]): RecordedJourney[] {
	return journeys.filter((j) => j.cycle?.length && !j.destructive && j.expected.some((r) => r.state?.some((l) => /^page (background|text colour|color-scheme):/.test(l))));
}

/** The same journeys as seen with the OS in dark mode, named so. */
export const inDarkMode = (journeys: readonly Journey[]): Journey[] => journeys.map((j) => ({ ...j, name: `${j.name}, with the OS in dark mode` }));

export async function replayAll(browser: Browser, env: SideEnv, route: string, viewport: Viewport, journeys: readonly Journey[]): Promise<Run> {
	return pool(journeys, CONCURRENCY, (journey) => replay(browser, env, route, viewport, journey));
}

/** What each unswitched page a NEW journey reached logs to the console on a plain load from the old app: those errors are that page's own, not the port's. */
export async function doorPageErrors(browser: Browser, old: SideEnv, viewport: Viewport, next: Run): Promise<Map<string, readonly string[]>> {
	const urls = [...new Set(next.flat().filter((step) => step.door && step.errors.length).map((step) => step.url))];
	const out = new Map<string, readonly string[]>();
	await Promise.all(
		urls.map(async (url) => {
			const session = await openSession(browser, old, url, viewport).catch(() => undefined);
			if (!session) return;
			out.set(url, session.loadErrors);
			await session.close();
		}),
	);
	return out;
}

/** What a cycle act is called in a check name: `click button "Theme" (use 2 of 3)`. */
function cycleLabel(steps: number, acts: readonly CycleAct[], i: number): string {
	const step = `step ${steps + i + 1} of ${steps + acts.length}`;
	const uses = 1 + acts.slice(0, i + 1).filter((a) => a === 'again' || (typeof a === 'object' && 'use' in a)).length;
	const act = acts[i]!;
	const after = acts.slice(0, i).some((a) => a === 'reload') ? ', after the reload' : acts.slice(0, i).some((a) => typeof a === 'object' && 'navigate' in a) ? ', on the page it led to' : '';
	if (act === 'again' || (typeof act === 'object' && 'use' in act)) return `${step}: use ${uses}${after}`;
	if (act === 'reopen') return `${step}: open it again`;
	if (act === 'reload') return `${step}: reload after use ${uses}${after}`;
	if (typeof act === 'object' && 'navigate' in act) return `${step}: follow ${describeTarget(act.navigate)} after use ${uses}`;
	return `${step}: closed by ${closedBy(act)} after use ${uses}`;
}

/** What a state line is about: `html data-theme`, `html class dark`, `localStorage theme`. */
const subject = (line: string) => line.replace(/ class [+-]/, ' class ').split(': ')[0]!;

/** State lines compared between the sides: what the page shows and keeps. How it gets there (attributes and class names on <html> and <body>, a framework's own markers among them) is shown, not compared. */
const effects = (lines: readonly string[] | undefined, owner?: StorageOwner) => (lines ?? []).filter((l) => !/^(html|body) /.test(l) && !(/^(localStorage|sessionStorage|cookie) /.test(l) && owner?.(subject(l))));

/** Each step's changes on one side, one line per step up to `upto`, so a cycle failure shows where the two sides parted. */
function trail(results: readonly (StepResult | undefined)[], first: number, upto: number): string {
	return results
		.slice(first, upto + 1)
		.map((r, i) => `${first + i + 1}. ${r?.failed ? 'could not be used' : r?.state?.join(', ') || r?.added.slice(0, 2).join(', ') || '(no change)'}`)
		.join('; ');
}

// A clock's reading (63:02:59:59, 12:30:05): a page's own clock ticks with its timers, whenever a step happens to take a second.
const CLOCK = /\b\d{1,3}(?::\d{2}){1,3}\b/g;
const CLOCK_TEXT = /^(\s*- [^"]*")\d{1,3}(?::\d{2}){1,3}(")/;

/** What a step added and removed, compared without a clock's reading: a clock that only ticked (the same line gone and back) is no change. */
export function untick(r: Pick<StepResult, 'added' | 'removed'>): { added: string[]; removed: string[] } {
	const read = (line: string) => (CLOCK_TEXT.test(line) ? line.replace(CLOCK, '<clock>') : undefined);
	const removed = [...r.removed];
	const added: string[] = [];
	for (const line of r.added) {
		const clock = read(line);
		const i = clock === undefined ? -1 : removed.findIndex((other) => other !== line && read(other) === clock);
		if (i >= 0) removed.splice(i, 1);
		else added.push(line);
	}
	const reading = (line: string) => read(line) ?? line;
	return { added: added.map(reading), removed: removed.map(reading) };
}

export function compareJourneys(route: string, olds: readonly Run[], journeys: readonly Journey[], next: Run, owner?: StorageOwner, doorErrors?: ReadonlyMap<string, readonly string[]>): Failure[] {
	const failures: Failure[] = [];
	journeys.forEach((journey, j) => {
		const runs = olds.map((o) => o[j]!);
		const actual = next[j]!;
		const acts = journey.cycle ?? [];
		const last = journey.steps.length - 1;
		for (let k = 0; k < journey.steps.length + acts.length; k++) {
			const step = journey.steps[Math.min(k, last)]!;
			const act = k > last ? acts[k - last - 1] : undefined;
			// After an in-site navigation only what the journey's own control changed is compared; how the new page loads is the navigation check's.
			const navigatedAway = acts.slice(0, Math.max(0, k - last)).some((x) => typeof x === 'object' && 'navigate' in x);
			// After a reload or a followed link, what is kept is compared only for what the journey's own steps changed: a router's own scroll-restoration entry is not the control's.
			const touched = new Set(runs[0]!.slice(0, k).flatMap((r) => [...(r.state ?? []).map(subject), ...(r.storage ?? []).map((l) => l.replace(/^[+-] /, '').split(' ').slice(0, 2).join(' '))]));
			const kept = (lines: readonly string[] | undefined) => (lines ?? []).filter((l) => touched.has(l.replace(/^[+-] /, '').split(' ').slice(0, 2).join(' ')));
			const following = typeof act === 'object' && 'navigate' in act;
			const restricted = following || (navigatedAway && act === 'reload');
			const mine = (r: StepResult | undefined): StepResult | undefined => (!r ? r : restricted ? { ...r, added: [], removed: [], moved: [], state: (r.state ?? []).filter((l) => touched.has(subject(l))), storage: kept(r.storage) } : act === 'reload' ? { ...r, state: (r.state ?? []).filter((l) => touched.has(subject(l))), storage: kept(r.storage) } : r);
			const oldSteps = runs.map((r) => mine(r[k]));
			if (oldSteps.some((s) => !s || s.failed)) break;
			const [a, ...rest] = oldSteps as StepResult[];
			const n = mine(actual[k]);
			// A page the front door serves from the old app keeps its state on the old app's origin.
			if ((following || navigatedAway) && n?.door) break;
			const dimension: Dimension = step.action === 'press' ? 'a11y' : 'behaviour';
			const named = journey.steps.length > 1 && k <= last ? `${journey.name} (step ${k + 1})` : journey.name;
			const check = act ? `${journey.name} (${cycleLabel(journey.steps.length, acts, k - last - 1)})` : named;
			const hint = act ? HINTS.cycle : step.action === 'press' ? HINTS.keyboard : HINTS.behaviour;
			const where = (side: string, f: string) => (act ? `${side} ${f}; step by step: ${trail(side === 'old' ? runs[0]! : actual, last, k)}` : f);
			if (!n || n.failed) {
				failures.push({ route, dimension, check, expected: where('old', format(a!, ['url', 'added', 'state'])), actual: where('new', n?.failed ?? 'the journey stopped before this step'), hint });
				break;
			}
			const parts: string[] = [];
			if (!stable([a!.url, ...rest.map((r) => r.url)])(n.url)) parts.push('url');
			const navigated = n.navigated || oldSteps.some((x) => x!.navigated);
			const reloaded = n.reloaded || oldSteps.some((x) => x!.reloaded);
			let automatic: Failure['automatic'];
			const fields = navigated ? (following ? (['requests', 'state', 'storage', 'dialogs'] as const) : (['requests', 'storage', 'dialogs'] as const)) : reloaded ? (['added', 'removed', 'state', 'storage'] as const) : (['added', 'removed', 'moved', 'requests', 'announcements', 'state', 'storage', 'dialogs'] as const);
			for (const field of fields.filter((f) => !(f === 'storage' && n.door))) {
				// Requests in flight together finish in any order (a client retrying hosts it shuffled), so they count as a set.
				const lines = (r: StepResult) => (field === 'requests' ? [...r[field]].sort() : field === 'state' ? effects(r.state, owner) : field === 'added' || field === 'removed' ? untick(r)[field] : (r[field] ?? []));
				const diff = diffLines(lineTemplates(lines(a!), ...rest.map(lines)), lines(n));
				if (diff.changed.length || diff.missing.length || diff.unexpected.length) parts.push(field);
				if (field === 'storage') automatic = storageCandidate([...diff.missing, ...diff.changed.map((c) => c.expected)], [...diff.unexpected, ...diff.changed.map((c) => c.actual)], owner);
			}
			const own = n.door ? doorErrors?.get(n.url) : undefined;
			const errors = diffLines(lineTemplates(a!.errors, ...rest.map((r) => r.errors)), own ? n.errors.filter((e) => !own.includes(e)) : n.errors);
			if (errors.unexpected.length || errors.changed.length) parts.push('errors');
			if (!navigated && !reloaded && !stable([a!.focus, ...rest.map((r) => r.focus)])(n.focus)) parts.push('focus');
			if (parts.length) {
				failures.push({ route, dimension, check, expected: where('old', format(a!, parts)), actual: where('new', format(n, parts)), hint, ...(automatic && parts.length === 1 && parts[0] === 'storage' ? { automatic } : {}) });
				break;
			}
		}
	});
	return failures;
}
