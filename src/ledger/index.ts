import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { handlerSites, type Anchor, type HandlerSite } from './source.ts';
import { pageOf, readPort, type PortElement, type PortFile } from './port.ts';
import { DOCUMENT, enough, runJobs, type Result, type RouteJob } from './trials.ts';

/** How one site of the original is answered on the port, or why it is not. */
export interface LedgerEntry {
	readonly site: HandlerSite;
	/** `weak`: unanswered on an element found by slot and text alone, which may be another component's: reported, never failed. */
	readonly verdict: 'mapped' | 'unmapped' | 'unjoined' | 'inconclusive' | 'weak';
	/** For `mapped`: markless, site-part, recorded, part, or noop. */
	readonly by?: string;
	/** The port element (file#index) and the route it was tried on. */
	readonly port?: string;
	readonly route?: string;
	readonly event?: string;
	readonly reason?: string;
}

/** A Failure as check reports one, so a scorecard reads the ledger like any other check. */
export interface LedgerFailure {
	readonly route: string;
	readonly dimension: 'behaviour';
	readonly check: string;
	readonly expected: string;
	readonly actual: string;
}

export interface Ledger {
	readonly sites: number;
	readonly mapped: number;
	readonly unmapped: number;
	readonly unjoined: number;
	readonly inconclusive: number;
	readonly weak: number;
	readonly ms: number;
	readonly entries: readonly LedgerEntry[];
	readonly failures: readonly LedgerFailure[];
	/** Unanswered handlers on elements found by slot and text alone: reported, never failed. */
	readonly weakFailures: readonly LedgerFailure[];
}

const CLICK = new Set(['onClick', 'onSelect', 'onCheckedChange', 'onValueChange', 'onPressedChange', 'onOpenChange', 'onPress', 'onAction', 'onSelectionChange', 'onExpandedChange', 'onRemove', 'part']);
const ROLE_OF: Readonly<Record<string, string>> = { button: 'button', a: 'link', input: 'textbox', textarea: 'textbox', select: 'combobox', summary: 'button', form: 'form' };
// Sites tried per source site: enough to see a pattern a page factoring shares, few enough to stay static-fast.
const PER_SITE = 80;

/** The event a handler prop answers, as the parts runtime names it. */
export function eventOf(prop: string, tag: string | undefined): string | undefined {
	if (CLICK.has(prop)) return 'click';
	if (prop === 'onChange' || prop === 'onInput') return tag === 'input' || tag === 'textarea' ? 'input' : 'click';
	if (prop === 'onKeyDown' || prop === 'onKeyUp') return 'keydown';
	if (prop === 'onSubmit') return 'submit';
	if (prop === 'onBlur') return 'focusout';
	if (prop === 'onFocus') return 'focusin';
	if (/^on(Mouse|Pointer)(Enter|Over|Move)$/.test(prop)) return 'pointerover';
	if (/^on(Mouse|Pointer)(Leave|Out)$/.test(prop)) return 'pointerout';
	if (/^on(Mouse|Pointer)Down$/.test(prop)) return 'pointerdown';
	if (prop === 'onContextMenu') return 'contextmenu';
	return undefined;
}

const squash = (s: string) => s.replace(/\s+/g, '');

// Ancestors read for the words around an element, and the share of the component's words they must show.
const CONTEXT_DEPTH = 6;
const CONTEXT_SHARE = 0.5;
const CONTEXT_MIN = 3;

/** Whether the element sits among most of the words its source component shows around it (or the file holds too little to tell). */
function amongContext(el: PortElement, context: readonly string[], port: ReadonlyMap<string, PortFile>): boolean {
	if (context.length < CONTEXT_MIN) return true;
	// The root of a component shared by pages: what is around it is in each page, so the words cannot be checked here.
	if (el.parent === undefined) return false;
	const elements = port.get(el.file)?.elements ?? [];
	let text = '';
	for (let at: PortElement | undefined = elements[el.parent], n = 0; at && n < CONTEXT_DEPTH; at = at.parent === undefined ? undefined : elements[at.parent], n++) text += at.text.toLowerCase();
	return context.filter((w) => text.includes(w)).length >= Math.ceil(context.length * CONTEXT_SHARE);
}

/** The port elements an anchor can be: same data-slot (or tag), same literal attributes, its static text inside. */
export function candidates(anchor: Anchor, bySlot: ReadonlyMap<string, readonly PortElement[]>, context: readonly string[] = [], port: ReadonlyMap<string, PortFile> = new Map()): PortElement[] {
	const key = anchor.slot ?? anchor.tag;
	const text = squash(anchor.text);
	const attrs = Object.entries(anchor.attrs);
	if (!key) return [];
	// A data-slot names a part, not its element: a Button rendered as a link (`<a data-slot="button">`) is another part.
	const tagged = (el: PortElement) => (!anchor.tag || !anchor.slot || el.tag === anchor.tag) && !(el.tag === 'a' && el.attrs.href && el.attrs.href !== '{}' && !anchor.attrs.href && !/link|trigger|item/.test(anchor.slot ?? ''));
	return (bySlot.get(key) ?? []).filter((el) => tagged(el) && attrs.every(([n, v]) => el.attrs[n] === v) && (!text || el.text.includes(text)) && amongContext(el, context, port));
}

const accessibleName = (anchor: Anchor | undefined, el: PortElement) => el.attrs['aria-label'] ?? anchor?.attrs['aria-label'] ?? (anchor?.text || el.attrs.placeholder || el.attrs.title || '');
const roleOf = (el: PortElement) => el.attrs.role ?? ROLE_OF[el.tag] ?? el.tag;

/** The pages (and `document.tsrx`, around every page) that render each file, through the components they import. */
function rootsRendering(port: ReadonlyMap<string, PortFile>): Map<string, string[]> {
	const importers = new Map<string, Set<string>>();
	for (const pf of port.values()) for (const from of pf.imports.values()) {
		const target = posix.normalize(posix.join(posix.dirname(pf.file), from));
		(importers.get(target) ?? importers.set(target, new Set()).get(target)!).add(pf.file);
	}
	const memo = new Map<string, string[]>();
	const up = (file: string, seen: Set<string>): string[] => {
		if (file.startsWith('pages/') || file === DOCUMENT) return [file];
		if (memo.has(file)) return memo.get(file)!;
		if (seen.has(file)) return [];
		seen.add(file);
		const out = [...new Set([...(importers.get(file) ?? [])].flatMap((f) => up(f, seen)))].sort();
		memo.set(file, out);
		return out;
	};
	const out = new Map<string, string[]>();
	for (const file of port.keys()) out.set(file, up(file, new Set()));
	return out;
}


// Pages a component shared by several is tried on when it writes per-page values (each page's own generated ids).
const SHARED_PAGES = 8;

/**
 * The routes that show `el` and the page serving each: the route its `@case` names, else a route of a page rendering its
 * file; every page (up to SHARED_PAGES) for a component whose markup differs per page through its VALUES table.
 */
function routesFor(el: PortElement, port: ReadonlyMap<string, PortFile>, roots: ReadonlyMap<string, readonly string[]>, pages: ReadonlyMap<string, string>): { route: string; page: string }[] {
	const named = el.cases.find((c) => c.startsWith('/'));
	const search = el.cases.find((c) => c.startsWith('?'));
	const files = roots.get(el.file) ?? [];
	if (named) {
		const page = files.find((p) => port.get(p)!.routes.includes(named)) ?? pages.get(named);
		return page ? [{ route: named, page }] : [];
	}
	const perPage = /\bconst values = \w+\[(?:path|route)\]/.test(port.get(el.file)?.text ?? '');
	const out: { route: string; page: string }[] = [];
	for (const page of files.filter((f) => f !== DOCUMENT).slice(0, perPage ? SHARED_PAGES : 1)) {
		const routes = port.get(page)!.routes;
		const base = routes.find((r) => !r.includes('?')) ?? routes[0];
		if (base) out.push({ route: search ? `${base.split('?')[0]}${search}` : base, page });
	}
	return out;
}


// How many of a route's segments the source file's path names: an example is tried on its own docs (radix, base,
// aria), a page's component on its page (app/(app)/(typeset)/... on /typeset).
const PAGE_OWN = /^(app|examples|registry)\//;
// Path words every route or source file has, which tell nothing about which component it is.
const COMMON = new Set(['app', 'components', 'component', 'docs', 'examples', 'example', 'view', 'registry', 'lib', 'src', 'pages', 'page', 'index', 'tsx', 'jsx', 'new', 'york', 'bases', 'styles', 'blocks', 'internal', 'nova', 'default']);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !COMMON.has(w)));
function affinity(file: string, route: string): number {
	const own = words(file);
	return [...words(route.split('?')[0]!)].filter((w) => own.has(w)).length;
}

export interface LedgerOptions {
	/** The original's source root (the old app). */
	readonly source: string;
	/** The converted app. */
	readonly app: string;
	readonly log?: (line: string) => void;
	/** Threads the pages are tried on. */
	readonly workers?: number;
}

// Pages are tried on up to this many threads, each with its own window and parts; a runner has four cores.
const WORKERS = Math.max(1, Math.min(4, availableParallelism() - 1));

interface Trial {
	readonly site: HandlerSite;
	readonly anchor: Anchor;
	readonly el: PortElement;
	readonly route: string;
	readonly page: string;
	readonly events: readonly string[];
	/** Found without the words around it: a failure through it is reported, never failed. */
	readonly weak: boolean;
}


/** Every handler the original wires, each mapped to what answers it on the port, or reported. */
export async function buildLedger(options: LedgerOptions): Promise<Ledger> {
	const started = Date.now();
	const [sites, port] = await Promise.all([handlerSites(options.source), readPort(options.app)]);
	const bySlot = new Map<string, PortElement[]>();
	for (const pf of port.values()) for (const el of pf.elements) {
		const key = el.attrs['data-slot'] ?? el.tag;
		(bySlot.get(key) ?? bySlot.set(key, []).get(key)!).push(el);
	}
	const roots = rootsRendering(port);
	const pages = pageOf(port);
	const allRoutes = [...pages.keys()];
	const homed = new Map<string, boolean>();
	// Whether some route of the port shares a word with the file's path: the page that component or example is for.
	const homes = (file: string) => homed.get(file) ?? homed.set(file, allRoutes.some((r) => affinity(file, r) > 0)).get(file)!;
	options.log?.(`ledger: ${sites.length} handler sites in the source, ${port.size} modules in the port`);
	const entries: LedgerEntry[] = [];
	const trials = new Map<HandlerSite, Trial[]>();
	for (const site of sites) {
		if (site.kind === 'app' && site.handler === 'noop') {
			entries.push({ site, verdict: 'mapped', by: 'noop' });
			continue;
		}
		const events = [...new Set(site.props.map((p) => eventOf(p, site.tag)).filter((e): e is string => !!e))];
		if (!events.length) {
			entries.push({ site, verdict: 'unjoined', reason: `no event the parts runtime handles for ${site.props.join(', ')}` });
			continue;
		}
		if (!site.anchors.length) {
			entries.push({ site, verdict: 'unjoined', reason: 'neither it nor an element inside or beside it has text or an identifying attribute' });
			continue;
		}
		const list: Trial[] = [];
		// Elements among the words the source shows around the site, then the rest with its slot and text, whose verdict is weak.
		for (const anchor of site.anchors) {
			const all = candidates(anchor, bySlot);
			if (!all.length) continue;
			const strong = new Set(candidates(anchor, bySlot, site.context, port));
			// Each element's first route before any element's second, so the cap keeps every element in.
			const placed = all.flatMap((el) => routesFor(el, port, roots, pages).map((at, n) => ({ el, at, n, weak: !strong.has(el) })));
			const scored = placed.map((c) => ({ ...c, score: affinity(site.file, c.at.route) })).sort((a, b) => Number(a.weak) - Number(b.weak) || b.score - a.score || a.n - b.n);
			// The routes sharing the most words with the source's path are its own; on any other it may be another component's: weak there.
			const best = Math.max(0, ...scored.map((c) => c.score));
			// A page's own component or an example (app/, examples/, registry/) found only on routes sharing no word with it, while a route that does exists, is a guess.
			const unplacedPage = best === 0 && PAGE_OWN.test(site.file) && homes(site.file);
			const files = new Set<string>();
			for (const { el, at, weak: unplaced, score } of scored) {
				const weak = unplaced || unplacedPage || score < best;
				if (files.has(`${el.file} ${at.route}`) || list.length >= PER_SITE) continue;
				files.add(`${el.file} ${at.route}`);
				// What the element finally is decides what onChange hears: typing in an <input>, a choice elsewhere.
				const own = anchor.anchor === 'self' ? [...new Set(site.props.map((p) => eventOf(p, el.tag)).filter((e): e is string => !!e))] : events;
				list.push({ site, anchor, el, events: own.length ? own : events, weak, ...at });
			}
			if (list.length) break;
		}
		if (!list.length) entries.push({ site, verdict: 'unjoined', reason: 'no element of the port rendered on a route has its slot, attributes and text' });
		else trials.set(site, list);
	}
	const byRoute = new Map<string, Trial[]>();
	for (const list of trials.values()) for (const t of list) (byRoute.get(t.route) ?? byRoute.set(t.route, []).get(t.route)!).push(t);
	const jobs: RouteJob[] = [...byRoute].sort(([a], [b]) => a.localeCompare(b)).map(([route, list]) => ({ route, page: list[0]!.page, trials: list.map((t) => ({ el: t.el, events: t.events, element: t.site.element, kind: t.site.kind, handler: t.site.handler })) }));
	const tried = await runJobs(options.app, port, jobs, options.workers ?? WORKERS);
	const results = new Map<Trial, Result>();
	jobs.forEach((job, j) => byRoute.get(job.route)!.forEach((t, i) => results.set(t, tried[j]![i]!)));
	options.log?.(`ledger: ${byRoute.size} routes, ${[...byRoute.values()].flat().length} elements tried (${Date.now() - started} ms so far)`);
	const failures = new Map<string, { failure: LedgerFailure; sites: HandlerSite[] }>();
	const weakFailures = new Map<string, { failure: LedgerFailure; sites: HandlerSite[] }>();
	for (const [site, list] of trials) {
		const tried = list.map((t) => ({ t, r: results.get(t)! })).filter(({ r }) => r.event !== 'render');
		if (!tried.length) {
			entries.push({ site, verdict: 'unjoined', reason: 'its element in the port is under a branch the ledger does not render' });
			continue;
		}
		const bad = tried.filter(({ r }) => !enough(site, r.answer)).sort((a, b) => Number(a.t.weak) - Number(b.t.weak));
		const { t, r } = bad[0] ?? tried[0]!;
		if (!bad.length) {
			entries.push({ site, verdict: r.answer.by === 'threw' ? 'inconclusive' : 'mapped', by: r.answer.by, port: `${t.el.file}#${t.el.index}`, route: t.route, event: r.event, ...(r.answer.by === 'threw' ? { reason: `${r.answer.where} threw outside a browser: ${r.answer.error}` } : {}) });
			continue;
		}
		const why = (r: Result) => (r.answer.by === 'part' ? `only the library's part (${r.answer.where}) answers the ${r.event}; the site's own handler has no port` : `no part, recorded choice or Markless handler of the port answers the ${r.event}`);
		entries.push({ site, verdict: t.weak ? 'weak' : 'unmapped', ...(r.answer.by !== 'none' ? { by: r.answer.by } : {}), port: `${t.el.file}#${t.el.index}`, route: t.route, event: r.event, reason: t.weak ? `${why(r)}; found only by its slot and text, not among the words around it in the source` : why(r) });
		// Every port element the site's control is dead on, so a copy dead on one page only (a header) is named on that page.
		for (const { t, r } of bad) {
			const into = t.weak ? weakFailures : failures;
			const where = `${t.el.file}#${t.el.index}`;
			const key = `${where} ${t.route} ${r.event} ${site.kind}`;
			const known = into.get(key);
			if (known) {
				known.sites.push(site);
				continue;
			}
			const slot = t.el.attrs['data-slot'] ? ` data-slot="${t.el.attrs['data-slot']}"` : '';
			into.set(key, { sites: [site], failure: { route: t.route, dimension: 'behaviour', check: `handler ledger: ${r.event} ${roleOf(t.el)} ${JSON.stringify(accessibleName(t.anchor, t.el))}`, expected: '', actual: `${why(r)} (port: ${t.el.file} <${t.el.tag}${slot}>${t.anchor.anchor === 'self' ? '' : `, found by the element ${t.anchor.anchor === 'inside' ? 'inside' : 'beside'} it`})` } });
		}
	}
	const list = (from: typeof failures) => [...from.values()].map(({ failure, sites: s }) => ({ ...failure, expected: `the original's ${[...new Set(s.flatMap((x) => x.props))].join(', ')} (${s.slice(0, 3).map((x) => `${x.file}:${x.line}`).join(', ')}${s.length > 3 ? `, and ${s.length - 3} more` : ''}) answers it` }));
	const count = (v: LedgerEntry['verdict']) => entries.filter((e) => e.verdict === v).length;
	return { sites: sites.length, mapped: count('mapped'), unmapped: count('unmapped'), unjoined: count('unjoined'), inconclusive: count('inconclusive'), weak: count('weak'), ms: Date.now() - started, entries, failures: list(failures), weakFailures: list(weakFailures) };
}


// Failures listed in the summary; the rest are in .migrate/ledger.json.
const LISTED = 20;

/** What a person reads after convert: the counts, and the first unanswered handlers with where they are. */
export function summarizeLedger(ledger: Ledger): string {
	const lines = [`Handler ledger: ${ledger.sites} handler sites in the old source; ${ledger.mapped} answered on the port, ${ledger.unmapped} not answered (${ledger.failures.length} port elements), ${ledger.unjoined} not found in the port, ${ledger.inconclusive} not decidable outside a browser, ${ledger.weak} unanswered where the element was found by its slot and text alone (${(ledger.ms / 1000).toFixed(1)} s).`];
	for (const f of ledger.failures.slice(0, LISTED)) lines.push(`  ${f.route}: ${f.check.replace(/^handler ledger: /, '')}: ${f.expected}; ${f.actual}`);
	if (ledger.failures.length > LISTED) lines.push(`  and ${ledger.failures.length - LISTED} more`);
	return `${lines.join('\n')}\n`;
}

export type LedgerMode = 'fail' | 'report' | 'off';
/** What convert does with unanswered handlers unless told: report them, as some of them are still the ledger's own gaps. */
export const DEFAULT_LEDGER_MODE: LedgerMode = 'report';

/** Convert's exit code from the ledger: 1 only when asked to fail (`--ledger fail`) and a handler is unanswered. */
export function ledgerExit(mode: LedgerMode | undefined, failures: number): 0 | 1 {
	return (mode ?? DEFAULT_LEDGER_MODE) === 'fail' && failures > 0 ? 1 : 0;
}

/** Writes the ledger beside the app's other records (`.migrate/ledger.json`). */
export async function writeLedger(app: string, ledger: Ledger): Promise<string> {
	const file = join(app, '.migrate', 'ledger.json');
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(ledger, null, '\t')}\n`);
	return file;
}
