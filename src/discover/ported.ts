// Whether the written port has a handler for a press discovery found stateful, asked in the ledger's sandbox (happy-dom).
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { registryOf, Sandbox } from '../ledger/claims.ts';
import { pageOf, readPort, renderRoute } from '../ledger/port.ts';
import { DOCUMENT } from '../ledger/trials.ts';

export interface PortControl {
	readonly sig: string;
	readonly nth: number;
	readonly labelSig?: string;
	readonly pair?: number;
	/** It sits inside a widget a recording ports whole: that widget's own handler around it answers for it. */
	readonly held?: boolean;
}

/** What answered a press on the port: a handler (a site part, the page's own Markless handler), one that threw, none, or the control is not on the port. */
export interface PortAnswer {
	readonly by: 'handler' | 'threw' | 'none' | 'missing';
	readonly where?: string;
}

/** Per route, per sig#nth: what answered its press on the port, asked in a worker thread that alone catches what the port's scripts throw later. */
export async function portAnswers(app: string, wanted: ReadonlyMap<string, readonly PortControl[]>): Promise<Map<string, Map<string, PortAnswer>>> {
	if (!wanted.size) return new Map();
	const worker = new Worker(new URL(import.meta.url), { workerData: { ported: { app, wanted: new Map([...wanted].map(([route, cs]) => [route, cs.map(({ sig, nth, labelSig, pair, held }) => ({ sig, nth, labelSig, pair, held }))])) } } });
	try {
		return await new Promise((done, fail) => {
			worker.once('message', (m: Map<string, Map<string, PortAnswer>>) => done(m));
			worker.once('error', fail);
			worker.once('exit', (code) => fail(new Error(`the port check stopped (exit ${code}) before answering`)));
		});
	} finally {
		await worker.terminate();
	}
}

async function answersIn(app: string, wanted: ReadonlyMap<string, readonly PortControl[]>): Promise<Map<string, Map<string, PortAnswer>>> {
	const out = new Map<string, Map<string, PortAnswer>>();
	const port = await readPort(app);
	const pages = pageOf(port);
	const sandbox = await Sandbox.open(app);
	try {
		for (const [route, controls] of wanted) {
			const answers = new Map<string, PortAnswer>();
			out.set(route, answers);
			const page = pages.get(route);
			if (!page) {
				for (const c of controls) answers.set(`${c.sig}#${c.nth}`, { by: 'missing' });
				continue;
			}
			const registry = await registryOf(app, page);
			const html = renderRoute(port, page, route) + renderRoute(port, DOCUMENT, route);
			let shown = false;
			for (const c of controls) {
				if (!shown) sandbox.show(html);
				shown = true;
				const doc = sandbox.window.document as unknown as Document;
				const target = find(doc, c);
				if (!target) {
					answers.set(`${c.sig}#${c.nth}`, { by: 'missing' });
					continue;
				}
				const watch = new (sandbox.window as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver(() => {});
				watch.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
				let by: PortAnswer = { by: 'none' };
				for (const event of ['click', 'pointerdown', 'keydown']) {
					const answer = await sandbox.answer(target, event, registry, { library: true });
					await sandbox.settle();
					// A Markless handler around the control answers it when it is the recorded widget's own (a day picker's); around
					// anything else it is a demo's recorded uses, which answer only what was recorded: the scene's claim, not this one.
					if (answer.by === 'none' || (answer.by === 'markless' && !c.held && answer.where !== target.getAttribute('data-mm-ledger'))) continue;
					by = answer.by === 'threw' ? { by: 'threw', where: answer.where } : { by: 'handler', where: `${answer.by} ${answer.where}`.trim() };
					break;
				}
				answers.set(`${c.sig}#${c.nth}`, by);
				// The next control is tried on the page as it was rendered.
				if (watch.takeRecords().length) shown = false;
				watch.disconnect();
			}
		}
	} finally {
		await sandbox.close();
	}
	return out;
}

const job = isMainThread ? undefined : (workerData as { ported?: { app: string; wanted: Map<string, PortControl[]> } } | undefined)?.ported;
if (job && parentPort) {
	const reply = parentPort;
	// The port's scripts outside a browser throw later (a missing API): this thread's alone, never the convert's.
	process.on('uncaughtException', () => {});
	process.on('unhandledRejection', () => {});
	reply.postMessage(await answersIn(job.app, job.wanted));
}

/** The element with both of the control's signatures at its occurrence among those, as the original counted them. */
function find(doc: Document, c: PortControl): Element | undefined {
	const label = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const byPair = c.labelSig !== undefined && c.pair !== undefined;
	let n = 0;
	for (const el of doc.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const own = `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
		if (own !== c.sig || (byPair && label(el) !== c.labelSig)) continue;
		if (n++ === (byPair ? c.pair : c.nth)) return el;
	}
	return undefined;
}
