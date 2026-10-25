import { sessionDatabases, updateCount } from './live-data.ts';
import { linkUrl, pageRouting, routeLinks, routePath, shownUrl } from './hash-routes.ts';
import { FRAMEWORK_MARKUP_SELECTOR } from './automatic.ts';
import type { Browser, BrowserContext, Locator, Page, Request } from 'playwright';
import { frameworkTransport, openPage, requestLine, type OpenOptions, type SideEnv, databaseFramesReceived } from './browser.ts';
import { clockLine } from './clock.ts';
import { markHandlers } from './handlers.ts';
import { originInQuery } from './capture.ts';
import { HINTS } from './hints.ts';
import { signInCookies, storageKeys } from './storage.ts';
import { diffLines, lineTemplates, template } from './noise.ts';
import type { Box, Dimension, Failure, Viewport, WriteLine } from './types.ts';
import { changedRegions } from './visual.ts';
import { storageCandidate, type StorageOwner } from './automatic.ts';
import { loadPage } from './infrastructure.ts';
import { describeStructure, STRUCTURE_ENGINE, type Structure } from './structure.ts';
import { compositeWidgets, controlPattern, focusEntry, MAX_PATTERN_WIDGETS, outsidePoint, PATTERN_BUDGET_MS, PATTERN_SAMPLES, patternJourneys, TOOLTIP_PROBES, TOOLTIP_WAIT_MS, typeaheadLetter, unsafeChoice, widgetState, type PatternKey, type PatternWidget } from './patterns.ts';

export interface Target {
	readonly role: string;
	readonly name: string;
	readonly nth: number;
	/** An element with no text or label (a chart bar, a grid's icon button): found again by its structure and position, not its name. */
	readonly structure?: Structure;
}

export type Key = 'Enter' | 'Space' | 'Escape' | 'ArrowDown' | 'ArrowUp' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'PageUp' | 'PageDown';

export type Step =
	| { readonly action: 'click'; readonly target: Target }
	| { readonly action: 'press'; readonly key: Key; readonly target: Target }
	/** A key pressed where focus is now (`focus`: on the target first, or where Tab enters it when it is a composite widget); `choose` presses Enter unless the item would leave the page or end the session, then Escape. */
	| { readonly action: 'key'; readonly key: PatternKey; readonly target: Target; readonly focus?: boolean; readonly choose?: boolean }
	/** A click on a point outside the target and every pop-up shown, on no other control. */
	| { readonly action: 'outside'; readonly target: Target }
	| { readonly action: 'fill'; readonly target: Target; readonly value: string }
	| { readonly action: 'select'; readonly target: Target; readonly value: string }
	| { readonly action: 'submit'; readonly target: Target; readonly fields: readonly { readonly target: Target; readonly value: string; readonly check?: boolean }[] }
	| { readonly action: 'scroll'; readonly target: Target }
	| { readonly action: 'hover'; readonly target: Target; readonly at: number }
	/** The next `updates` updates the old page heard from its realtime database, sent to every socket of the page session. */
	| { readonly action: 'live'; readonly target: Target; readonly updates: number; /** Kept for the next load only, as if the page were closed while the database changed. */ readonly away?: boolean };

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
	/** A document loaded during the step (not a router's swap in place). */
	readonly loaded?: boolean;
	/** After a keyboard pattern step: the widget's value, whether it is expanded, and its active, highlighted, selected and expanded items (patterns.ts widgetState). */
	readonly widget?: readonly string[];
	/** The step fetched the next page from the app's server through its framework (a router fragment, an RSC payload): what that page reads is that route's own check. */
	readonly paged?: boolean;
	/** How the page answered where a visitor sees it, when the step stayed on the page: the viewport regions whose pixels changed outside the used control's own box, and what changed in its widgets (a value, a selection, a moved or scrolled track). */
	readonly reaction?: Reaction;
}

export interface Reaction {
	readonly regions: readonly Box[];
	/** `slider "Volume" aria-valuenow: 50 → 51`, `region (carousel) moved`, `list "Results" scrolled`. */
	readonly changes: readonly string[];
	/** The window scrolled during the step, so every pixel moved and regions say nothing about what answered. */
	readonly scrolled?: boolean;
	/** Milliseconds from the step to the page's first change. */
	readonly answeredMs?: number;
	/** Transitions and animations that started while the step ran (`link "Badge" background-color`). */
	readonly transitions?: readonly string[];
	/** Layout shifts while the step ran: their summed score and the largest sideways and vertical jump of any element, in px. */
	readonly shift?: { readonly score: number; readonly x: number; readonly y: number };
	/** What a visitor saw between the step and its result, frame by frame: see Views. */
	readonly views?: Views;
}

/**
 * The page's text as painted, sampled once a frame while the step ran: `swaps` counts each time it changed, `interimMs` how long
 * the views between the one before the step and the result were on screen (a loading placeholder, content gone and back),
 * and `interim` what those views showed that neither end did.
 */
export interface Views {
	readonly swaps: number;
	readonly interimMs: number;
	readonly interim: readonly string[];
}

export interface Journey {
	readonly name: string;
	readonly steps: readonly Step[];
	/** Its last step uses a control that ends the session or deletes (Sign out, Delete): run after every other journey, each in a fresh session. */
	readonly destructive?: boolean;
	/** What is done after the steps, each compared like a step (see CycleAct). */
	readonly cycle?: readonly CycleAct[];
	/** How long each step may take to reach its control, when the default was too short on the old page (a busy page's control that settles late). */
	readonly patience?: number;
	/** The page the journey starts on, when not the route itself: its first step follows a link to the route in place, as a visitor arrives from another page. */
	readonly start?: string;
	/** The WAI-ARIA pattern whose keyboard sequence this journey runs: every step's widget state is compared. */
	readonly pattern?: string;
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
const BUDGET_PER_CONTROL_MS = 3_000;
const MAX_ADAPTIVE_BUDGET_MS = 900_000;
const DEFAULT_MAX_DEPTH = 4;
const CONCURRENCY = 8;
// Other pages tried as the place a visitor arrives from.
const ARRIVAL_ENTRIES = 3;
// Journeys run again after arriving in place, most important first.
export const MAX_ARRIVED = 30;
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
	if (t.role === SECTION) return `section #${t.name}`;
	if (t.structure) return `${t.role} ${describeStructure(t.structure)} (no name: matched by structure and position)`;
	return `${t.role}${t.name ? ` "${t.name}"` : ''}${t.nth ? ` #${t.nth + 1}` : ''}`;
}

export function describeStep(step: Step): string {
	switch (step.action) {
		case 'click':
			return `click ${describeTarget(step.target)}`;
		case 'press':
			return `press ${step.key} on ${describeTarget(step.target)}`;
		case 'key': {
			const key = step.key === 'Typeahead' ? 'the first letter of the last item' : step.choose ? `${step.key} to choose` : step.key;
			if (step.key === 'Focus') return `focus ${describeTarget(step.target)}`;
			return step.focus ? `focus ${describeTarget(step.target)} and press ${key}` : `press ${key}`;
		}
		case 'outside':
			return `click outside ${describeTarget(step.target)} and what it opened`;
		case 'fill':
			return `type "${step.value}" into ${describeTarget(step.target)}`;
		case 'select':
			return `choose "${step.value}" in ${describeTarget(step.target)}`;
		case 'submit':
			return `fill ${step.fields.map((f) => describeTarget(f.target)).join(', ')} and submit with ${describeTarget(step.target)}`;
		case 'scroll':
			return `scroll to ${describeTarget(step.target)}`;
		case 'hover':
			return `point at ${Math.round(step.at * 100)}% across ${describeTarget(step.target)}`;
		case 'live':
			return step.away ? `the database takes ${step.updates} update${step.updates === 1 ? '' : 's'} while the page is not listening` : `receive ${step.updates} live update${step.updates === 1 ? '' : 's'} from the database`;
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
	if (t.role === SECTION) return page.locator(`[id="${t.name.replace(/["\\]/g, '\\$&')}"]`).first();
	if (t.role === 'summary') return page.locator('summary').filter({ hasText: new RegExp(`^\\s*${escapeRegex(t.name)}\\s*$`) }).nth(t.nth);
	return page.getByRole(t.role as Parameters<Page['getByRole']>[0], t.name ? { name: spacing(t.name) } : { name: '', exact: true }).nth(t.nth);
}

// A name matched whatever whitespace it has: a port that drops the spaces between a select's options names it alike.
const spacing = (name: string) => new RegExp(`^\\s*${[...name.replace(/\s+/g, '')].map(escapeRegex).join('\\s*')}\\s*$`);

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
	/** Region, role, name and component slot: three or more of one kind are alike. */
	readonly kind?: string;
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
			const key = name.replace(/\s+/g, '');
			const nth = seen.get(key) ?? 0;
			seen.set(key, nth + 1);
			if (!(await locator.isVisible().catch(() => false)) || (await locator.isDisabled().catch(() => true))) continue;
			const info = await locator.evaluate(describeElement, undefined, { timeout: STEP_TIMEOUT }).catch(() => undefined);
			if (!info) continue;
			if (STRUCTURAL.has(role) && !(info.focusable || info.handler || info.sortable || info.selectable || (info.grid && role === 'row' && !info.header))) continue;
			const target = { role, name, nth };
			// The items of one long list (a search palette's 450 options) answer through the list's one handler: a few of them stand for the rest.
			const base = { target, kind: `${info.region || 'page'}|${role}|${name}|${info.kind}`, href: info.href, type: info.type, options: info.options, region: info.region, importance: importance(info), ...(info.focusable ? { focusable: true } : {}), ...(SAMPLED.has(role) ? { group: `${role}|${info.container}` } : info.list >= 0 ? { group: `${role}|list ${info.list}` } : {}) };
			if (role === 'link') {
				if (!info.href || /^(mailto|tel):/i.test(info.href)) {
					add({ ...base, covered: 'its address is compared by the rendered check' });
					continue;
				}
				if (/^javascript:/i.test(info.href)) {
					add(base);
					continue;
				}
				const url = linkUrl(info.href, page.url(), page);
				if (url.origin !== origin) {
					add({ ...base, covered: 'it leaves the app: its address is compared by the rendered check' });
					continue;
				}
				if (DESTRUCTIVE.test(url.pathname)) {
					add({ ...base, destructive: true });
					continue;
				}
				// A link goes where its address says, by the app's router (whose click handler is the same for every link): its address
				// is compared by the rendered check, and a few links of each region (to another page, or within this one) are followed.
				if (!base.group) {
					const here = new URL(shownUrl(page));
					add({ ...base, group: `link|${info.region}|${url.pathname === here.pathname ? 'here' : 'page'}` });
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
	for (const c of await page.evaluate(clickables, FRAMEWORK_MARKUP_SELECTOR).catch(() => [])) {
		const target = { role: CLICKABLE, name: c.name, nth: c.name ? c.nth : unnamed++, ...(c.name ? {} : { structure: c.structure }) };
		const base = { target, region: c.region, importance: importance(c), ...(c.name ? { kind: `${c.region || 'page'}|${CLICKABLE}|${c.name}|${c.structure.tag}` } : {}), ...(c.focusable ? { focusable: true } : {}) };
		add(c.name && DESTRUCTIVE.test(c.name) ? { ...base, destructive: true } : base);
	}
	// Three or more parts of one kind with one name in one region (each demo's "Copy" and "View Code") are alike: a few of them stand for the rest.
	const counts = new Map<string, number>();
	for (const c of out) if (c.kind) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
	return out.map((c) => (c.kind && !c.group && !c.covered && !c.destructive && (counts.get(c.kind) ?? 0) >= REPEATS ? { ...c, group: `repeat|${c.kind}` } : c));
}

const REPEATS = 3;

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
		// The kind of part it is: its component slot when it has one, else its tag and type.
		kind: el.getAttribute('data-slot') ?? `${el.localName}${el.getAttribute('type') ? `[${el.getAttribute('type')}]` : ''}`,
		selectable: el.hasAttribute('aria-selected'),
		grid: Boolean(grid && /^(grid|treegrid|tree)$/.test(grid.getAttribute('role') ?? '')),
		header: Boolean(el.querySelector('[role="columnheader"], th')),
		container: grid ? [...document.querySelectorAll('[role="grid"], [role="treegrid"], [role="tree"], [role="table"], table')].indexOf(grid) : -1,
		// A list of more than 8 options, menu items, tabs or radios is sampled; a shorter one is exercised item by item.
		list: (() => {
			const list = el.closest('[role="listbox"], [role="menu"], [role="tablist"], [role="radiogroup"]');
			if (!list) return -1;
			const own = [...list.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="tab"], [role="radio"]')].filter((x) => x.closest('[role="listbox"], [role="menu"], [role="tablist"], [role="radiogroup"]') === list);
			return own.length > 8 ? [...document.querySelectorAll('[role="listbox"], [role="menu"], [role="tablist"], [role="radiogroup"]')].indexOf(list) : -1;
		})(),
	};
}

const HOVER_POINTS = [0.2, 0.4, 0.6, 0.8];

/** Runs in the page: the outermost large elements that listen for the pointer moving over them and are no control, by structure, at most 6. */
function hoverSurfaces(): { tag: string; scope: string; index: number }[] {
	const hover = (globalThis as { __markless_migrate_hover__?: WeakSet<Element> }).__markless_migrate_hover__;
	if (!hover) return [];
	const LANDMARK: Record<string, string> = { main: 'main', nav: 'navigation', header: 'banner', footer: 'contentinfo', aside: 'complementary', form: 'form', table: 'table', dialog: 'dialog', figure: 'figure', svg: 'svg', ul: 'list', ol: 'list' };
	const scopeOf = (el: Element) => {
		const parts: string[] = [];
		for (let at = el.parentElement; at; at = at.parentElement) {
			const role = at.getAttribute('role') ?? LANDMARK[at.localName];
			if (role && role !== 'presentation' && role !== 'none' && role !== 'generic') parts.unshift(role);
		}
		return parts.join('>');
	};
	const control = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="slider"]';
	const big = (el: Element) => {
		const r = el.getBoundingClientRect();
		return r.width >= 120 && r.height >= 60;
	};
	const hits = [...(document.body?.querySelectorAll('*') ?? [])].filter((el) => hover.has(el) && big(el) && !el.matches(control) && !el.closest(control) && el.checkVisibility({ visibilityProperty: true }));
	const outer = hits.filter((el) => !hits.some((other) => other !== el && other.contains(el))).slice(0, 6);
	return outer.map((el) => {
		const scope = scopeOf(el);
		return { tag: el.localName, scope, index: [...document.querySelectorAll(el.localName)].filter((other) => scopeOf(other) === scope && other.checkVisibility({ visibilityProperty: true })).indexOf(el) };
	});
}

/** A section of the page found by its id (the target of a contents list's link). */
export const SECTION = 'section';
/** The target of a step that no control performs: the database sends it. */
export const LIVE = 'database';
const MAX_LIVE_STEPS = 6;
const LIVE_DELIVERY_MS = 5_000;

/** The recorded updates in at most MAX_LIVE_STEPS steps, each sending the next few in order. */
export function liveSteps(count: number): Step[] {
	const per = Math.ceil(count / MAX_LIVE_STEPS);
	const steps: Step[] = [];
	for (let sent = 0; sent < count; sent += per) steps.push({ action: 'live', target: { role: LIVE, name: '', nth: 0 }, updates: Math.min(per, count - sent) });
	return steps;
}

/** Runs in the page: the ids of the sections a contents list links to (in-page links in a nav or aside), in page order, at most 12. */
function contentsSections(): string[] {
	const links = [...document.querySelectorAll('nav a[href^="#"], aside a[href^="#"], [class*="toc" i] a[href^="#"]')].filter((a) => a.checkVisibility({ visibilityProperty: true }));
	const ids: string[] = [];
	for (const a of links) {
		const id = decodeURIComponent((a.getAttribute('href') ?? '').slice(1));
		if (id && document.getElementById(id) && !ids.includes(id)) ids.push(id);
		if (ids.length >= 12) break;
	}
	return ids;
}

/** Elements that answer a click or a key themselves but have no interactive role, each with its label and its index among the elements `labelled` finds for it. */
function clickables(frameworkMarkup: string) {
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
	// A framework's own markup (Next.js's route announcer) is no control of the page's.
	const hits = [...(document.body?.querySelectorAll('*') ?? [])].filter((el) => handlers.has(el) && !el.closest(frameworkMarkup) && !el.matches(control) && !el.closest(control) && !el.querySelector(control) && !el.matches(cell) && !(label(el) && ownLabel(el)) && el.querySelectorAll('*').length <= 40 && el.checkVisibility({ visibilityProperty: true }));
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

/** The page a framework fetch is for: Markless's /_markless/fragment/<path>, or the page URL itself without Next's _rsc. */
export function pagePath(url: URL): string {
	const path = url.pathname.startsWith('/_markless/fragment/') ? url.pathname.slice('/_markless/fragment'.length) : url.pathname;
	const search = new URLSearchParams(url.search);
	search.delete('_rsc');
	const query = search.toString();
	return `${path}${query ? `?${query}` : ''}`;
}

/** A request line that only reads: a GET or HEAD, or a GraphQL query (not a mutation). */
export const readLine = (line: string) => /^(GET|HEAD) /.test(line) || /^POST \S+ \{"query":"(query\b|\{)/.test(line);

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

// Runs in the page: whether a colour transition on <html> or <body> is still running.
function colourMoving(): boolean {
	return [document.documentElement, document.body].flatMap((el) => el?.getAnimations() ?? []).some((a) => a instanceof CSSTransition && /^(background|color|color-scheme|all)/.test(a.transitionProperty) && a.playState === 'running');
}

// Runs in the page: what a theme, a mode or a preference is kept as, `subject\tvalue`.
function pageState(): string[] {
	const root = document.documentElement;
	const body = document.body as HTMLElement | null;
	const own = [root, body].filter((el): el is HTMLElement => Boolean(el));
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

// Waiting is done from here, never by a loop in the page: a capture that holds the page's own loops would hold that loop too, and the read would never end.
async function readState(page: Page, signedIn: ReadonlySet<string>): Promise<string[]> {
	// A colour is read once its transition has ended, one that starts a frame late (`transition: all` on <html> after a theme class) too, at most 2 s.
	const until = Date.now() + 2_000;
	await sleep(50);
	while (Date.now() < until && (await page.evaluate(colourMoving).catch(() => false))) await sleep(50);
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

// Runs in the page before a step: records which attributes change, and where every scrolling container and the window stand.
function watchReaction(): void {
	type Watch = { observer: MutationObserver; changed: Map<Element, Map<string, string | null>>; inserted: Set<Node>; scrolls: Map<Element, string>; window: string; started: number; first?: number; shifts?: PerformanceObserver; shift: { score: number; x: number; y: number }; runs: { el: Element; what: string }[]; views: { at: number; text: string }[]; stop: () => void };
	const g = globalThis as { __markless_migrate_reaction__?: Watch };
	g.__markless_migrate_reaction__?.observer.disconnect();
	g.__markless_migrate_reaction__?.shifts?.disconnect();
	g.__markless_migrate_reaction__?.stop();
	const changed = new Map<Element, Map<string, string | null>>();
	const inserted = new Set<Node>();
	const timing = { started: performance.now(), first: undefined as number | undefined, input: undefined as number | undefined };
	// Timed from the input the page received, not from when the checker asked for it: how fast the checker's own clicks land is no page's.
	const input = (event: Event) => {
		if (timing.input === undefined) timing.input = event.timeStamp;
	};
	for (const type of ['pointerdown', 'mousedown', 'keydown', 'click', 'input']) addEventListener(type, input, { capture: true, once: true });
	const shift = { score: 0, x: 0, y: 0 };
	// Transitions that start while the step runs: a router that reuses the previous page's nodes makes them morph (an animation starting on the new page is the motion check's).
	const runs: { el: Element; what: string }[] = [];
	const ran = (event: Event) => {
		if (runs.length < 200 && event.target instanceof Element) runs.push({ el: event.target, what: (event as TransitionEvent).propertyName });
	};
	addEventListener('transitionrun', ran, { capture: true });
	// The text a visitor sees, read once a frame after something changed: a state that lasts less than a frame is never painted.
	const views: { at: number; text: string }[] = [];
	const painted = () => (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
	views.push({ at: timing.started, text: painted() });
	let dirty = false;
	let frame = 0;
	const sampleFrame = () => {
		if (dirty && views.length < 120) {
			dirty = false;
			const text = painted();
			if (text !== views[views.length - 1]!.text) views.push({ at: performance.now(), text });
		}
		frame = requestAnimationFrame(sampleFrame);
	};
	frame = requestAnimationFrame(sampleFrame);
	const observer = new MutationObserver((records) => {
		dirty = true;
		if (timing.first === undefined && timing.input !== undefined && records.some((r) => !(r.target instanceof Element && r.attributeName?.startsWith('data-markless-migrate')))) timing.first = performance.now();
		for (const r of records) {
			if (r.type === 'childList') for (const n of r.addedNodes) inserted.add(n);
			if (r.type !== 'attributes' || !(r.target instanceof Element) || !r.attributeName || r.attributeName.startsWith('data-markless-migrate')) continue;
			let attrs = changed.get(r.target);
			if (!attrs) changed.set(r.target, (attrs = new Map()));
			if (!attrs.has(r.attributeName)) attrs.set(r.attributeName, r.oldValue);
		}
	});
	observer.observe(document, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
	// Every layout shift while the step runs, those right after the input too: a page that jumps when a dialog closes is no answer the old page gave.
	let shifts: PerformanceObserver | undefined;
	try {
		shifts = new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as (PerformanceEntry & { value: number; sources?: { previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
				shift.score += entry.value;
				// Only a large part of the page moving counts as the page jumping; a word reflowing beside a changed number does not.
				for (const source of entry.sources ?? []) {
					if (source.currentRect.width * source.currentRect.height < innerWidth * innerHeight * 0.25) continue;
					shift.x = Math.max(shift.x, Math.abs(source.currentRect.x - source.previousRect.x));
					shift.y = Math.max(shift.y, Math.abs(source.currentRect.y - source.previousRect.y));
				}
			}
		});
		shifts.observe({ type: 'layout-shift', buffered: false });
	} catch {}
	const scrolls = new Map<Element, string>();
	for (const el of document.body?.querySelectorAll('*') ?? []) {
		if (scrolls.size >= 400) break;
		if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
			const s = getComputedStyle(el);
			if (/(auto|scroll)/.test(`${s.overflowX} ${s.overflowY}`)) scrolls.set(el, `${Math.round(el.scrollLeft)},${Math.round(el.scrollTop)}`);
		}
	}
	g.__markless_migrate_reaction__ = { observer, changed, inserted, scrolls, window: `${Math.round(scrollX)},${Math.round(scrollY)}`, shifts, shift, runs, views, stop: () => { removeEventListener('transitionrun', ran, { capture: true }); cancelAnimationFrame(frame); }, get started() { return timing.input ?? timing.started; }, get first() { return timing.first; } };
}

// Runs in the page after a step: what changed in the page's widgets, named by role and label as a visitor's tools name them.
function readReaction(): { changes: string[]; scrolled: boolean; boxes: Record<string, { x: number; y: number; width: number; height: number }>; answeredMs?: number; shift: { score: number; x: number; y: number }; transitions: string[]; views?: { swaps: number; interimMs: number; interim: string[] } } {
	type Watch = { observer: MutationObserver; changed: Map<Element, Map<string, string | null>>; inserted: Set<Node>; scrolls: Map<Element, string>; window: string; started: number; first?: number; shifts?: PerformanceObserver; shift: { score: number; x: number; y: number }; runs: { el: Element; what: string }[]; views: { at: number; text: string }[]; stop: () => void };
	const g = globalThis as { __markless_migrate_reaction__?: Watch };
	const watch = g.__markless_migrate_reaction__;
	if (!watch) return { changes: [], scrolled: false, boxes: {}, shift: { score: 0, x: 0, y: 0 }, transitions: [] };
	for (const entry of (watch.shifts?.takeRecords() ?? []) as (PerformanceEntry & { value: number; sources?: { previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
		watch.shift.score += entry.value;
		for (const source of entry.sources ?? []) if (source.currentRect.width * source.currentRect.height >= innerWidth * innerHeight * 0.25) watch.shift.x = Math.max(watch.shift.x, Math.abs(source.currentRect.x - source.previousRect.x));
	}
	watch.shifts?.disconnect();
	watch.stop();
	watch.observer.disconnect();
	delete g.__markless_migrate_reaction__;
	// With the state attributes component libraries set for their styles: a port that leaves data-state or data-highlighted as it was looks different.
	const STATES = ['aria-valuenow', 'aria-valuetext', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-pressed', 'aria-current', 'open', 'data-state', 'data-highlighted', 'data-pressed', 'data-hovered', 'data-selected', 'data-checked', 'data-open', 'data-active', 'data-disabled', 'data-popup-open', 'data-focus-visible'];
	const IMPLICIT: Record<string, string> = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', dialog: 'dialog', details: 'group', summary: 'button', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', aside: 'complementary', form: 'form', table: 'table', ul: 'list', ol: 'list', li: 'listitem', section: 'region', img: 'img' };
	const roleOf = (el: Element) => el.getAttribute('role') ?? (el.localName === 'input' ? ((el as HTMLInputElement).type === 'range' ? 'slider' : (el as HTMLInputElement).type === 'checkbox' ? 'checkbox' : (el as HTMLInputElement).type === 'radio' ? 'radio' : 'textbox') : IMPLICIT[el.localName]);
	const label = (el: Element) => {
		const by = el.getAttribute('aria-labelledby');
		const named = el.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '');
		const text = named || (/^(button|link|tab|option|menuitem|menuitemradio|menuitemcheckbox|radio|checkbox|switch|treeitem|summary)$/.test(roleOf(el) ?? '') ? (el.textContent ?? '') : '');
		return text.replace(/\s+/g, ' ').trim().slice(0, 60);
	};
	const describe = (el: Element) => {
		const role = roleOf(el) ?? el.localName;
		const kind = el.getAttribute('aria-roledescription');
		const name = label(el);
		// Content kept hidden (another select's closed list) is no namesake a visitor meets.
		const alike = [...document.querySelectorAll(el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : el.localName)].filter((o) => (o === el || o.checkVisibility()) && label(o) === name);
		const nth = alike.length > 1 ? ` #${alike.indexOf(el) + 1}` : '';
		return `${role}${kind ? ` (${kind})` : ''}${name ? ` "${name}"` : ''}${nth}`;
	};
	// A part with no role of its own (a carousel's track) is named by the nearest widget or landmark holding it.
	const anchorOf = (el: Element) => {
		for (let at: Element | null = el; at && at !== document.body; at = at.parentElement) if (at.hasAttribute('role') || at.hasAttribute('aria-roledescription') || at.hasAttribute('aria-label') || /^(input|select|textarea|button|a|dialog|details|nav|main|header|footer|aside|form|table|section|ul|ol)$/.test(at.localName)) return at;
		return undefined;
	};
	const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
	const add = (line: string, el: Element | undefined) => {
		out.add(line);
		const r = el?.getBoundingClientRect();
		if (r) boxes[line] = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
	};
	const anchored = (el: Element, what: string) => {
		const at = anchorOf(el);
		add(`${at ? describe(at) : 'the page'} ${what}`, at);
	};
	const moved = (style: string | null | undefined) => {
		const probe = document.createElement('div');
		probe.setAttribute('style', style ?? '');
		const s = probe.style;
		return [s.transform, s.translate, s.left, s.top, s.right, s.bottom, s.marginLeft, s.marginTop, s.scale, s.rotate].join('|');
	};
	const out = new Set<string>();
	// A pop-up put in during the step is placed as it goes in; that it appeared is the step's added lines, not a move.
	const fresh = (el: Element) => {
		for (let at: Node | null = el; at; at = at.parentNode) if (watch.inserted.has(at)) return true;
		return false;
	};
	for (const [el, attrs] of watch.changed) {
		if (!el.isConnected) continue;
		for (const [attr, was] of attrs) {
			const now = el.getAttribute(attr);
			if (now === was) continue;
			if (STATES.includes(attr)) add(`${describe(el)} ${attr}: ${was ?? '(none)'} → ${now ?? '(none)'}`, el);
			else if (attr === 'style' && moved(was) !== moved(now) && !fresh(el)) anchored(el, 'moved');
			// A contents list marks its current section by a class or a data attribute on the in-page link.
			else if (el.matches('a[href^="#"]') && attr === 'class') {
				const before = new Set((was ?? '').split(/\s+/).filter(Boolean));
				const after = new Set((now ?? '').split(/\s+/).filter(Boolean));
				const diff = [...[...after].filter((c) => !before.has(c)).map((c) => `+${c}`), ...[...before].filter((c) => !after.has(c)).map((c) => `-${c}`)].sort();
				if (diff.length) add(`${describe(el)} class ${diff.join(' ')}`, el);
			} else if (el.matches('a[href^="#"]') && attr.startsWith('data-')) add(`${describe(el)} ${attr}: ${was ?? '(none)'} → ${now ?? '(none)'}`, el);
		}
	}
	for (const [el, was] of watch.scrolls) if (el.isConnected && `${Math.round(el.scrollLeft)},${Math.round(el.scrollTop)}` !== was) anchored(el, 'scrolled');
	const transitions = [...new Set(watch.runs.filter((r) => r.el.isConnected).map((r) => {
		const at = anchorOf(r.el);
		return `${at === r.el || !at ? (at ? describe(at) : r.el.localName) : `${r.el.localName} in ${describe(at)}`} ${r.what}`;
	}))].sort();
	const views = watch.views;
	const result = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
	if (views.length && result !== views[views.length - 1]!.text) views.push({ at: performance.now(), text: result });
	const ends = new Set([...(views[0]?.text ?? '').split(' '), ...result.split(' ')]);
	let interimMs = 0;
	const interim: string[] = [];
	for (let i = 1; i < views.length - 1; i++) {
		interimMs += views[i + 1]!.at - views[i]!.at;
		const own = views[i]!.text.split(' ').filter((w) => w && !ends.has(w));
		const line = own.length ? own.slice(0, 8).join(' ') + (own.length > 8 ? ' …' : '') : '(part of the page gone)';
		if (interim.length < 5 && !interim.includes(line)) interim.push(line);
	}
	return { transitions, changes: [...out].sort(), scrolled: `${Math.round(scrollX)},${Math.round(scrollY)}` !== watch.window, boxes, ...(watch.first !== undefined ? { answeredMs: Math.round(watch.first - watch.started) } : {}), shift: { score: Math.round(watch.shift.score * 1000) / 1000, x: Math.round(watch.shift.x), y: Math.round(watch.shift.y) }, ...(views.length ? { views: { swaps: views.length - 1, interimMs: Math.round(interimMs), interim } } : {}) };
}

type TimerWindow = { __markless_migrate_timer_mark__?: () => number; __markless_migrate_timers_after__?: (mark: number) => number; __markless_migrate_hold_timers__?: (on: boolean) => void };
const holdTimers = (page: Page, on: boolean) => page.evaluate((o) => (globalThis as TimerWindow).__markless_migrate_hold_timers__?.(o), on).catch(() => {});
const timerMark = (page: Page) => page.evaluate(() => (globalThis as TimerWindow).__markless_migrate_timer_mark__?.() ?? 0).catch(() => 0);

/** Waits (at most `cap`) until the timeouts of up to 3 s set since `mark` have fired. */
async function timersOut(page: Page, mark: number, cap = 3_500): Promise<void> {
	const until = Date.now() + cap;
	for (;;) {
		const left = await page.evaluate((m) => (globalThis as TimerWindow).__markless_migrate_timers_after__?.(m) ?? 0, mark).catch(() => 0);
		const room = until - Date.now();
		if (!(left > 0) || room <= 0) return;
		await sleep(Math.min(left + 20, room));
	}
}

// Long enough to see a page's own 3 s cycle once (htmx's class-tools demo toggling a class every 3 s).
const AMBIENT_MS = 3_500;
const ambientSeen = new Map<string, Promise<{ changes: readonly string[]; regions: readonly Box[]; lines: readonly string[]; unsettled?: boolean }>>();

// Measured on a route's first session on each side and reused by its later sessions, so a journey does not wait a second for it.
function ambientOnce(origin: string, route: string, page: Page, hosts: readonly string[]): Promise<{ changes: readonly string[]; regions: readonly Box[]; lines: readonly string[] }> {
	const key = `${origin} ${route} ${page.viewportSize()?.width ?? 0}`;
	let found = ambientSeen.get(key);
	if (!found) {
		ambientSeen.set(key, (found = ambientMotion(page, hosts)));
		// A measurement that saw most of the view change is a page still settling, not motion of its own: the next session measures again.
		void found.then((a) => {
			if (a.unsettled) ambientSeen.delete(key);
		});
	}
	return found;
}

/** What the settled page changes on its own while nothing is used: the widgets and regions of the view that move without a step. */
async function ambientMotion(page: Page, hosts: readonly string[]): Promise<{ changes: readonly string[]; regions: readonly Box[]; lines: readonly string[]; unsettled?: boolean }> {
	const before = await page.screenshot({ timeout: 10_000 }).catch(() => undefined);
	if (!before) return { changes: [], regions: [], lines: [] };
	const treeBefore = await snapshot(page, hosts);
	await page.evaluate(watchReaction).catch(() => {});
	// The tree is read again part way through and at the end, so a cycle back to where it started is still seen.
	await sleep(AMBIENT_MS / 2);
	const treeMid = await snapshot(page, hosts);
	const mid = await page.screenshot({ timeout: 10_000 }).catch(() => undefined);
	await sleep(AMBIENT_MS / 2);
	const read = await page.evaluate(readReaction).catch(() => undefined);
	const after = await page.screenshot({ timeout: 10_000 }).catch(() => undefined);
	const treeAfter = await snapshot(page, hosts);
	const moving = Object.values(read?.boxes ?? {});
	const lines = [...new Set([treeMid, treeAfter].flatMap((tree) => { const { added, removed } = multisetDiff(treeBefore, tree); return [...added, ...removed]; }))];
	// Pixels count as moving on their own only where both halves of the window saw them change: a page still painting in the first half
	// (a busy machine) would otherwise mask its whole view from every later step of the route.
	const first = mid && !read?.scrolled ? changedRegions(before, mid, []) : [];
	const second = mid && after && !read?.scrolled ? changedRegions(mid, after, []) : [];
	const both = first.filter((box) => second.some((other) => near(box, other)));
	const viewport = page.viewportSize();
	const huge = viewport ? both.some((box) => box.width * box.height > viewport.width * viewport.height * 0.4) : false;
	return { changes: read?.changes ?? [], regions: [...moving, ...(huge ? [] : both)], lines, ...(huge ? { unsettled: true } : {}) };
}

// Runs in the page: starts recording when a node was last added, removed or retexted; returns how long ago that was, in ms.
function domStill(): number {
	const g = globalThis as { __markless_migrate_dom_changed__?: number; __markless_migrate_dom_watch__?: MutationObserver };
	if (!g.__markless_migrate_dom_watch__) {
		g.__markless_migrate_dom_changed__ = performance.now();
		g.__markless_migrate_dom_watch__ = new MutationObserver((records) => {
			if (records.some((r) => r.type !== 'attributes')) g.__markless_migrate_dom_changed__ = performance.now();
		});
		g.__markless_migrate_dom_watch__.observe(document, { subtree: true, childList: true, characterData: true });
	}
	return performance.now() - (g.__markless_migrate_dom_changed__ ?? 0);
}

/** Waits until no node has been added, removed or retexted for 200 ms (at most 3 s), polling from here. */
async function domQuiet(page: Page): Promise<void> {
	const until = Date.now() + 3_000;
	while (Date.now() < until) {
		const still = await page.evaluate(domStill).catch(() => Infinity);
		if (still >= 200) return;
		await sleep(50);
	}
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
	// A framework's own route announcer is not the app's (the a11y comparison accepts it the same way): it is hidden from
	// the tree for the snapshot only, so the navigation it announces does not count it as content appearing or leaving.
	const hidden = await page.evaluate((selector) => {
		const hosts = [...document.querySelectorAll(selector)].filter((el) => !el.hasAttribute('aria-hidden'));
		for (const el of hosts) el.setAttribute('aria-hidden', 'true');
		return hosts.length;
	}, FRAMEWORK_MARKUP_SELECTOR).catch(() => 0);
	let text = routeLinks(await page.locator('body').ariaSnapshot({ timeout: 5_000 }).catch(() => ''), pageRouting(page));
	if (hidden) await page.evaluate((selector) => { for (const el of document.querySelectorAll(selector)) el.removeAttribute('aria-hidden'); }, FRAMEWORK_MARKUP_SELECTOR).catch(() => {});
	for (const origin of origins) text = text.split(origin).join('').split(`=${new URL(origin).hostname}&`).join('={host}&');
	return text.split('\n').map((line) => line.trim());
}

const unOrigin = (text: string, origins: readonly string[]) => origins.reduce((t, o) => t.split(o).join(''), text);

// V8's `    at fn (url:line:col)` and Firefox's `fn@url:line:col` frames name each app's own bundles, never the same twice.
const STACK_FRAME = /^\s+at\s|^[^\s@]*@\S+:\d+:\d+$/;

/** A console error as compared: its message, without the stack frames an Error logged whole carries, and without the app's origin. */
export function consoleErrorText(text: string, origins: readonly string[]): string {
	return unOrigin(text, origins)
		.split('\n')
		.filter((line) => !STACK_FRAME.test(line))
		.join('\n')
		.trim();
}

const IDLE_MS = 150;
const IDLE_LIMIT_MS = 3_000;

// Timeouts of up to a second still due, and animations with up to a second left (an exit a library waits out before it removes what it closed).
const pendingWork = (page: Page) =>
	page
		.evaluate(() => {
			const timers = (globalThis as { __markless_migrate_pending_timers__?: () => number }).__markless_migrate_pending_timers__?.() ?? 0;
			const left = (a: Animation) => Number(a.effect?.getComputedTiming().endTime ?? Infinity) - Number(a.currentTime ?? 0);
			const moving = document.getAnimations().filter((a) => a.playState === 'running' && a.timeline === document.timeline && left(a) <= 1000).length;
			return timers + moving;
		})
		.catch(() => 0);

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

// No request in flight, no timeout or animation of up to a second due for 150 ms (at most 3 s); a poll that came back late means the checker itself was held up, and what began meanwhile may not have been seen yet.
async function idle(page: Page, inflight: () => number): Promise<void> {
	const deadline = Date.now() + IDLE_LIMIT_MS;
	let idleSince = Date.now();
	let last = idleSince;
	while (Date.now() < deadline) {
		const busy = inflight() > 0 || (await pendingWork(page)) > 0;
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
	await page.evaluate(() => document.fonts?.ready).catch(() => {});
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
const PATIENCE = 6_000;

/** Uses the target as a visitor would; when the pointer cannot reach it, scrolls it to the middle, focuses it, hovers what holds it and dismisses what covers it, and names why when nothing does. */
async function reach(page: Page, target: Locator, act: (t: Locator, timeout: number) => Promise<unknown>, throughLabel = false, patience = QUICK): Promise<void> {
	let first: unknown;
	try {
		await act(target, patience);
		return;
	} catch (error) {
		first = error;
	}
	const tried: string[] = [];
	const retry = async (remedy: string, apply: () => Promise<unknown>): Promise<boolean> => {
		tried.push(remedy);
		await apply().catch(() => {});
		try {
			await act(target, patience);
			return true;
		} catch {
			return false;
		}
	};
	const look = async (): Promise<Diagnosis> => (await target.count().catch(() => 0)) ? await target.evaluate(diagnose, undefined, { timeout: QUICK }).catch(() => ({ kind: 'timeout', detail: 'it did not settle' }) as Diagnosis) : { kind: 'missing', detail: 'it is not on the page' };
	let found = await look();
	// A slow machine may not show it yet (a page still applying its styles names its controls differently): it gets the time to appear before it is called missing.
	if (found.kind === 'missing' || found.kind === 'disabled') {
		tried.push('waiting for it to appear');
		if (await target.waitFor({ state: 'visible', timeout: PATIENCE }).then(() => true, () => false)) {
			try {
				await act(target, patience);
				return;
			} catch {}
		}
		found = await look();
	}
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
// The widget a keyboard pattern journey uses, marked when its first step focuses it: a combobox named by its own value is renamed by the choice.
const WIDGET = 'data-markless-migrate-widget';

/** Whether focusing the control shows a tooltip that was not shown before; focus leaves it again either way. */
async function showsTooltip(page: Page, control: Locator): Promise<boolean> {
	const tip = page.getByRole('tooltip').filter({ visible: true });
	if (await tip.count().catch(() => 1)) return false;
	try {
		await control.focus({ timeout: QUICK });
		return await tip.first().waitFor({ state: 'visible', timeout: TOOLTIP_WAIT_MS }).then(() => true, () => false);
	} catch {
		return false;
	} finally {
		await control.evaluate((el) => (el as HTMLElement).blur(), undefined, { timeout: QUICK }).catch(() => {});
		await tip.first().waitFor({ state: 'hidden', timeout: QUICK }).catch(() => {});
	}
}

/** Where a step acts: a keyboard pattern step's marked widget, else its target by role and name. */
async function stepTarget(page: Page, step: Step): Promise<Locator> {
	const marked = page.locator(`[${WIDGET}]`).first();
	return (step.action === 'key' || step.action === 'outside') && (await marked.count().catch(() => 0)) ? marked : locate(page, step.target);
}

async function perform(page: Page, step: Step, patience = QUICK): Promise<void> {
	if (step.action === 'live') {
		const databases = sessionDatabases(page.context());
		for (let i = 0; i < step.updates; i++) if (!databases.some((db) => db.next(step.away))) throw new Error('the recording has no more updates');
		// The pushed frames reach the page asynchronously; the step's effect is read once they are all there.
		const sent = databases.reduce((n, db) => n + db.frames, 0);
		const until = Date.now() + LIVE_DELIVERY_MS;
		while (databaseFramesReceived(page) < sent && Date.now() < until) await sleep(10);
		return;
	}
	const target = await stepTarget(page, step);
	await target
		.evaluate((el, used) => {
			for (const other of document.querySelectorAll(`[${used}]`)) other.removeAttribute(used);
			el.setAttribute(used, '');
		}, USED, { timeout: QUICK })
		.catch(() => {});
	switch (step.action) {
		case 'click':
			return reach(page, target, (t, timeout) => t.click({ timeout }), true, patience);
		case 'press':
			await reach(page, target, (t, timeout) => t.focus({ timeout }), false, patience);
			return page.keyboard.press(step.key);
		case 'key': {
			if (step.focus) await reach(page, target, async (t, timeout) => {
				await t.evaluate((el, mark) => el.setAttribute(mark, ''), WIDGET, { timeout });
				if (!(await t.evaluate(focusEntry, undefined, { timeout }))) throw new Error('nothing in it takes focus');
			}, false, patience);
			if (step.key === 'Focus') return;
			if (step.key === 'Typeahead') {
				const letter = await page.evaluate(typeaheadLetter);
				return letter ? page.keyboard.press(letter) : undefined;
			}
			if (step.choose && (await page.evaluate(unsafeChoice, DESTRUCTIVE.source))) return page.keyboard.press('Escape');
			return page.keyboard.press(step.key);
		}
		case 'outside': {
			const point = await target.evaluate(outsidePoint, undefined, { timeout: patience }).catch(() => null);
			if (!point) throw new UnreachableError('missing', 'no point outside it and what it opened holds no control');
			return page.mouse.click(point.x, point.y);
		}
		case 'fill':
			return reach(page, target, (t, timeout) => t.fill(step.value, { timeout }), false, patience);
		case 'select':
			return reach(page, target, (t, timeout) => t.selectOption(step.value, { timeout }), false, patience);
		case 'submit':
			for (const field of step.fields) await reach(page, locate(page, field.target), (t, timeout) => (field.check ? t.check({ timeout }) : t.fill(field.value, { timeout })), false, patience);
			return reach(page, target, (t, timeout) => t.click({ timeout }), false, patience);
		case 'scroll':
			// The wheel brings the section to the top, as a reader scrolls, so what follows the scroll position (a contents list's current link) answers.
			return void (await reach(page, target, (t, timeout) => t.evaluate((el) => el.scrollIntoView({ block: 'start' }), undefined, { timeout }), false, patience));
		case 'hover':
			return reach(page, target, async (t, timeout) => {
				const box = await t.boundingBox({ timeout });
				if (!box) throw new Error('it has no box to point at');
				await page.mouse.move(box.x + box.width * step.at, box.y + box.height / 2, { steps: 4 });
			}, false, patience);
	}
}

/** A control that did not settle in time is tried once more with more patience, the same on both sides: a busy machine is not a different page. */
async function patiently(page: Page, step: Step, patience = QUICK): Promise<void> {
	try {
		await perform(page, step, patience);
	} catch (error) {
		if (!(error instanceof UnreachableError) || error.kind !== 'timeout' || patience >= PATIENCE) throw error;
		await perform(page, step, PATIENCE);
	}
}

export interface Session {
	readonly context: BrowserContext;
	readonly page: Page;
	/** `destructive`: the step uses a control that ends the session or deletes, so its dialogs are accepted and, when writes are held back, every request it makes to the app is held back too. */
	run(step: Step, destructive?: boolean, patience?: number): Promise<StepResult>;
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
	const here = (url: string) => (onOld(url) ? localUrl(url, oldHost!) : localUrl(routePath(url, env.routing), origin));
	let dialogs: string[] = [];
	let accepting = false;
	page.on('dialog', (dialog) => {
		dialogs.push(`${dialog.type()}: ${dialog.message()}`);
		(accepting ? dialog.accept() : dialog.dismiss()).catch(() => {});
	});
	let requests: Request[] = [];
	let errors: string[] = [];
	const pending = new Set<Request>();
	// Pages the framework fetched from the server (a router fragment, an RSC payload), prefetched ahead of a click included.
	const fetchedPages = new Set<string>();
	page.on('request', (request) => {
		pending.add(request);
		requests.push(request);
		const url = new URL(request.url());
		if (request.method() === 'GET' && hosts.some((o) => url.origin === o) && frameworkTransport(request, url)) fetchedPages.add(pagePath(url));
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
		if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(consoleErrorText(message.text(), hosts));
	});
	page.on('pageerror', (error) => errors.push(consoleErrorText(error.message, hosts)));
	await loadPage(page, new URL(route, origin).href);
	await quiet(page, inflight, navigations);
	const loadErrors = [...errors];
	const ambient = await ambientOnce(env.origin, route, page, hosts);
	// A motion recording holds the timeouts itself, across its film.
	const ownTimers = !options.loops;
	// Where a redirect landed is the http and auth checks' business; a step that stays there compares alike.
	const landing = here(page.url());
	const redirected = landing !== localUrl(new URL(route, origin).href, origin);
	const observe = async (act: () => Promise<void>, what: string, step: Step | undefined, destructive: boolean, reload: boolean): Promise<StepResult> => {
		const startPath = new URL(shownUrl(page)).pathname;
		const href = step?.target.role === 'link' ? await locate(page, step.target).getAttribute('href', { timeout: STEP_TIMEOUT }).catch(() => null) : null;
		const used = step && !reload && step.action !== 'scroll' && step.action !== 'live' ? await stepTarget(page, step) : undefined;
		// The control is brought into view first, so the frames before and after the step show what it answers with, not a scroll.
		if (used && (await used.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth; }, undefined, { timeout: QUICK }).catch(() => false))) {
			await used.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }), undefined, { timeout: QUICK }).catch(() => {});
			await quiet(page, inflight, navigations);
		}
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
		// What a surface shows where it is pointed at (a chart's tooltip) is inside its own box, so that box is not left out for a hover.
		const ownBox = async () => (used && step?.action !== 'hover' ? await used.boundingBox({ timeout: 500 }).catch(() => null) : null);
		const boxBefore = await ownBox();
		const frameBefore = reload ? undefined : await page.screenshot({ timeout: 10_000 }).catch(() => undefined);
		// However long reading the result takes on a slow machine, what the step set going for later has not happened yet on either side.
		const mark = await timerMark(page);
		if (ownTimers) await holdTimers(page, true);
		if (frameBefore) await page.evaluate(watchReaction).catch(() => {});
		try {
			await act();
		} catch (error) {
			failed = `${what} could not be used: ${(error as Error).message.split('\n')[0]}`;
			if (error instanceof UnreachableError) unreachable = error.kind;
		}
		await quiet(page, inflight, navigations);
		// A router swapping the page in place renders after its fetch has finished: the page is read once its DOM has held still.
		if (!documentLoaded && new URL(shownUrl(page)).pathname !== startPath) await domQuiet(page);
		log.holdAll = false;
		accepting = false;
		const widget = step && (step.action === 'key' || step.action === 'outside') ? await (await stepTarget(page, step)).evaluate(widgetState, undefined, { timeout: QUICK }).catch(() => ['the widget is gone']) : undefined;
		const after = await snapshot(page, hosts);
		const liveAfter = await page.evaluate(liveRegions).catch(() => [] as string[]);
		// Lines the page changes on its own while nothing is used (a demo toggling a class on a timer) are no step's doing.
		const own = (lines: string[]) => (documentLoaded || !ambient.lines.length ? lines : lines.filter((l) => !ambient.lines.includes(l)));
		const diff = multisetDiff(before, after);
		const added = own(diff.added);
		const removed = own(diff.removed);
		const moved = documentLoaded && !reload ? [] : movedLines(before, after);
		const writes = log.writes.slice(writesBefore);
		const writeOf = new Map(writes.map((w) => [w.request, w.line]));
		const state = stateChange(stateBefore, await readState(page, signedIn));
		const stayed = !documentLoaded && new URL(shownUrl(page)).pathname === startPath;
		let reaction: Reaction | undefined;
		if (frameBefore && !documentLoaded && !stayed) {
			// A router that swapped the page in place: what morphed on the way is compared, the rest is the new page's own.
			const read = await page.evaluate(readReaction).catch(() => undefined);
			if (read) reaction = { regions: [], changes: [], ...(read.transitions.length ? { transitions: read.transitions } : {}), ...(read.views ? { views: read.views } : {}) };
		}
		if (frameBefore && stayed) {
			const read = await page.evaluate(readReaction).catch(() => undefined);
			const frameAfter = await page.screenshot({ timeout: 10_000 }).catch(() => undefined);
			const boxAfter = await ownBox();
			// What the page changes on its own (an autoplaying carousel, a ticking counter) is no step's answer.
			// Where those widgets sit now is left out too: what moves on its own changes different pixels every second.
			const own = read ? read.changes.filter((c) => ambient.changes.includes(c)).flatMap((c) => (read.boxes[c] ? [read.boxes[c]!] : [])) : [];
			if (read && frameAfter) reaction = { regions: read.scrolled ? [] : changedRegions(frameBefore, frameAfter, [boxBefore, boxAfter, ...ambient.regions, ...own].filter((b): b is Box => Boolean(b))), changes: read.changes.filter((c) => !ambient.changes.includes(c)), ...(read.scrolled ? { scrolled: true } : {}), ...(read.answeredMs !== undefined ? { answeredMs: read.answeredMs } : {}), ...(read.shift.score || read.shift.x || read.shift.y ? { shift: read.shift } : {}), ...(read.transitions.length ? { transitions: read.transitions } : {}), ...(read.views ? { views: read.views } : {}) };
		}
		const done: StepResult = {
			url: redirected && here(page.url()) === landing ? 'the page the route redirected to' : here(page.url()),
			navigated: reload ? new URL(shownUrl(page)).pathname !== startPath : documentLoaded || new URL(shownUrl(page)).pathname !== startPath || (href !== null && linkUrl(href, page.url(), page).href === shownUrl(page)),
			...(reload ? { reloaded: true } : {}),
			...(documentLoaded ? { loaded: true } : {}),
			added,
			removed,
			...(moved.length ? { moved } : {}),
			requests: requests.flatMap((r) => {
				const line = writeOf.get(r) ?? appRequest(r, hosts);
				return line ? [line] : [];
			}),
			...(!documentLoaded && fetchedPages.has(pagePath(new URL(page.url()))) ? { paged: true } : {}),
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
			...(reaction ? { reaction } : {}),
			...(widget ? { widget } : {}),
		};
		// The 1 to 3 s timeouts the step set (a "Copied" label's reset) run once its result is read, and are waited out before the next step.
		if (ownTimers) {
			await holdTimers(page, false);
			await timersOut(page, mark);
		}
		return done;
	};
	return {
		context,
		page,
		loadErrors,
		run: (step, destructive = false, patience = QUICK) => observe(() => patiently(page, step, patience), describeTarget(step.target), step, destructive, false),
		cycle(steps, act) {
			const use = (step: Step) => observe(() => patiently(page, step), describeTarget(step.target), step, false, false);
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
	const session = await openSession(browser, env, journey.start ?? route, viewport);
	try {
		const results: StepResult[] = [];
		for (const [i, step] of journey.steps.entries()) {
			const result = await session.run(step, Boolean(journey.destructive) && i === journey.steps.length - 1, journey.patience);
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
	/** How many steps deep exploring goes (a control revealed by the 4th click is used by a 5th step); default 4. */
	readonly maxDepth?: number;
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
	/** Another page of the app with a link that brings a visitor to this route in place (the router swaps the page, no document loads): the journeys run again arriving that way. */
	readonly arrival?: { readonly entry: string; readonly link: Target };
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
	/** Alike controls this journey uses one after another, after the steps that reveal them: each counts as exercised by its own step. */
	readonly batch?: readonly Tracked[];
	/** The members of `batch` that already left the page in an earlier turn of it. */
	readonly left?: readonly Tracked[];
	/** The widget whose WAI-ARIA keyboard journey this is. */
	readonly keys?: KeyedWidget;
}

/** A widget given pattern journeys: how many of them ran on the old page, and why the rest did not. */
interface KeyedWidget {
	readonly widget: PatternWidget;
	readonly element: string;
	readonly signature: string;
	readonly journeys: string[];
	reason?: string;
}

const PATTERN_ROLES = new Set(['combobox', 'button', 'summary', 'slider']);

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
	let budget = options.budgetMs ?? DEFAULT_JOURNEY_BUDGET_MS;
	const cap = options.maxJourneys ?? Number.POSITIVE_INFINITY;
	const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
	const tracked: Tracked[] = [];
	const known = new Set<string>();
	const journeys: RecordedJourney[] = [];
	const later: Item[] = [];
	let formSteps: Step[] = [];
	const deferred: { journey: Journey; signature: string }[] = [];
	const sequences: Item[] = [];
	const keyed: KeyedWidget[] = [];
	const keyedKinds = new Map<string, number>();
	const keyedSkipped = { alike: 0, over: 0 };
	const loadComposites = new Set<string>();
	/** The widgets among `found` and the composite widgets shown that follow a WAI-ARIA keyboard pattern, in page order (composites shown at load are left out after a step). */
	const findWidgets = async (page: Page, found: readonly { readonly candidate: Candidate; readonly shared?: string }[], atLoad: boolean): Promise<PatternWidget[]> => {
		const widgets: PatternWidget[] = [];
		let probes = 0;
		for (const t of found) {
			const c = t.candidate;
			if (t.shared || c.covered || c.skip || c.destructive) continue;
			const kind = (pattern: string) => `${c.region}|${pattern}|${c.kind?.split('|').at(-1) ?? ''}`;
			const pattern = PATTERN_ROLES.has(c.target.role) ? await locate(page, c.target).evaluate(controlPattern, undefined, { timeout: QUICK }).catch(() => null) : null;
			if (pattern) widgets.push({ pattern, target: c.target, kind: kind(pattern) });
			else if (atLoad && (c.target.role === 'button' || c.target.role === 'link') && !LAYOUT.has(c.region) && probes++ < TOOLTIP_PROBES && (await showsTooltip(page, locate(page, c.target)))) widgets.push({ pattern: 'tooltip', target: c.target, kind: kind('tooltip') });
		}
		for (const w of await compositeWidgets(page, snapshotName, STEP_TIMEOUT)) {
			const key = `${w.target.role}|${w.target.name}|${w.target.nth}`;
			if (atLoad) loadComposites.add(key);
			else if (loadComposites.has(key)) continue;
			if (LAYOUT.has(w.region)) continue;
			widgets.push({ pattern: w.pattern, target: w.target, kind: `${w.region}|${w.pattern}|${w.slot}`, vertical: w.vertical });
		}
		return widgets;
	};
	/** Pattern journeys for the first few widgets of each kind, at most MAX_PATTERN_WIDGETS a route; called in a fixed order, so which widgets run never depends on timing. */
	const keyItems = (widgets: readonly PatternWidget[], prefix: readonly Step[], depth: number): Item[] => {
		const items: Item[] = [];
		for (const widget of widgets) {
			const seen = keyedKinds.get(widget.kind) ?? 0;
			keyedKinds.set(widget.kind, seen + 1);
			if (seen >= PATTERN_SAMPLES) {
				keyedSkipped.alike++;
				continue;
			}
			if (keyed.length >= MAX_PATTERN_WIDGETS) {
				keyedSkipped.over++;
				continue;
			}
			const element = `${widget.pattern} keyboard pattern of ${describeTarget(widget.target)}${prefix.length ? ` (after ${prefix.map(describeStep).join(', then ')})` : ''}`;
			const k: KeyedWidget = { widget, element, signature: `keys|${prefix.map(describeStep).join('>')}|${widget.target.role}|${widget.target.name}|${widget.target.nth}`, journeys: [] };
			keyed.push(k);
			for (const journey of patternJourneys(widget, prefix, describeTarget)) items.push({ journey, depth, expand: false, keys: k });
		}
		return items;
	};

	const sampled = new Map<string, number>();
	const batched = new Map<string, Tracked[]>();
	/** Items that use each control of an alike group in turn, in one session, for the groups `track` gathered since the last call. */
	const alikeTurn = (usable: Tracked[], depth: number): Item => {
		const steps = [...usable[0]!.prefix, ...usable.map((t) => primaryStep(t.candidate)!)];
		const name = usable.length === 1 ? describeStep(primaryStep(usable[0]!.candidate)!) : `${describeStep(primaryStep(usable[0]!.candidate)!).replace(/ #\d+$/, '')} and ${usable.length - 1} more alike, each in turn (${usable.map((t) => `#${t.candidate.target.nth + 1}`).join(', ')})`;
		return { journey: { name, steps }, depth, expand: false, batch: usable };
	};
	const batches = (depth: number): Item[] => {
		const out: Item[] = [];
		for (const [key, members] of batched) {
			batched.delete(key);
			// Last on the page first: using one (a thread's "[-]" renaming itself and hiding the replies after it) cannot move or hide those still to come.
			const usable = members.filter((t) => !t.shared && !t.by && !t.reason && primaryStep(t.candidate)).sort((a, b) => b.candidate.target.nth - a.candidate.target.nth);
			if (!usable.length) continue;
			out.push(alikeTurn(usable, depth));
		}
		return out;
	};
	const track = (found: readonly Candidate[], prefix: readonly Step[], parent: Tracked | undefined): Tracked[] => {
		const fresh: Tracked[] = [];
		for (const raw of found) {
			const id = `${raw.target.role}|${raw.target.name}|${raw.target.nth}`;
			if (known.has(id)) continue;
			known.add(id);
			const layout = parent ? parent.layout : isLayout(raw);
			// Layout controls are spread over the routes that share them (each has one owner), so they are not sampled; the items of a long
			// list one of them opens (a search palette's 450 options) still are, since the list answers them all through one handler.
			const group = layout && !raw.group?.includes('|list ') ? undefined : raw.group;
			const seen = group ? (sampled.get(group) ?? 0) : 0;
			if (group) sampled.set(group, seen + 1);
			const repeat = Boolean(group?.startsWith('repeat|')) && seen >= SAMPLES;
			if (group && seen >= SAMPLES && !repeat) continue;
			const c = raw;
			const signature = parent ? `${parent.signature} > ${c.target.role}|${c.target.name}|${c.target.nth}` : c.signature;
			const element = `${describeTarget(c.target)}${prefix.length ? ` (after ${prefix.map(describeStep).join(', then ')})` : ''}`;
			const t: Tracked = { candidate: c, element, signature, layout, prefix, journeys: [] };
			const owner = layout ? options.owner?.(signature) : undefined;
			if (owner && owner !== route) t.shared = owner;
			else if (c.covered) t.by = c.covered;
			else if (c.skip) t.reason = c.skip;
			tracked.push(t);
			// Alike in kind, but each shows its own result (each demo's View Code its own source): used one after another in one page, each step compared.
			if (repeat) batched.set(`${group}|${prefix.map(describeStep).join('>')}`, [...(batched.get(`${group}|${prefix.map(describeStep).join('>')}`) ?? []), t]);
			else fresh.push(t);
		}
		return fresh;
	};
	const itemsFor = (elements: readonly Tracked[], depth: number): { primary: Item[]; keyboard: Item[] } => {
		const primary: Item[] = [];
		const keyboard: Item[] = [];
		// A page's own widgets before links to other pages, at the same importance: a link's address is compared by the rendered check already.
		const linkLast = (t: Tracked) => (t.candidate.target.role === 'link' ? 1 : 0);
		for (const t of [...elements].sort((a, b) => b.candidate.importance - a.candidate.importance || linkLast(a) - linkLast(b))) {
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
	let entries: string[] = [];
	try {
		const found = await candidates(start.page, host);
		const here = new URL(route, origin);
		// Another page the new app serves, else this page again by a link to it (an in-place navigation), else any page of the app.
		const rank = (c: Candidate) => {
			if (c.target.role !== 'link' || !c.href || c.covered || c.destructive || /^javascript:/i.test(c.href)) return 0;
			const to = linkUrl(c.href, here.href, start.page);
			if (to.origin !== host) return 0;
			if (to.pathname === here.pathname) return to.hash ? 0 : 2;
			return options.serves?.(to.pathname) ? 3 : 1;
		};
		const links = found.map((c) => ({ c, rank: rank(c) * 2 + (isLayout(c) ? 1 : 0) })).filter((l) => l.rank > 1);
		navLink = links.sort((a, b) => b.rank - a.rank)[0]?.c.target;
		entries = [...new Set(found.flatMap((c) => {
			if (c.target.role !== 'link' || !c.href || c.covered || c.destructive || /^javascript:/i.test(c.href)) return [];
			const to = linkUrl(c.href, here.href, start.page);
			return to.origin === host && to.pathname !== here.pathname ? [to.pathname + to.search] : [];
		}))]
			// A sibling page first (the same component under another library links straight back), then the rest in page order.
			.map((path, i) => ({ path, i, shared: path.split('/').filter((part, k) => part && part === here.pathname.split('/')[k]).length }))
			.sort((a, b) => b.shared - a.shared || a.i - b.i)
			.map((e) => e.path)
			.slice(0, ARRIVAL_ENTRIES);
		const first = itemsFor(track(found, [], undefined), 1);
		formSteps = await forms(start.page, host, found);
		const keys = keyItems(await findWidgets(start.page, tracked.filter((t) => !t.prefix.length), true), [], 1);
		// A page with many controls gets the time they take, so the default budget does not leave its own controls unused; exploring ends sooner when its journeys run out.
		if (options.budgetMs === undefined) budget = Math.min(MAX_ADAPTIVE_BUDGET_MS, Math.max(DEFAULT_JOURNEY_BUDGET_MS, found.length * BUDGET_PER_CONTROL_MS) + keys.length * PATTERN_BUDGET_MS);
		// The keyboard patterns of the page's widgets run first: they are few, and a page whose other controls spend the budget must not leave them out.
		wave = [...keys, ...first.primary, ...batches(1), ...formSteps.map((step): Item => ({ journey: { name: describeStep(step), steps: [step] }, depth: 1, expand: false }))];
		later.push(...first.keyboard);
		// A contents list of this page's sections: the page is scrolled to each section in turn, and what marks the current one is compared.
		// A surface that answers the pointer moving over it (a chart showing a tooltip and its active point) is pointed at across its width.
		for (const structure of await start.page.evaluate(hoverSurfaces).catch(() => [] as Structure[])) {
			const target: Target = { role: 'surface', name: '', nth: 0, structure };
			const steps = HOVER_POINTS.map((at): Step => ({ action: 'hover', target, at }));
			wave.push({ journey: { name: `move the pointer across ${describeTarget(target)}`, steps }, depth: 1, expand: false });
		}
		const sections = await start.page.evaluate(contentsSections).catch(() => [] as string[]);
		if (sections.length >= 2) {
			const steps = sections.map((id): Step => ({ action: 'scroll', target: { role: SECTION, name: id, nth: 0 } }));
			wave.push({ journey: { name: `scroll through the ${sections.length} sections the page's contents list names`, steps }, depth: 1, expand: false });
		}
		const live = liveSteps(updateCount(env.replay?.live));
		if (live.length) {
			const count = updateCount(env.replay?.live);
			wave.push({ journey: { name: `receive the ${count} updates the old page heard from its database while it was open, then reload`, steps: live, cycle: ['reload'] }, depth: 1, expand: false });
			wave.push({ journey: { name: `come back after the ${count} updates arrived while the page was not listening`, steps: [{ action: 'live', target: { role: LIVE, name: '', nth: 0 }, updates: count, away: true }], cycle: ['reload'] }, depth: 1, expand: false });
		}
	} finally {
		await start.close();
	}

	// A page this one links to that links back: following that link must bring the route in place, or arriving that way is no different from a fresh load.
	let arrival: { entry: string; link: Target } | undefined;
	for (const entry of entries) {
		if (arrival || outOfBudget()) break;
		const back = await openSession(browser, env, entry, viewport).catch(() => undefined);
		if (!back) continue;
		try {
			const here = new URL(route, origin);
			const link = (await candidates(back.page, host)).find((c) => c.target.role === 'link' && c.href && !c.destructive && linkUrl(c.href, back.page.url(), back.page).pathname === here.pathname && !linkUrl(c.href, back.page.url(), back.page).hash)?.target;
			if (!link) continue;
			const went = await back.run({ action: 'click', target: link });
			if (!went.failed && !went.loaded && new URL(shownUrl(back.page)).pathname === here.pathname) arrival = { entry, link };
		} finally {
			await back.close();
		}
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
				const result = await session.run(step, false, item.journey.patience);
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
			const stayed = done && new URL(shownUrl(page)).pathname === new URL(route, origin).pathname && !last.navigated;
			// The control just used, renamed by its use ("currently light mode"), is the same control, not one it revealed.
			const renamed = item.expand && stayed ? await retarget(page, item.journey.steps.at(-1)!.target) : undefined;
			const revealed = item.expand && stayed ? (await candidates(page, host)).filter((c) => !renamed || !sameTarget(c.target, renamed)) : [];
			const steps = item.journey.steps;
			const step = steps.at(-1)!;
			const expanded = stayed && step.action === 'click' && (await locate(page, step.target).getAttribute('aria-expanded', { timeout: 500 }).catch(() => null)) === 'true';
			// What a control opened (a date picker's calendar, a dialog's tabs) gets its keyboard patterns too, after the steps that open it.
			const opener = item.expand && stayed && (expanded || opened.length > 0) && item.depth < maxDepth;
			const widgets = opener ? await findWidgets(page, revealed.filter((c) => !known.has(`${c.target.role}|${c.target.name}|${c.target.nth}`)).map((candidate) => ({ candidate })), false) : [];
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
			return { item: { ...item, journey }, expected, done, failed: last.failed, unreachable: last.unreachable, revealed, expanded, sequences, widgets, empty: !item.discover && Boolean(item.journey.cycle) && !journey.cycle?.length };
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
		for (const item of wave.slice(room)) {
			if (item.element) item.element.reason = `out of the journey budget (${options.maxJourneys} journeys)`;
			if (item.keys) item.keys.reason = `out of the journey budget (${options.maxJourneys} journeys)`;
		}
		// A control that changed the page's mode or what it stores is used again straight after, before deeper controls can spend the budget.
		const results = await pool(runnable, CONCURRENCY, async (item) => {
			if (outOfBudget()) return undefined;
			let r = await runItem(item);
			// A control that did not settle in time on the old page is tried once more with more patience, which every replay then gets too.
			if (!r.done && r.unreachable === 'timeout' && !item.journey.patience && !outOfBudget()) {
				const patient = await runItem({ ...item, journey: { ...item.journey, patience: PATIENCE } });
				if (patient.done) r = patient;
			}
			const urgent: { item: Item; r: Ran | undefined }[] = [];
			for (const s of r.sequences) if ((s.rank ?? 0) >= URGENT) urgent.push({ item: s, r: outOfBudget() ? undefined : await runItem(s) });
			return { ...r, urgent };
		});
		const next: Item[] = [];
		for (const [i, r] of results.entries()) {
			const item = r?.item ?? runnable[i]!;
			if (!r) {
				if (item.element) item.element.reason = budgetReason(budget, options.maxJourneys);
				if (item.keys) item.keys.reason = budgetReason(budget, options.maxJourneys);
				continue;
			}
			journeys.push({ ...item.journey, expected: r.expected });
			item.keys?.journeys.push(item.journey.name);
			next.push(...keyItems(r.widgets, item.journey.steps, depth + 1));
			sequences.push(...r.sequences.filter((s) => (s.rank ?? 0) < URGENT));
			const batch = item.batch ?? [];
			// A member that left the page (a signed-out "hide" sending the visitor to log in) ends the turn: the rest start again from the
			// page, and once two of them have left it the same way, those two stand for the rest, as the first few of a grid do.
			const left = batch.findIndex((t, k) => r.expected[t.prefix.length + k]?.navigated);
			const leavers = left === -1 ? (item.left ?? []) : [...(item.left ?? []), batch[left]!];
			const again: Tracked[] = [];
			for (const [k, t] of batch.entries()) {
				const step = r.expected[t.prefix.length + k];
				if (step && !step.failed && (left === -1 || k <= left)) t.by = item.journey.name;
				else if (left !== -1 && k > left && leavers.length >= SAMPLES) t.by = `alike: ${leavers.map((x) => describeTarget(x.candidate.target)).join(' and ')} each left the page`;
				else if (left !== -1 && k > left) again.push(t);
				else t.reason = `it could not be used on the old page: ${step?.failed ?? 'the journey stopped before it'}`;
			}
			if (again.length) next.push({ ...alikeTurn(again, depth), left: leavers });
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
			if (depth >= maxDepth) {
				for (const t of fresh) if (!t.shared && !t.by && !t.reason) t.reason = `it appears only after ${maxDepth} steps, deeper than check explores: raise --journey-depth`;
				continue;
			}
			const items = itemsFor(fresh, depth + 1);
			next.push(...items.primary, ...batches(depth + 1));
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
	for (const k of keyed) elements.push({ element: k.element, signature: k.signature, layout: false, ...(k.reason ? { reason: `its keyboard journeys were left out: ${k.reason}` } : { by: `its ${k.widget.pattern} keyboard journeys`, journeys: k.journeys }) });
	if (keyedSkipped.alike) elements.push({ element: `${keyedSkipped.alike} more widget${keyedSkipped.alike === 1 ? '' : 's'} with a keyboard pattern, alike`, signature: 'keys|alike', layout: false, by: `alike: the first ${PATTERN_SAMPLES} of each kind run the keyboard journeys` });
	if (keyedSkipped.over) elements.push({ element: `${keyedSkipped.over} more widget${keyedSkipped.over === 1 ? '' : 's'} with a keyboard pattern`, signature: 'keys|over', layout: false, by: `the first ${MAX_PATTERN_WIDGETS} widgets with a keyboard pattern run the keyboard journeys, in page order` });
	for (const [group, n] of sampled) {
		if (n <= SAMPLES) continue;
		if (group.startsWith('repeat|')) continue;
		const [role, where] = group.split('|') as [string, string];
		const of = role === 'link' ? (group.endsWith('|here') ? `in ${where || 'the page'} to this page` : `in ${where || 'the page'} to other pages`) : where.startsWith('list ') ? 'of the same list' : `of the same ${role === 'treeitem' ? 'tree' : 'grid'}`;
		elements.push({ element: `${n - SAMPLES} more ${role}${n - SAMPLES === 1 ? '' : 's'} ${of}`, signature: `sampled|${group}`, layout: false, by: `alike: the first ${SAMPLES} are exercised${role === 'link' ? ', and every address is compared by the rendered check' : ''}` });
	}
	return { journeys, elements, skipped, sequencesSkipped, deferred, ...(arrival ? { arrival } : {}) };
}

function budgetReason(budgetMs: number, maxJourneys: number | undefined): string {
	return `out of the journey budget (${Math.round(budgetMs / 1000)} s${maxJourneys !== undefined ? ` or ${maxJourneys} journeys` : ''}): raise --journey-budget${maxJourneys !== undefined ? ' or --max-journeys' : ''}`;
}

const sameTarget = (a: Target, b: Target) => a.role === b.role && a.name === b.name && a.nth === b.nth;
const sameSteps = (a: readonly Step[], b: readonly Step[]) => a.length === b.length && a.every((s, i) => s.action === b[i]!.action && sameTarget(s.target, b[i]!.target));

/** The initial interactive elements of the OLD page, to decide which route of a run exercises each shared layout control. */
/** A page's layout controls by signature, and how many controls of its own it has to exercise. */
export async function survey(browser: Browser, env: SideEnv, route: string, viewport: Viewport): Promise<{ layout: string[]; own: number }> {
	const session = await openSession(browser, env, route, viewport);
	try {
		const found = await candidates(session.page, new URL(env.origin).origin);
		const sampled = new Map<string, number>();
		const exercised = found.filter((c) => {
			if (c.covered || c.skip || isLayout(c)) return false;
			if (!c.group) return true;
			sampled.set(c.group, (sampled.get(c.group) ?? 0) + 1);
			return sampled.get(c.group)! <= SAMPLES;
		});
		return { layout: found.filter(isLayout).map((c) => c.signature), own: exercised.length };
	} finally {
		await session.close();
	}
}

function stable(values: readonly string[]): (value: string) => boolean {
	return template(values[0]!, ...values.slice(1)).test;
}

const near = (a: Box, b: Box, pad = 16) => a.x - pad < b.x + b.width && b.x - pad < a.x + a.width && a.y - pad < b.y + b.height && b.y - pad < a.y + a.height;
// The same answer elsewhere in the view (text above it wrapped differently, a page laid out right to left) is a region of about its size: where it sits is the visual check's.
const alike = (a: Box, b: Box) => near(a, b) || Math.min(a.width * a.height, b.width * b.height) / Math.max(a.width * a.height, b.width * b.height) >= 0.25;
const boxAt = (b: Box) => `(${b.x}, ${b.y}) ${b.width}x${b.height}`;

/** How every old run of a step answered that the new run did not: widget changes each old run made, and regions of the view each old run changed that the new page left as they were. */
export function missingReaction(olds: readonly StepResult[], next: StepResult): { changes: string[]; regions: Box[] } {
	const reactions = olds.map((o) => o.reaction);
	const mine = next.reaction;
	if (!mine || !reactions.length || reactions.some((r) => !r)) return { changes: [], regions: [] };
	const [first, ...rest] = reactions as Reaction[];
	const changes = first!.changes.filter((c) => rest.every((r) => r.changes.includes(c)) && !mine.changes.includes(c));
	if (first!.scrolled && rest.every((r) => r.scrolled) && !mine.scrolled) changes.push('the page scrolled');
	const framed = !first!.scrolled && rest.every((r) => !r.scrolled) && !mine.scrolled;
	const regions = framed ? first!.regions.filter((box) => rest.every((r) => r.regions.some((o) => alike(o, box))) && !mine.regions.some((o) => alike(o, box))) : [];
	return { changes, regions };
}

/** Failures that are a slower answer alone, with the journey and step to time again one side at a time before they stand. */
export const timedOnly = new WeakMap<Failure, { readonly journey: number; readonly step: number }>();

const SHIFT_PX = 4;
const SHIFT_SCORE = 0.02;
// Measured on a 2-core runner: identical pages differ by up to about 90 ms from input to first change.
const SLOWER_MS = 100;
const SLOWER_RATIO = 1.5;

/** What starts moving on the new page while its router swaps the page in place, that no old run moved: content morphing from the previous page's look. */
export function morphs(olds: readonly StepResult[], next: StepResult): string[] {
	const seen = new Set(olds.flatMap((o) => o.reaction?.transitions ?? []));
	return (next.reaction?.transitions ?? []).filter((t) => !seen.has(t));
}

/** The new page shifts its layout during a step where every old run held still, or by more: a jump a visitor sees (scroll-lock padding released at the wrong moment). */
export function extraShift(olds: readonly StepResult[], next: StepResult): string | undefined {
	if (!next.reaction || olds.some((o) => !o.reaction)) return undefined;
	const most = (pick: (s: NonNullable<Reaction['shift']>) => number) => Math.max(0, ...olds.map((o) => (o.reaction!.shift ? pick(o.reaction!.shift) : 0)));
	const n = next.reaction.shift ?? { score: 0, x: 0, y: 0 };
	const [x, y, score] = [most((s) => s.x), most((s) => s.y), most((s) => s.score)];
	if (n.x <= x + SHIFT_PX && n.y <= y + SHIFT_PX && n.score <= score + SHIFT_SCORE) return undefined;
	return `old: a large part of the page moves at most ${x} px sideways and ${y} px up or down (layout shift ${score}); new: ${n.x} px sideways and ${n.y} px up or down (layout shift ${n.score})`;
}

// A placeholder shown for under a tenth of a second is a flicker at most; one shown longer is a view the visitor reads.
const INTERIM_MS = 100;

/** The new page shows views between the step and its result (a loading placeholder, the content gone and back) that no old run showed. How long a placeholder both show stays up follows the server's speed: that is the responsiveness check's. */
export function interimViews(olds: readonly StepResult[], next: StepResult): string | undefined {
	const mine = next.reaction?.views;
	if (!mine || olds.some((o) => !o.reaction?.views)) return undefined;
	const seen = new Set(olds.flatMap((o) => o.reaction!.views!.interim));
	if (mine.interimMs < INTERIM_MS || mine.interim.every((v) => seen.has(v))) return undefined;
	return `old: ${viewsLine(olds[0]!.reaction!.views!)}; new: ${viewsLine(mine)}`;
}

const viewsLine = (v: Views) => (v.swaps <= 1 ? 'goes straight to the result' : `shows ${v.swaps - 1} view${v.swaps > 2 ? 's' : ''} in between for ${v.interimMs} ms (${v.interim.map((t) => `"${t}"`).join(', ')}) before the result`);

/** The new page takes meaningfully longer than every old run to show its first change after a step. */
export function slowerAnswer(olds: readonly StepResult[], next: StepResult): string | undefined {
	// A step that asks the server first is as fast as the server; how fast each side's server answers is the responsiveness check's, on a fair network.
	if ([...olds, next].some((r) => r.requests.length || r.writes?.length)) return undefined;
	const times = olds.map((o) => o.reaction?.answeredMs);
	const mine = next.reaction?.answeredMs;
	if (mine === undefined || times.some((t) => t === undefined)) return undefined;
	const old = Math.max(...(times as number[]));
	if (mine - old <= SLOWER_MS || mine <= old * SLOWER_RATIO) return undefined;
	return `the old page changes ${old} ms after the step; the new page ${mine} ms after it`;
}

function answered(r: StepResult, missing: { changes: string[]; regions: Box[] }, old: boolean): string {
	if (old) return `answers with: ${[...missing.changes, ...missing.regions.map((b) => `the view changes at ${boxAt(b)}`)].join(' | ')}`;
	const changes = r.reaction?.changes.length ? r.reaction.changes.join(' | ') : 'no widget changes';
	const view = missing.regions.length ? `the view does not change at ${missing.regions.map(boxAt).join(', ')}${r.reaction?.regions.length ? ` (it changes at ${r.reaction.regions.slice(0, 3).map(boxAt).join(', ')})` : ''}` : '';
	return `answers with: ${[changes, view].filter(Boolean).join('; ')}`;
}

// A step that swaps most of the page lists thousands of lines; the first ones show what happened, and a run's report stays a size it can write.
const LISTED = 80;
const listed = (lines: readonly string[]) => `${lines.slice(0, LISTED).join(' | ')}${lines.length > LISTED ? ` | … and ${lines.length - LISTED} more lines` : ''}`;

function format(result: StepResult, parts: readonly string[], missing?: { changes: string[]; regions: Box[] }, old = false): string {
	const out: string[] = [];
	if (parts.includes('failed') && result.failed) out.push(result.failed);
	if (parts.includes('url')) out.push(`URL ${result.url}`);
	if (parts.includes('added')) out.push(`appears: ${listed(result.added) || '(nothing)'}`);
	if (parts.includes('removed')) out.push(`disappears: ${listed(result.removed) || '(nothing)'}`);
	if (parts.includes('moved')) out.push(`moves: ${listed(result.moved ?? []) || '(nothing)'}`);
	if (parts.includes('requests')) out.push(`requests: ${result.requests.join(', ') || '(none)'}`);
	if (parts.includes('errors')) out.push(`console errors: ${result.errors.join(' | ') || '(none)'}`);
	if (parts.includes('announcements')) out.push(`announced: ${result.announcements.join(' | ') || '(nothing)'}`);
	if (parts.includes('focus')) out.push(`focus on ${result.focus}`);
	if (parts.includes('widget')) out.push(`widget: ${result.widget?.join(' | ') || '(not read)'}`);
	if (parts.includes('state')) out.push(`changed: ${result.state?.join(' | ') || '(nothing)'}`);
	if (parts.includes('storage')) out.push(`kept in the browser: ${result.storage?.join(', ') || '(no change)'}`);
	if (parts.includes('dialogs')) out.push(`dialogs: ${result.dialogs?.join(' | ') || '(none)'}`);
	if (parts.includes('reaction') && missing) out.push(answered(result, missing, old));
	const shifted = result.reaction?.shift;
	if (parts.includes('shift')) out.push(`layout: ${shifted ? `a large part of the page moves ${shifted.x} px sideways and ${shifted.y} px up or down (layout shift ${shifted.score})` : 'nothing moves'}`);
	if (parts.includes('answer time')) out.push(`first change ${result.reaction?.answeredMs ?? '?'} ms after the step`);
	if (parts.includes('in between') && result.reaction?.views) out.push(`on screen until the result: ${viewsLine(result.reaction.views)}`);
	if (parts.includes('morph')) out.push(`moves while the page changes: ${result.reaction?.transitions?.slice(0, 8).join(' | ') || '(nothing)'}`);
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
export function cycleLabel(steps: number, acts: readonly CycleAct[], i: number): string {
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


/** What a step added and removed, compared without a clock's reading: a clock that only ticked (the same line gone and back) is no change. */
export function untick(r: Pick<StepResult, 'added' | 'removed'>): { added: string[]; removed: string[] } {
	const read = clockLine;
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

const EXPANDED = / \[expanded\]/;

/**
 * A button the new page marks aria-expanded when it opens or closes what it controls, where the old page set no state on it:
 * WAI-ARIA asks a disclosure or menu button for that state, so the step is compared without it and the addition is listed.
 */
export function ariaImprovements(olds: readonly StepResult[], next: StepResult): { step: StepResult; notes: string[] } {
	const notes: string[] = [];
	let added = [...next.added];
	let removed = [...next.removed];
	const mentions = (r: StepResult, name: string) => [...r.added, ...r.removed].some((l) => l.includes(`button "${name}"`));
	const opened = olds.every((o) => o.added.length || o.removed.length);
	for (const line of next.added.concat(next.removed)) {
		if (!EXPANDED.test(line) || !/^- button "/.test(line)) continue;
		const plain = line.replace(EXPANDED, '');
		const name = /^- button "((?:[^"\\]|\\.)*)"/.exec(line)?.[1] ?? '';
		const opening = added.includes(line) && removed.includes(plain);
		const closing = removed.includes(line) && added.includes(plain);
		if (!(opening || closing) || !opened || olds.some((o) => mentions(o, name))) continue;
		added = added.filter((l) => l !== (opening ? line : plain));
		removed = removed.filter((l) => l !== (opening ? plain : line));
		notes.push(`button "${name}" sets aria-expanded when it ${opening ? 'opens' : 'closes'} what it controls; the old page sets no state on it (WAI-ARIA disclosure or menu button)`);
	}
	// Focus on that button is the same focus, with or without its new state.
	const named = notes.map((n) => /^button "((?:[^"\\]|\\.)*)"/.exec(n)?.[1]);
	const focus = EXPANDED.test(next.focus) && named.some((name) => next.focus.startsWith(`button "${name}"`)) && olds.every((o) => o.focus === next.focus.replace(EXPANDED, '')) ? next.focus.replace(EXPANDED, '') : next.focus;
	return { step: notes.length ? { ...next, added, removed, focus } : next, notes };
}

export function compareJourneys(route: string, olds: readonly Run[], journeys: readonly Journey[], next: Run, owner?: StorageOwner, doorErrors?: ReadonlyMap<string, readonly string[]>, improvements: string[] = []): Failure[] {
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
			// An old run that could not repeat the step is left out; the step is compared with those that did, never skipped while one did.
			const oldSteps = runs.map((r) => mine(r[k])).filter((s): s is StepResult => Boolean(s && !s.failed));
			if (!oldSteps.length) break;
			const [a, ...rest] = oldSteps as StepResult[];
			const raw = mine(actual[k]);
			const improved = raw && !raw.failed ? ariaImprovements(oldSteps, raw) : undefined;
			for (const note of improved?.notes ?? []) if (!improvements.includes(note)) improvements.push(note);
			const n = improved?.step ?? raw;
			// A page the front door serves from the old app keeps its state on the old app's origin.
			if ((following || navigatedAway) && n?.door) break;
			const dimension: Dimension = step.action === 'press' || journey.pattern ? 'a11y' : 'behaviour';
			const named = journey.steps.length > 1 && k <= last ? `${journey.name} (step ${k + 1}${journey.pattern ? `: ${describeStep(step)}` : ''})` : journey.name;
			const check = act ? `${journey.name} (${cycleLabel(journey.steps.length, acts, k - last - 1)})` : named;
			const hint = act ? HINTS.cycle : journey.pattern ? HINTS.keyboardPattern : step.action === 'press' ? HINTS.keyboard : HINTS.behaviour;
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
			// One side read the next page's data in the browser, the other fetched that page from its server: the reads are that route's own check.
			const paged = navigated && (n.paged || oldSteps.some((x) => x!.paged));
			const shown = (r: StepResult): StepResult => (paged ? { ...r, requests: r.requests.filter((line) => !readLine(line)) } : r);
			const fields = navigated ? (following ? (['requests', 'state', 'storage', 'dialogs'] as const) : (['requests', 'storage', 'dialogs'] as const)) : reloaded ? (['added', 'removed', 'state', 'storage'] as const) : (['added', 'removed', 'moved', 'requests', 'announcements', 'state', 'storage', 'dialogs', 'widget'] as const);
			for (const field of fields.filter((f) => !(f === 'storage' && n.door))) {
				// Requests in flight together finish in any order (a client retrying hosts it shuffled), so they count as a set.
				const lines = (r: StepResult) => (field === 'requests' ? [...r[field]].filter((line) => !(paged && readLine(line))).sort() : field === 'state' ? effects(r.state, owner) : field === 'added' || field === 'removed' ? untick(r)[field] : (r[field] ?? []));
				const diff = diffLines(lineTemplates(lines(a!), ...rest.map(lines)), lines(n));
				if (diff.changed.length || diff.missing.length || diff.unexpected.length) parts.push(field);
				if (field === 'storage') automatic = storageCandidate([...diff.missing, ...diff.changed.map((c) => c.expected)], [...diff.unexpected, ...diff.changed.map((c) => c.actual)], owner);
			}
			const own = n.door ? doorErrors?.get(n.url) : undefined;
			const errors = diffLines(lineTemplates(a!.errors, ...rest.map((r) => r.errors)), own ? n.errors.filter((e) => !own.includes(e)) : n.errors);
			if (errors.unexpected.length || errors.changed.length) parts.push('errors');
			if (!navigated && !reloaded && !stable([a!.focus, ...rest.map((r) => r.focus)])(n.focus)) parts.push('focus');
			// The old page answered the step and the new one did not: a control whose effect never happens is red whatever else matches.
			const missing = navigated || reloaded ? { changes: [], regions: [] } : missingReaction(oldSteps as StepResult[], n);
			if (missing.changes.length || missing.regions.length) parts.push('reaction');
			const jumped = navigated || reloaded ? undefined : extraShift(oldSteps as StepResult[], n);
			if (jumped) parts.push('shift');
			const slower = navigated || reloaded ? undefined : slowerAnswer(oldSteps as StepResult[], n);
			if (slower) parts.push('answer time');
			if (navigated && !n.loaded && morphs(oldSteps as StepResult[], n).length) parts.push('morph');
			if (!reloaded && !n.loaded && interimViews(oldSteps as StepResult[], n)) parts.push('in between');
			if (parts.length) {
				const failure: Failure = { route, dimension, check, expected: where('old', format(shown(a!), parts, missing, true)), actual: where('new', format(shown(n), parts, missing)), hint, ...(automatic && parts.length === 1 && parts[0] === 'storage' ? { automatic } : {}) };
				if (parts.length === 1 && parts[0] === 'answer time') timedOnly.set(failure, { journey: j, step: k });
				failures.push(failure);
				break;
			}
		}
	});
	return failures;
}
