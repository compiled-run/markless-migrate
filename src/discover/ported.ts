// Whether the written port answers a press on a control discovery found stateful: the ledger's sandbox (the port's own
// markup and parts in happy-dom) offers the press to the page's Markless handlers and parts, as the parts runtime does.
import { registryOf, Sandbox } from '../ledger/claims.ts';
import { pageOf, readPort, renderRoute } from '../ledger/port.ts';
import { DOCUMENT } from '../ledger/trials.ts';

export interface PortControl {
	readonly sig: string;
	readonly nth: number;
	readonly labelSig?: string;
	readonly pair?: number;
}

/** Per route, per sig#nth: what answered its press on the port (`site part 3`, a Markless handler's file), `none`, or `not on the port`. */
export async function portAnswers(app: string, wanted: ReadonlyMap<string, readonly PortControl[]>): Promise<Map<string, Map<string, string>>> {
	const out = new Map<string, Map<string, string>>();
	if (!wanted.size) return out;
	const port = await readPort(app);
	const pages = pageOf(port);
	const sandbox = await Sandbox.open(app);
	const swallow = () => {};
	process.on('unhandledRejection', swallow);
	process.on('uncaughtException', swallow);
	try {
		for (const [route, controls] of wanted) {
			const answers = new Map<string, string>();
			out.set(route, answers);
			const page = pages.get(route);
			if (!page) {
				for (const c of controls) answers.set(`${c.sig}#${c.nth}`, 'not on the port');
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
					answers.set(`${c.sig}#${c.nth}`, 'not on the port');
					continue;
				}
				const watch = new (sandbox.window as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver(() => {});
				watch.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
				let by = 'none';
				for (const event of ['click', 'pointerdown', 'keydown']) {
					const answer = await sandbox.answer(target, event, registry, { library: true });
					await sandbox.settle();
					// A Markless handler around the control (a demo's recorded uses, played from its container) answers only what
					// was recorded: that is the scene's claim to make, not this one's.
					if (answer.by === 'none' || (answer.by === 'markless' && answer.where !== target.getAttribute('data-mm-ledger'))) continue;
					by = answer.by === 'threw' ? `${answer.where} (threw outside a browser)` : `${answer.by} ${answer.where}`.trim();
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
		process.off('unhandledRejection', swallow);
		process.off('uncaughtException', swallow);
	}
	return out;
}

/**
 * The element with both of the control's signatures (tag|data-slot|text and tag|data-slot|label) at its occurrence among
 * those, as the original counted them; by its text signature alone where only that is known.
 */
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
