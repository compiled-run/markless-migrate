import { Worker } from 'node:worker_threads';
import { registryOf, Sandbox, type Answer } from './claims.ts';
import { readPort, renderRoute, type PortElement, type PortFile } from './port.ts';
import type { HandlerClass, HandlerSite } from './source.ts';

/** One port element to offer its site's events to. */
export interface TrialJob {
	readonly el: PortElement;
	readonly events: readonly string[];
	/** The source element's name (`TooltipTrigger`), which says what a press reaches it as. */
	readonly element: string;
	readonly kind: HandlerSite['kind'];
	readonly handler: HandlerClass;
	/** Its handler hears a value change (onValueChange, onCheckedChange, onSelect...), which a part sends as its own event. */
	readonly changes?: boolean;
	/** The element was found by one inside the source element, not by the element itself. */
	readonly inside?: boolean;
}

/** The elements tried on one route, on the page module that serves it. */
export interface RouteJob {
	readonly route: string;
	readonly page: string;
	readonly trials: readonly TrialJob[];
}

export interface Result {
	readonly answer: Answer;
	readonly event: string;
}

export const DOCUMENT = 'document.tsrx';
const ITEM_ROLES = '[role=option],[role=menuitemradio],[role=menuitemcheckbox],[role=menuitem],[role=radio],[role=tab],[role=checkbox],[role=switch],[role=treeitem]';
// What a container's handler hears through when it is the element the page draws (a collapsible's trigger button).
const PRESSABLE = `${ITEM_ROLES},button,[role=button],summary,a[href],input,textarea`;
const TRIGGERS = '[data-slot$="-trigger"],[aria-expanded],[aria-controls]';
// Items of a group or a layer a value-change handler hears through; the first few are enough to see who answers them.
const ITEMS_TRIED = 3;

const libraryOnly = (t: Pick<TrialJob, 'kind' | 'handler'>) => t.kind === 'part' || t.handler === 'mirror';

/** Whether what answered is enough for this site: an app's own effect needs more than its library's part. */
export function enough(site: Pick<TrialJob, 'kind' | 'handler'>, answer: Answer): boolean {
	if (answer.by === 'none') return false;
	if (answer.by === 'threw') return true;
	if (libraryOnly(site)) return true;
	return answer.by !== 'part';
}

/** Site components (lib/site/*.tsrx) that write Markless handlers of their own. */
const sitedOf = (port: ReadonlyMap<string, PortFile>) => new Set([...port.values()].filter((pf) => pf.file.startsWith('lib/site/') && pf.elements.some((el) => el.handlers.length)).map((pf) => pf.file));

/** One port element tried: what answers each of its site's events, on it or on the items it holds or opens. */
async function trial(sandbox: Sandbox, t: TrialJob, registry: string | undefined, page: { readonly layers: ReadonlyMap<string, Element>; readonly sited: ReadonlySet<string> }): Promise<Result> {
	// An element of a site component is the site's own Markless code where it writes handlers.
	if (page.sited.has(t.el.file)) return { answer: { by: 'markless', where: t.el.file }, event: t.events[0]! };
	const doc = sandbox.window.document as unknown as Document;
	const target = doc.querySelector(`[data-mm-ledger="${t.el.file}#${t.el.index}"]`);
	if (!target) return { answer: { by: 'none' }, event: 'render' };
	// A library's own behaviour inside a closed layer needs the layer opened through its trigger first: its port is enough.
	const library = libraryOnly(t);
	if (library && t.el.layer && registry) return { answer: { by: 'part', where: 'layer' }, event: t.events[0]! };
	const opened = t.el.layer ? undefined : page.layers.get(target.getAttribute('aria-controls') ?? target.id);
	// A container's own trigger first (a collapsible's), then what else it holds that can be pressed.
	// Found by an element inside it (a trigger's own line of text): the control around that element is the one pressed.
	const around = t.inside ? target.parentElement?.closest(PRESSABLE) : null;
	const inside = [...new Set([...(around ? [around] : []), ...target.querySelectorAll(TRIGGERS), ...target.querySelectorAll(PRESSABLE)])].slice(0, library ? 3 : ITEMS_TRIED + 1);
	const tries = library ? [target, ...inside] : [target, ...inside, ...(opened ? [...opened.querySelectorAll(`${ITEM_ROLES},[role=gridcell] button,td button`)].slice(0, ITEMS_TRIED) : [])];
	// A press reaches a part as pointerdown, click or a key, whichever the library listens for (Radix opens on pointerdown).
	// A tooltip or hover card answers the pointer resting on it, a context menu the right button.
	const hover = /(Tooltip|HoverCard|PreviewCard)/.test(t.element) ? ['pointerover', 'focusin'] : [];
	// A choice whose input the label holds (a questionnaire's radio) answers the input it changes.
	const typed = library && inside.some((x) => x.localName === 'input') ? ['input'] : [];
	const events = t.events.includes('click') ? [...new Set([...hover, ...t.events, 'pointerdown', 'keydown', 'focusin', ...typed, ...(/ContextMenu/.test(t.element) ? ['contextmenu'] : [])])] : library ? [...new Set([...hover, ...t.events, 'pointerdown', 'click', 'keydown', ...typed])] : t.events;
	let best: Result | undefined;
	for (const event of events) {
		for (const at of tries) {
			const answer = await sandbox.answer(at, event, registry, { library, changes: !library && t.changes });
			if (enough(t, answer)) return { answer, event };
			if (!best || (best.answer.by === 'none' && answer.by !== 'none')) best = { answer, event };
		}
	}
	return best ?? { answer: { by: 'none' }, event: t.events[0]! };
}

/** Each route shown once in a fresh window, and every element of it tried: the results in the jobs' order. */
export async function tryRoutes(app: string, port: ReadonlyMap<string, PortFile>, jobs: readonly RouteJob[]): Promise<Result[][]> {
	const sited = sitedOf(port);
	const sandbox = await Sandbox.open(app);
	// A part's own async work (a lazily imported module, a timer) that fails outside a browser is not the ledger's failure.
	const swallow = () => {};
	process.on('unhandledRejection', swallow);
	process.on('uncaughtException', swallow);
	const out: Result[][] = [];
	try {
		for (const { route, page, trials } of jobs) {
			const registry = await registryOf(app, page);
			const html = renderRoute(port, page, route) + renderRoute(port, DOCUMENT, route);
			sandbox.show(html);
			let doc = sandbox.window.document as unknown as Document;
			const layers = new Map<string, Element>();
			const index = () => {
				layers.clear();
				for (const el of doc.querySelectorAll('[data-mm-layer]')) layers.set(el.getAttribute('data-mm-layer')!, el);
			};
			index();
			// happy-dom delivers records to the callback a task later; takeRecords() alone sees none.
			let dirty = false;
			let watch!: MutationObserver;
			const observe = () => {
				watch = new (sandbox.window as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver(() => {
					dirty = true;
				});
				watch.observe(doc.body, { subtree: true, childList: true, attributes: true });
			};
			observe();
			const memo = new Map<string, Result>();
			// A trigger opens its layer once per page: another trigger of the same layer (a header drawn twice) gets the same answer.
			const opens = new Map<string, Result>();
			const results: Result[] = new Array(trials.length);
			// An app's own handlers first: a library trial opens menus and moves layers, which the app trials must not see.
			const order = trials.map((t, i) => ({ t, i })).sort((a, b) => Number(libraryOnly(a.t)) - Number(libraryOnly(b.t)));
			for (const { t, i } of order) {
				const key = `${t.el.file}#${t.el.index} ${t.events.join(',')} ${libraryOnly(t)} ${Boolean(t.changes)}`;
				const node = doc.querySelector(`[data-mm-ledger="${t.el.file}#${t.el.index}"]`);
				const controls = node?.getAttribute('aria-controls') ?? node?.getAttribute('data-mm-key');
				const layerKey = controls ? `${controls} ${t.events.join(',')} ${libraryOnly(t)} ${Boolean(t.changes)}` : undefined;
				let r = memo.get(key) ?? (layerKey ? opens.get(layerKey) : undefined);
				if (!r) {
					r = await trial(sandbox, t, registry, { layers, sited });
					memo.set(key, r);
					if (layerKey && enough(t, r.answer)) opens.set(layerKey, r);
					// Each trial starts from the page as it was rendered, with nothing the last one scheduled still to run.
					if (!libraryOnly(t)) await new Promise((done) => setImmediate(done));
					const changed = dirty || watch.takeRecords().length > 0;
					if (!libraryOnly(t)) await sandbox.settle();
					// Only an app trial's change is undone; library trials come last and share the page.
					if (changed && !libraryOnly(t)) {
						sandbox.show(html);
						doc = sandbox.window.document as unknown as Document;
						index();
						dirty = false;
						observe();
					}
				}
				results[i] = r;
			}
			watch.disconnect();
			out.push(results);
		}
	} finally {
		await sandbox.close();
		process.off('unhandledRejection', swallow);
		process.off('uncaughtException', swallow);
	}
	return out;
}

/** The jobs split over `workers` threads (round-robin by route), each reading the port itself; one thread runs here. */
export async function runJobs(app: string, port: ReadonlyMap<string, PortFile>, jobs: readonly RouteJob[], workers: number): Promise<Result[][]> {
	if (workers <= 1 || jobs.length < 2) return tryRoutes(app, port, jobs);
	const shares = Array.from({ length: Math.min(workers, jobs.length) }, (_, w) => jobs.map((job, j) => ({ job, j })).filter(({ j }) => j % workers === w));
	const out: Result[][] = new Array(jobs.length);
	await Promise.all(
		shares.map(
			(share) =>
				new Promise<void>((resolve, reject) => {
					const worker = new Worker(new URL('./worker.ts', import.meta.url), { workerData: { app, jobs: share.map((s) => s.job) } });
					worker.once('message', (results: Result[][]) => {
						share.forEach(({ j }, i) => (out[j] = results[i]!));
						void worker.terminate();
						resolve();
					});
					worker.once('error', reject);
				}),
		),
	);
	return out;
}

/** What a worker thread runs: its share of the routes, on the port it reads itself. */
export async function workerMain(data: { readonly app: string; readonly jobs: readonly RouteJob[] }): Promise<Result[][]> {
	return tryRoutes(data.app, await readPort(data.app), data.jobs);
}
