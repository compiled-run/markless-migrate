import type { Browser, Page } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { pageRouting, shownUrl } from './hash-routes.ts';
import { markHandlers } from './handlers.ts';
import { loadPage } from './infrastructure.ts';
import { quiet, type RecordedJourney } from './journeys.ts';
import { installProbe, probeControls, type ProbeControl } from './probe-page.ts';
import { matchParts, partSelectors, type PartSelectors } from './probe-parts.ts';
import type { Failure, Viewport } from './types.ts';
import { clickOnce } from './click.ts';
import { armStateReader, compareStates, readState, type StateReading } from './state-probe.ts';
import { compareRuns, controlKey, describeControl, describeOp, handedOver, itemId, judgeProbes, lines, notifiers, type BorrowedProbe, type Op, type ProbeClass, type ProbeItem, type ProbeResult, type ProbesRow, type Reading, type Sequence } from './probes-compare.ts';

const key = (k: string): Op => ({ op: 'key', key: k });
const item = (n: number, how: 'hover' | 'click'): Op => ({ op: 'item', n, how });
const submenu = (how: 'hover' | 'key'): Op => ({ op: 'submenu', how });
const letters = (n: number): Op[] => Array.from({ length: n }, (_, i) => ({ op: 'typeahead', n: i }));

/** The sequences a control of each class goes through. */
export function sequencesFor(cls: ProbeClass, control: Pick<ProbeControl, 'role'> & { readonly popup?: string }): Sequence[] {
	const s = (name: string, ops: Op[]): Sequence => ({ cls, name, ops });
	const textual = /^(textbox|searchbox|combobox|spinbutton)$/.test(control.role);
	switch (cls) {
		case 'modality':
			// A link is followed by a click, which leaves the page: its ring is checked from the keyboard only.
			return [
				...(control.role === 'link' ? [] : [s(textual ? 'focus ring after typing, then Escape and Tab' : 'focus ring after a click, then Escape and Tab', textual ? [{ op: 'click' }, { op: 'type', text: 'ab' }, key('Escape'), key('Tab'), key('Shift+Tab')] : [{ op: 'click' }, key('Escape'), key('Tab'), key('Shift+Tab')])]),
				s('focus ring after Tab, then the pointer moving and Tab', [{ op: 'tab in' }, key('Escape'), { op: 'leave' }, key('Tab'), key('Shift+Tab')]),
			];
		case 'popup':
			return [
				s('open by pointer, point along its items and away, close by a click outside, reopen, choose by pointer, reopen, close by Escape and its close button', [{ op: 'click' }, item(0, 'hover'), item(1, 'hover'), { op: 'leave' }, { op: 'outside' }, { op: 'click' }, item(0, 'click'), { op: 'click' }, key('Escape'), { op: 'click' }, { op: 'close' }, key('Escape')]),
				// What it shows stays put while it closes, after its list was scrolled: a list that jumps back as the pop-up fades out is seen.
				s('open by pointer, scroll its list, close by a click outside, reopen, scroll, close by Escape', [{ op: 'click' }, { op: 'scroll' }, { op: 'outside' }, { op: 'click' }, { op: 'scroll' }, key('Escape')]),
				// A list (menu, listbox) is typed into; anything else it opens (a dialog, a popover) is tabbed through.
				/^(menu|listbox|true|combobox)$/.test(control.popup ?? (control.role === 'combobox' ? 'combobox' : ''))
					? s('open by pointer, move with ArrowDown, type the first letter of each item, close, reopen and Tab', [{ op: 'click' }, key('ArrowDown'), key('ArrowDown'), ...letters(4), key('Escape'), { op: 'click' }, key('Tab')])
					: s('open by pointer, Tab through it, Escape', [{ op: 'click' }, key('Tab'), key('Tab'), key('Shift+Tab'), key('Escape')]),
				// A menu without a submenu takes none of these steps on either side, which is no difference.
				...(/^(menu|true)$/.test(control.popup ?? '') ? [s('open by pointer, into a submenu by pointer, back with ArrowLeft, into it with ArrowRight, Escape', [{ op: 'click' }, submenu('hover'), key('ArrowLeft'), submenu('key'), key('Escape')])] : []),
			];
		case 'context menu':
			return [
				s('open by right click, point at an item and away, Escape, reopen, close by a click outside, reopen, choose by pointer, reopen and type the first letters of its items', [{ op: 'right click' }, item(1, 'hover'), { op: 'leave' }, key('Escape'), { op: 'right click' }, { op: 'outside' }, { op: 'right click' }, item(0, 'click'), { op: 'right click' }, ...letters(3), key('Escape')]),
				s('open by right click, into a submenu by pointer, back with ArrowLeft, into it with ArrowRight, Escape', [{ op: 'right click' }, submenu('hover'), key('ArrowLeft'), submenu('key'), key('Escape')]),
			];
		case 'toggle':
			return [s('Tab to it, Enter, Space, a click, Enter again, then Tab', [{ op: 'tab in' }, key('Enter'), key('Space'), { op: 'click' }, key('Enter'), key('Tab')]), s('a click on its label, then Space and Tab', [{ op: 'click label' }, key('Space'), key('Tab')])];
		case 'hover':
			// Each step settles once the timeouts due within a second have fired, so an open delay up to a second needs no wait of its own.
			return [
				s('pointer resting on it, leaving and coming back', [{ op: 'hover' }, { op: 'leave' }, { op: 'hover' }, ...(control.role === 'link' ? [] : [{ op: 'click' } as Op]), { op: 'leave' }]),
				s('focus by Tab resting on it, then Escape and Tab', [{ op: 'tab in' }, key('Escape'), key('Tab')]),
			];
		case 'drag':
			return control.role === 'separator'
				? [s('dragged by the pointer both ways', [{ op: 'hover' }, { op: 'drag', dx: 60, dy: 0 }, { op: 'drag', dx: 0, dy: 50 }, { op: 'drag', dx: -120, dy: 0 }, { op: 'leave' }])]
				: control.role === 'slider'
					? [s('dragged by the pointer both ways', [{ op: 'drag', dx: 40, dy: 0 }, { op: 'drag', dx: -90, dy: 0 }, { op: 'leave' }])]
					: [s('swiped by the pointer both ways', [{ op: 'drag', dx: -260, dy: 0 }, { op: 'drag', dx: 260, dy: 0 }, { op: 'leave' }])];
		case 'repeat':
			return [s('used three times in a row, then the pointer resting on what it showed', [{ op: 'click' }, { op: 'click' }, { op: 'click' }, { op: 'point at toasts' }, { op: 'leave' }])];
		case 'tab stops':
			return [s('Tab in, arrows each way, Space, Tab out and back', [{ op: 'tab in' }, key('ArrowRight'), key('ArrowDown'), key('Space'), key('Tab'), key('Shift+Tab'), key('ArrowLeft'), key('ArrowUp')])];
		case 'switch':
			return [s('open it, point at the next trigger, ArrowRight to the one after, ArrowLeft back, Escape', [{ op: 'click' }, { op: 'next trigger' }, key('ArrowRight'), key('ArrowLeft'), key('Escape')])];
	}
}

const STEP_TIMEOUT = 2_500;
const MARK = '[data-markless-migrate-probe]';
const AIM = '[data-markless-migrate-aim]';

type ProbeWindow = { __markless_migrate_probe__?: { read(): Reading; outside(): { x: number; y: number } | null; aim(what: string): boolean; letter(n: number): string } };
// Keys are held as a person holds them: Radix moves a radio group's focus in a timeout and checks the radio only while the key is still down.
const HOLD_MS = 60;
const ON_CONTROL = new Set<Op['op']>(['click', 'right click', 'click label', 'tab in', 'hover', 'drag']);
const DESTRUCTIVE = /\b(log ?out|sign ?out|delete|remove|destroy|unsubscribe|deactivate)\b/i;

interface Side {
	readonly page: Page;
	readonly close: () => Promise<void>;
	readonly inflight: () => number;
}

async function openSide(browser: Browser, env: SideEnv, viewport: Viewport): Promise<Side> {
	const { context, page } = await openPage(browser, env, viewport, { sameOriginOnly: true });
	const pending = new Set<unknown>();
	page.on('request', (r) => pending.add(r));
	page.on('requestfinished', (r) => pending.delete(r));
	page.on('requestfailed', (r) => pending.delete(r));
	page.on('dialog', (d) => void d.dismiss().catch(() => {}));
	return { page, close: () => context.close(), inflight: () => pending.size };
}

async function settle(side: Side): Promise<void> {
	await quiet(side.page, side.inflight);
}

const read = (page: Page) =>
	page
		.evaluate(() => (globalThis as ProbeWindow).__markless_migrate_probe__?.read() ?? { control: 'not read' })
		.then((reading) => (pageRouting(page) && 'url' in reading ? { ...reading, url: here(page) } : reading))
		.catch((error: Error) => ({ control: `not read: ${error.message.split('\n')[0]}` }) as Reading);
const here = (page: Page) => {
	const at = new URL(shownUrl(page));
	return at.pathname + at.search;
};

/** Marks the control the probe drives; one still marked is kept unless `again`, as a step may have renamed it (a combobox showing its choice). */
async function mark(page: Page, control: ProbeControl, again = false): Promise<boolean> {
	if (!again && (await page.locator(MARK).count().catch(() => 0))) return true;
	await page.evaluate(probeControls, { notify: [], mark: controlKey(control) }).catch(() => {});
	return (await page.locator(MARK).count().catch(() => 0)) > 0;
}

async function perform(side: Side, control: ProbeControl, op: Op): Promise<void> {
	const page = side.page;
	if (!(await mark(page, control)) && ON_CONTROL.has(op.op)) throw new Error('the control is not on the page');
	const target = page.locator(MARK).first();
	const aim = async (what: string) => {
		if (!(await page.evaluate((w) => (globalThis as ProbeWindow).__markless_migrate_probe__?.aim(w) ?? false, what).catch(() => false))) return undefined;
		return page.locator(AIM).first();
	};
	const away = async () => (await page.evaluate(() => (globalThis as ProbeWindow).__markless_migrate_probe__?.outside() ?? null).catch(() => null)) ?? { x: 2, y: 2 };
	switch (op.op) {
		case 'click':
			return clickOnce(target, { timeout: STEP_TIMEOUT }).catch(() => clickOnce(target, { timeout: STEP_TIMEOUT, force: true }));
		case 'right click':
			return target.click({ button: 'right', timeout: STEP_TIMEOUT });
		case 'click label': {
			const label = await aim('label');
			if (!label) throw new Error('it has no label');
			return clickOnce(label, { timeout: STEP_TIMEOUT });
		}
		case 'item': {
			const found = await aim(`item ${op.n}`);
			if (!found) throw new Error(`nothing open has an item ${op.n + 1}`);
			if (op.how === 'hover') return found.hover({ timeout: STEP_TIMEOUT });
			if (DESTRUCTIVE.test((await found.textContent({ timeout: STEP_TIMEOUT }).catch(() => '')) ?? '')) throw new Error('left alone: it ends the session or deletes');
			return clickOnce(found, { timeout: STEP_TIMEOUT });
		}
		case 'scroll': {
			const found = await aim('scroller');
			if (!found) throw new Error('nothing open has a list that scrolls');
			await found.hover({ timeout: STEP_TIMEOUT });
			return page.mouse.wheel(0, 240);
		}
		case 'next trigger': {
			const found = await aim('next trigger');
			if (!found) throw new Error('no next trigger');
			return found.hover({ timeout: STEP_TIMEOUT });
		}
		case 'submenu': {
			const found = await aim('submenu');
			if (!found) throw new Error('nothing open has an item that opens a submenu');
			if (op.how === 'hover') return found.hover({ timeout: STEP_TIMEOUT });
			await found.focus({ timeout: STEP_TIMEOUT });
			return page.keyboard.press('ArrowRight', { delay: HOLD_MS });
		}
		case 'typeahead': {
			const letter = await page.evaluate((n) => (globalThis as ProbeWindow).__markless_migrate_probe__?.letter(n) ?? '', op.n).catch(() => '');
			if (!letter) throw new Error(`nothing open has an item ${op.n + 1} with a letter of its own`);
			return page.keyboard.press(letter, { delay: HOLD_MS });
		}
		case 'tab in': {
			const before = await aim('before');
			if (before) await before.focus({ timeout: STEP_TIMEOUT });
			else await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
			return page.keyboard.press('Tab', { delay: HOLD_MS });
		}
		case 'hover':
			return target.hover({ timeout: STEP_TIMEOUT });
		case 'leave': {
			const p = await away();
			return page.mouse.move(p.x, p.y, { steps: 4 });
		}
		case 'outside': {
			const p = await away();
			return page.mouse.click(p.x, p.y);
		}
		case 'close': {
			const button = await aim('close');
			if (!button) throw new Error('no open dialog with a close button');
			return clickOnce(button, { timeout: STEP_TIMEOUT });
		}
		case 'point at toasts': {
			const toaster = await aim('toaster');
			if (!toaster) throw new Error('nothing shown to point at');
			return toaster.hover({ timeout: STEP_TIMEOUT });
		}
		case 'key':
			return page.keyboard.press(op.key, { delay: HOLD_MS });
		case 'type':
			return page.keyboard.type(op.text, { delay: 30 });
		case 'drag': {
			const role = await target.getAttribute('role', { timeout: STEP_TIMEOUT }).catch(() => null);
			const handle = (await aim(role === 'slider' || (await target.evaluate((e) => e instanceof HTMLInputElement && e.type === 'range', undefined, { timeout: STEP_TIMEOUT }).catch(() => false)) ? 'thumb' : role === 'separator' ? 'none' : 'track')) ?? target;
			const box = await handle.boundingBox({ timeout: STEP_TIMEOUT });
			if (!box) throw new Error('it has no box to drag');
			const x = box.x + box.width / 2;
			const y = box.y + box.height / 2;
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + op.dx / 2, y + op.dy / 2, { steps: 4 });
			await page.mouse.move(x + op.dx, y + op.dy, { steps: 4 });
			return page.mouse.up();
		}
	}
}

/** Runs one sequence on one side from a fresh load of the route; stops after a step that leaves the page. */
async function runSequence(side: Side, origin: string, route: string, control: ProbeControl, sequence: Sequence, parts: readonly PartSelectors[], found: Set<string>, states?: StateReading[]): Promise<Reading[]> {
	const page = side.page;
	await loadPage(page, new URL(route, origin).href);
	await settle(side);
	await page.evaluate(installProbe);
	await page.mouse.move(1, 1);
	if (!(await mark(page, control))) return [{ control: 'not on the page' }];
	if (states) await armStateReader(page);
	const out: Reading[] = [await read(page)];
	if (states) states.push(await readState(page));
	for (const op of sequence.ops) {
		let failed: string | undefined;
		try {
			await perform(side, control, op);
		} catch (error) {
			failed = (error as Error).message.split('\n')[0]!.slice(0, 160);
		}
		await settle(side);
		// A step that loaded another document leaves the probe behind: it is put back to read the page it landed on.
		await page.evaluate(installProbe).catch(() => {});
		const reading = await read(page);
		out.push(failed ? { ...reading, step: `could not ${describeOp(op)}: ${failed}` } : reading);
		if (states) states.push(await readState(page, states.at(-1)));
		if (parts.length) for (const file of await page.evaluate(matchParts, parts).catch(() => [] as string[])) found.add(file);
		if (new URL(shownUrl(page)).pathname !== new URL(route, origin).pathname) break;
	}
	return out;
}

export interface ProbeOptions {
	/** Steps the probes of one route may take, each sequence's page load counting as one: sequences past them are reported as not exercised. */
	readonly maxSteps?: number;
	/** At most this many controls a route, one of each kind per class first. */
	readonly maxControls?: number;
	/** Control pairs (an old and a new page each) probed at once. */
	readonly concurrency?: number;
	/** Shared across the routes of a run: a widget is probed on the first route that renders it, keyed by its class, kind, name and its widget's print on both pages; the routes rendering the same widget take that result. */
	readonly shared?: Map<string, SharedProbe>;
	/** Each sequence's state readings, old and new, as read: for measuring the state probe's noise. */
	readonly onStates?: (old: readonly StateReading[], next: readonly StateReading[]) => void;
}

/** A widget one route probes for every route that renders it the same way. */
export interface SharedProbe {
	readonly route: string;
	readonly result: Promise<{ readonly state: string; readonly failures: readonly Failure[] }>;
}

const SAMPLES = 1;
const LAYOUT = new Set(['header', 'banner', 'nav', 'navigation', 'aside', 'complementary', 'footer', 'contentinfo']);
const DEFAULT_MAX = 40;
const MIN_BUDGET_MS = 60_000;
// A popup control's two sequences, with the old side's second run, take about 30 s one pair at a time.
const PER_CONTROL_MS = 30_000;
const MAX_BUDGET_MS = 600_000;
// A step takes one pair 0.7 to 1.3 s by the runner (A/A runs 41480429505 and 41553969320), so the budget is counted in steps, never timed.
const STEP_MS = 1_000;
const stepsOf = (sequence: Sequence) => sequence.ops.length + 1;

/** Which sequences, in queue order, fit in what is left of the allowance: decided before any is driven, so however long each takes. */
export function admitSteps(sequences: readonly Sequence[], allowance: number, spent = 0): { admitted: boolean[]; spent: number } {
	const admitted = sequences.map((sequence) => {
		if (spent + stepsOf(sequence) > allowance) return false;
		spent += stepsOf(sequence);
		return true;
	});
	return { admitted, spent };
}

/** How many steps a route's probes may take: about the time its controls were given, by the time a step takes. */
export function probeSteps(controls: number, pairs: number): number {
	return Math.round((Math.min(MAX_BUDGET_MS, Math.max(MIN_BUDGET_MS, (controls * PER_CONTROL_MS) / pairs)) * pairs) / STEP_MS);
}

/** Probes the route's controls, class by class, old against new, and judges what they read (probes-compare.ts). */
export async function checkProbes(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport, journeys?: readonly RecordedJourney[], options: ProbeOptions = {}): Promise<ProbeResult> {
	return judgeProbes(route, await observeProbes(browser, sides, route, viewport, notifiers(journeys), options));
}

/** Drives the route's controls, class by class, on the old and the new page and reads each step; the old side runs twice where the first runs differ. */
export async function observeProbes(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport, notify: readonly string[], options: ProbeOptions = {}): Promise<ProbesRow> {
	const started = Date.now();
	const parts = await partSelectors();
	const scanNew = options.shared ? openSide(browser, sides.new, viewport).then(async (side) => {
		await loadPage(side.page, new URL(route, sides.new.origin).href);
		await settle(side);
		await side.page.evaluate(installProbe);
		return side;
	}) : undefined;
	let found: ProbeControl[];
	const prints = new Map<string, { old?: string; new?: string }>();
	const scan = await openSide(browser, sides.old, viewport);
	try {
		await loadPage(scan.page, new URL(route, sides.old.origin).href);
		await settle(scan);
		await markHandlers(scan.page);
		const opened = await discover(scan, sides.old.origin, route, await scan.page.evaluate(probeControls, { notify: [...notify] }));
		await loadPage(scan.page, new URL(route, sides.old.origin).href);
		await settle(scan);
		await markHandlers(scan.page);
		found = await scan.page.evaluate(probeControls, { notify: [...notify], found: opened });
		if (scanNew) {
			const keys = found.map(controlKey);
			await scan.page.evaluate(installProbe);
			for (const c of await scan.page.evaluate(probeControls, { notify: [...notify], prints: keys })) prints.set(controlKey(c), { old: c.print });
			const side = await scanNew.catch(() => undefined);
			for (const c of side ? await side.page.evaluate(probeControls, { notify: [...notify], prints: keys }).catch(() => [] as ProbeControl[]) : []) prints.set(controlKey(c), { ...prints.get(controlKey(c)), new: c.print });
		}
	} finally {
		await Promise.all([scan.close(), scanNew?.then((side) => side.close(), () => {})]);
	}
	const listed: ProbesRow['listed'][number][] = [];
	const work: { control: ProbeControl; sequence: Sequence }[] = [];
	const kinds = new Map<string, number>();
	const max = options.maxControls ?? DEFAULT_MAX;
	const probed = new Set<string>();
	const owned = new Map<string, (result: { state: string; failures: readonly Failure[] }) => void>();
	const borrowing: { control: ProbeControl; cls: ProbeClass; from: SharedProbe }[] = [];
	for (const control of found) {
		for (const cls of control.classes as ProbeClass[]) {
			const kind = `${cls}|${control.kind}`;
			const seen = kinds.get(kind) ?? 0;
			kinds.set(kind, seen + 1);
			const named = describeControl(control);
			const print = prints.get(controlKey(control));
			const widget = print?.old && print.new ? `${kind}|${control.role}|${control.name}|${print.old}|${print.new}` : undefined;
			const owner = widget ? options.shared?.get(widget) : undefined;
			if (seen >= SAMPLES) {
				listed.push({ control: named, cls, state: 'alike: the first of its kind was probed' });
				continue;
			}
			if (owner && owner.route !== route) {
				borrowing.push({ control, cls, from: owner });
				continue;
			}
			if (!probed.has(controlKey(control)) && probed.size >= max) {
				listed.push({ control: named, cls, state: `left out: over ${max} controls` });
				continue;
			}
			probed.add(controlKey(control));
			if (widget && options.shared && !owner) {
				let resolve!: (result: { state: string; failures: readonly Failure[] }) => void;
				options.shared.set(widget, { route, result: new Promise((done) => (resolve = done)) });
				owned.set(itemId(control, cls), resolve);
			}
			for (const sequence of sequencesFor(cls, control)) work.push({ control, sequence });
		}
	}
	const pairs = Math.max(1, options.concurrency ?? 2);
	const allowance = options.maxSteps ?? probeSteps(probed.size, pairs);
	let spent = 0;
	const items: ProbeItem[] = [];
	const drive = async (phase: ProbeItem['phase'], queued: readonly { control: ProbeControl; sequence: Sequence }[]) => {
		if (!queued.length) return;
		const admitted = admitSteps(queued.map((q) => q.sequence), allowance, spent);
		spent = admitted.spent;
		const queue = queued.map((item, at) => ({ ...item, at, admitted: admitted.admitted[at]! }));
		const worker = async () => {
			const sides2 = { old: await openSide(browser, sides.old, viewport), new: await openSide(browser, sides.new, viewport) };
			try {
				for (let item = queue.shift(); item; item = queue.shift()) {
					const { control, sequence, at } = item;
					if (!item.admitted) {
						items.push({ phase, queue: at, control, sequence, read: { leftOut: `left out: the probes' ${allowance}-step budget ran out` } });
						continue;
					}
					const files = new Set<string>();
					const began = Date.now();
					const oldStates: StateReading[] = [];
					const newStates: StateReading[] = [];
					const [old, next] = await Promise.all([runSequence(sides2.old, sides.old.origin, route, control, sequence, [], new Set(), oldStates), runSequence(sides2.new, sides.new.origin, route, control, sequence, parts, files, newStates)]);
					options.onStates?.(oldStates, newStates);
					let again: Reading[] | undefined;
					let againStates: StateReading[] | undefined;
					const leftNew = old[0]?.control !== 'not on the page' && next[0]?.control === 'not on the page';
					if (!leftNew && (compareRuns(old, next).some((d) => d.length) || compareStates(oldStates, newStates).some((d) => d.length))) {
						againStates = [];
						again = await runSequence(sides2.old, sides.old.origin, route, control, sequence, [], new Set(), againStates);
					}
					items.push({ phase, queue: at, control, sequence, read: { old, next, oldStates, newStates, ...(again ? { again, againStates } : {}), files: [...files], ms: Date.now() - began } });
				}
			} finally {
				await Promise.all([sides2.old.close(), sides2.new.close()]);
			}
		};
		await Promise.all(Array.from({ length: Math.max(1, Math.min(pairs, queued.length)) }, worker));
	};
	// What this route drove is handed to the routes waiting on it before it waits on any other route, so no two routes wait on each other.
	const handOver = (why?: string) => {
		const done = why ? undefined : handedOver(route, items);
		for (const [id, resolve] of owned) resolve(why ? { state: why, failures: [] } : (done!.get(id) ?? { state: 'probed', failures: [] }));
		owned.clear();
	};
	let stopped = true;
	try {
		await drive('work', work);
		stopped = false;
	} finally {
		handOver(stopped ? `left out: the probes of ${route} stopped before driving it` : undefined);
	}
	// A widget the route it was first seen on could not drive is driven here.
	const orphans: { control: ProbeControl; sequence: Sequence }[] = [];
	const borrowed: BorrowedProbe[] = [];
	for (const { control, cls, from } of borrowing) {
		const { state: done, failures } = await from.result;
		borrowed.push({ control, cls, from: from.route, state: done, failures });
		if (done.startsWith('left out') || done.startsWith('not found')) for (const sequence of sequencesFor(cls, control)) orphans.push({ control, sequence });
	}
	await drive('orphans', orphans);
	return { listed, items, borrowed, ms: Date.now() - started };
}

const DISCOVER_MAX = 24;

/**
 * On the old page, clicks each button of a distinct name that says nothing of what it does (no aria-haspopup, not a toggle, not
 * in a shared layout, not one that ends the session or deletes) once, and keeps what it did: opened a dialog, menu, listbox or
 * popover (it gets the popup probe), or showed a toast (the repeat probe). React Aria's dialog trigger carries no aria-haspopup.
 */
async function discover(side: Side, origin: string, route: string, controls: readonly ProbeControl[]): Promise<Record<string, string[]>> {
	const page = side.page;
	const out: Record<string, string[]> = {};
	const names = new Set<string>();
	const candidates = controls.filter((c) => c.role === 'button' && !c.classes.some((k) => k === 'popup' || k === 'toggle' || k === 'repeat') && !LAYOUT.has(c.region) && !DESTRUCTIVE.test(c.name) && !names.has(c.name) && names.add(c.name)).slice(0, DISCOVER_MAX);
	if (!candidates.length) return out;
	const fresh = async () => {
		await loadPage(page, new URL(route, origin).href);
		await settle(side);
		await page.evaluate(installProbe);
	};
	await page.evaluate(installProbe);
	for (const control of candidates) {
		if (!(await mark(page, control, true))) continue;
		const before = await read(page);
		const clicked = await clickOnce(page.locator(MARK).first(), { timeout: 1_500 }).then(() => true, () => false);
		await settle(side);
		if (new URL(shownUrl(page)).pathname !== new URL(route, origin).pathname) {
			await fresh();
			continue;
		}
		const after = await read(page);
		const opened = clicked && lines(after.open).some((o) => !lines(before.open).includes(o));
		const shownToasts = (r: Reading) => Number(/^(\d+) shown/.exec(String(r.toasts ?? ''))?.[1] ?? 0);
		const toasted = clicked && shownToasts(after) > shownToasts(before);
		const key = controlKey(control);
		if (opened) out[key] = ['popup'];
		if (toasted) out[key] = [...(out[key] ?? []), 'repeat'];
		if (opened) {
			await page.keyboard.press('Escape', { delay: HOLD_MS });
			await settle(side);
			if (lines((await read(page)).open).some((o) => !lines(before.open).includes(o))) await fresh();
		}
	}
	return out;
}

