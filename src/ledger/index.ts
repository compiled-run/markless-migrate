import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { handlerSites, type Anchor, type HandlerSite } from './source.ts';
import { pageOf, readPort, renderRoute, type PortElement, type PortFile } from './port.ts';
import { registryOf, Sandbox, type Answer } from './claims.ts';

/** How one site of the original is answered on the port, or why it is not. */
export interface LedgerEntry {
	readonly site: HandlerSite;
	readonly verdict: 'mapped' | 'unmapped' | 'unjoined' | 'inconclusive';
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
	readonly ms: number;
	readonly entries: readonly LedgerEntry[];
	readonly failures: readonly LedgerFailure[];
}

const CLICK = new Set(['onClick', 'onSelect', 'onCheckedChange', 'onValueChange', 'onPressedChange', 'onOpenChange', 'onPress', 'onAction', 'onSelectionChange', 'onExpandedChange', 'onRemove', 'part']);
const ITEM_ROLES = '[role=option],[role=menuitemradio],[role=menuitemcheckbox],[role=menuitem],[role=radio],[role=tab],[role=checkbox],[role=switch],[role=treeitem]';
// What a container's handler hears through when it is the element the page draws (a collapsible's trigger button).
const PRESSABLE = `${ITEM_ROLES},button,[role=button],summary,a[href],input,textarea`;
const ROLE_OF: Readonly<Record<string, string>> = { button: 'button', a: 'link', input: 'textbox', textarea: 'textbox', select: 'combobox', summary: 'button', form: 'form' };
// Sites tried per source site: enough to see a pattern a page factoring shares, few enough to stay static-fast.
const PER_SITE = 8;

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
	if (context.length < CONTEXT_MIN || el.parent === undefined) return true;
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
	return (bySlot.get(key) ?? []).filter((el) => attrs.every(([n, v]) => el.attrs[n] === v) && (!text || el.text.includes(text)) && amongContext(el, context, port));
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

const DOCUMENT = 'document.tsrx';

/** A route that shows `el` and the page serving it: the route its `@case` names, else a route of a page rendering its file. */
function routeFor(el: PortElement, port: ReadonlyMap<string, PortFile>, roots: ReadonlyMap<string, readonly string[]>, pages: ReadonlyMap<string, string>): { route: string; page: string } | undefined {
	const named = el.cases.find((c) => c.startsWith('/'));
	const search = el.cases.find((c) => c.startsWith('?'));
	const files = roots.get(el.file) ?? [];
	if (named) {
		const page = files.find((p) => port.get(p)!.routes.includes(named)) ?? pages.get(named);
		return page ? { route: named, page } : undefined;
	}
	const page = files.find((f) => f !== DOCUMENT);
	if (!page) return undefined;
	const routes = port.get(page)!.routes;
	const base = routes.find((r) => !r.includes('?')) ?? routes[0];
	if (!base) return undefined;
	return { route: search ? `${base.split('?')[0]}${search}` : base, page };
}

/** Whether what answered is enough for this site: an app's own effect needs more than its library's part. */
function enough(site: HandlerSite, answer: Answer): boolean {
	if (answer.by === 'none') return false;
	if (answer.by === 'threw') return true;
	if (site.kind === 'part' || site.handler === 'mirror') return true;
	return answer.by !== 'part';
}

// How many of a route's segments the source file's path names: an example is tried on its own docs (radix, base,
// aria), a page's component on its page (app/(app)/(typeset)/... on /typeset).
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
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
}

interface Trial {
	readonly site: HandlerSite;
	readonly anchor: Anchor;
	readonly el: PortElement;
	readonly route: string;
	readonly page: string;
	readonly events: readonly string[];
}

interface Result {
	readonly answer: Answer;
	readonly event: string;
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
	// Site components (lib/site/*.tsrx) that write Markless handlers of their own.
	const sited = new Set([...port.values()].filter((pf) => pf.file.startsWith('lib/site/') && pf.elements.some((el) => el.handlers.length)).map((pf) => pf.file));
	const pages = pageOf(port);
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
		for (const anchor of site.anchors) {
			const found = candidates(anchor, bySlot, site.context, port);
			if (!found.length) continue;
			const placed = found.map((el) => ({ el, at: routeFor(el, port, roots, pages) })).filter((c): c is { el: PortElement; at: { route: string; page: string } } => !!c.at);
			const scored = placed.map((c) => ({ ...c, score: affinity(site.file, c.at.route) })).sort((a, b) => b.score - a.score);
			// Where some route shares words with the source's path, the routes sharing none are another component's.
			const ranked = scored[0]?.score ? scored.filter((c) => c.score > 0) : scored;
			const files = new Set<string>();
			for (const { el, at } of ranked) {
				if (files.has(el.file) || list.length >= PER_SITE) continue;
				files.add(el.file);
				// What the element finally is decides what onChange hears: typing in an <input>, a choice elsewhere.
				const own = anchor.anchor === 'self' ? [...new Set(site.props.map((p) => eventOf(p, el.tag)).filter((e): e is string => !!e))] : events;
				list.push({ site, anchor, el, events: own.length ? own : events, ...at });
			}
			if (list.length) break;
		}
		if (!list.length) entries.push({ site, verdict: 'unjoined', reason: 'no element of the port rendered on a route has its slot, attributes and text' });
		else trials.set(site, list);
	}
	const byRoute = new Map<string, Trial[]>();
	for (const list of trials.values()) for (const t of list) (byRoute.get(t.route) ?? byRoute.set(t.route, []).get(t.route)!).push(t);
	const sandbox = await Sandbox.open(options.app);
	// A part's own async work (a lazily imported module, a timer) that fails outside a browser is not the ledger's failure.
	const stray: string[] = [];
	const swallow = (error: unknown) => void stray.push(String(error).split('\n')[0]!);
	process.on('unhandledRejection', swallow);
	process.on('uncaughtException', swallow);
	const results = new Map<Trial, Result>();
	let showing = 0;
	let trying = 0;
	try {
		for (const [route, list] of [...byRoute].sort(([a], [b]) => a.localeCompare(b))) {
			const page = list[0]!.page;
			const registry = await registryOf(options.app, page);
			let at = Date.now();
			sandbox.show(renderRoute(port, page, route) + renderRoute(port, DOCUMENT, route));
			showing += Date.now() - at;
			at = Date.now();
			const memo = new Map<string, Result>();
			const layers = new Map<string, Element>();
			for (const el of sandbox.window.document.querySelectorAll('[data-mm-layer]') as unknown as Iterable<Element>) layers.set(el.getAttribute('data-mm-layer')!, el);
			// A trigger opens its layer once per page: another trigger of the same layer (a header drawn twice) gets the same answer.
			const opens = new Map<string, Result>();
			for (const t of list) {
				const library = t.site.kind === 'part' || t.site.handler === 'mirror';
				const key = `${t.el.file}#${t.el.index} ${t.events.join(',')} ${library}`;
				const node = sandbox.window.document.querySelector(`[data-mm-ledger="${t.el.file}#${t.el.index}"]`)?.closest('[aria-controls],[data-mm-key]');
				const controls = node?.getAttribute('aria-controls') ?? node?.getAttribute('data-mm-key');
				const layerKey = controls ? `${controls} ${t.events.join(',')} ${library}` : undefined;
				let r = memo.get(key) ?? (layerKey ? opens.get(layerKey) : undefined);
				if (!r) {
					r = await trial(sandbox, t, registry, { layers, sited });
					memo.set(key, r);
					if (layerKey && r.answer.by !== 'none') opens.set(layerKey, r);
				}
				results.set(t, r);
			}
			trying += Date.now() - at;
		}
	} finally {
		await sandbox.close();
		process.off('unhandledRejection', swallow);
		process.off('uncaughtException', swallow);
	}
	options.log?.(`ledger: ${byRoute.size} routes shown in ${showing} ms, ${[...byRoute.values()].flat().length} elements tried in ${trying} ms (${Date.now() - started} ms so far)`);
	const failures = new Map<string, { failure: LedgerFailure; sites: HandlerSite[] }>();
	for (const [site, list] of trials) {
		const tried = list.map((t) => ({ t, r: results.get(t)! })).filter(({ r }) => r.event !== 'render');
		if (!tried.length) {
			entries.push({ site, verdict: 'unjoined', reason: 'its element in the port is under a branch the ledger does not render' });
			continue;
		}
		const bad = tried.find(({ r }) => !enough(site, r.answer));
		const { t, r } = bad ?? tried[0]!;
		const where = `${t.el.file}#${t.el.index}`;
		if (!bad) {
			entries.push({ site, verdict: r.answer.by === 'threw' ? 'inconclusive' : 'mapped', by: r.answer.by, port: where, route: t.route, event: r.event, ...(r.answer.by === 'threw' ? { reason: `${r.answer.where} threw outside a browser: ${r.answer.error}` } : {}) });
			continue;
		}
		const why = r.answer.by === 'part' ? `only the library's part (${r.answer.where}) answers the ${r.event}; the site's own handler has no port` : `no part, recorded choice or Markless handler of the port answers the ${r.event}`;
		entries.push({ site, verdict: 'unmapped', ...(r.answer.by !== 'none' ? { by: r.answer.by } : {}), port: where, route: t.route, event: r.event, reason: why });
		const key = `${where} ${r.event} ${site.kind}`;
		const known = failures.get(key);
		if (known) {
			known.sites.push(site);
			continue;
		}
		const slot = t.el.attrs['data-slot'] ? ` data-slot="${t.el.attrs['data-slot']}"` : '';
		failures.set(key, { sites: [site], failure: { route: t.route, dimension: 'behaviour', check: `handler ledger: ${r.event} ${roleOf(t.el)} ${JSON.stringify(accessibleName(t.anchor, t.el))}`, expected: '', actual: `${why} (port: ${t.el.file} <${t.el.tag}${slot}>${t.anchor.anchor === 'self' ? '' : `, found by the element ${t.anchor.anchor === 'inside' ? 'inside' : 'beside'} it`})` } });
	}
	const listed = [...failures.values()].map(({ failure, sites: s }) => ({ ...failure, expected: `the original's ${[...new Set(s.flatMap((x) => x.props))].join(', ')} (${s.slice(0, 3).map((x) => `${x.file}:${x.line}`).join(', ')}${s.length > 3 ? `, and ${s.length - 3} more` : ''}) answers it` }));
	const count = (v: LedgerEntry['verdict']) => entries.filter((e) => e.verdict === v).length;
	return { sites: sites.length, mapped: count('mapped'), unmapped: count('unmapped'), unjoined: count('unjoined'), inconclusive: count('inconclusive'), ms: Date.now() - started, entries, failures: listed };
}

// Items of a group or a layer a value-change handler hears through; the first few are enough to see who answers them.
const ITEMS_TRIED = 3;

/** One port element tried: what answers each of its site's events, on it or on the items it holds or opens. */
async function trial(sandbox: Sandbox, t: Trial, registry: string | undefined, page: { readonly layers: ReadonlyMap<string, Element>; readonly sited: ReadonlySet<string> }): Promise<Result> {
	// An element of a site component (lib/site/*.tsrx) is the site's own Markless code where it writes handlers.
	if (page.sited.has(t.el.file)) return { answer: { by: 'markless', where: t.el.file }, event: t.events[0]! };
	const doc = sandbox.window.document as unknown as Document;
	const target = doc.querySelector(`[data-mm-ledger="${t.el.file}#${t.el.index}"]`);
	if (!target) return { answer: { by: 'none' }, event: 'render' };
	// A library's own behaviour inside a closed layer needs the layer opened through its trigger first: its port is enough.
	const libraryOnly = t.site.kind === 'part' || t.site.handler === 'mirror';
	if (libraryOnly && t.el.layer && registry) return { answer: { by: 'part', where: 'layer' }, event: t.events[0]! };
	const opened = t.el.layer ? undefined : page.layers.get(target.getAttribute('aria-controls') ?? target.id);
	const inside = [...target.querySelectorAll(PRESSABLE)].slice(0, libraryOnly ? 2 : ITEMS_TRIED);
	const tries = libraryOnly ? [target, ...inside] : [target, ...inside, ...(opened ? [...opened.querySelectorAll(ITEM_ROLES)].slice(0, ITEMS_TRIED) : [])];
	// A press reaches a part as pointerdown, click or a key, whichever the library listens for (Radix opens on pointerdown).
	// A tooltip or hover card answers the pointer resting on it, a context menu the right button.
	const hover = /(Tooltip|HoverCard|PreviewCard)/.test(t.site.element) ? ['pointerover', 'focusin'] : [];
	const events = t.events.includes('click') ? [...new Set([...hover, ...t.events, 'pointerdown', 'keydown', 'focusin', ...(/ContextMenu/.test(t.site.element) ? ['contextmenu'] : [])])] : libraryOnly ? [...new Set([...hover, ...t.events, 'pointerdown', 'click', 'keydown'])] : t.events;
	let best: Result | undefined;
	for (const event of events) {
		for (const at of tries) {
			const answer = await sandbox.answer(at, event, registry, { library: libraryOnly });
			if (enough(t.site, answer)) return { answer, event };
			if (!best || (best.answer.by === 'none' && answer.by !== 'none')) best = { answer, event };
		}
	}
	return best ?? { answer: { by: 'none' }, event: t.events[0]! };
}

// Failures listed in the summary; the rest are in .migrate/ledger.json.
const LISTED = 20;

/** What a person reads after convert: the counts, and the first unanswered handlers with where they are. */
export function summarizeLedger(ledger: Ledger): string {
	const lines = [`Handler ledger: ${ledger.sites} handler sites in the old source; ${ledger.mapped} answered on the port, ${ledger.unmapped} not answered (${ledger.failures.length} port elements), ${ledger.unjoined} not found in the port, ${ledger.inconclusive} not decidable outside a browser (${(ledger.ms / 1000).toFixed(1)} s).`];
	for (const f of ledger.failures.slice(0, LISTED)) lines.push(`  ${f.route}: ${f.check.replace(/^handler ledger: /, '')}: ${f.expected}; ${f.actual}`);
	if (ledger.failures.length > LISTED) lines.push(`  and ${ledger.failures.length - LISTED} more`);
	return `${lines.join('\n')}\n`;
}

/** Writes the ledger beside the app's other records (`.migrate/ledger.json`). */
export async function writeLedger(app: string, ledger: Ledger): Promise<string> {
	const file = join(app, '.migrate', 'ledger.json');
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(ledger, null, '\t')}\n`);
	return file;
}
