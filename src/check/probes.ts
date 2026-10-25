import type { Browser, Page } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { markHandlers } from './handlers.ts';
import { loadPage } from './infrastructure.ts';
import { quiet, type RecordedJourney } from './journeys.ts';
import { installProbe, probeControls, type ProbeControl } from './probe-page.ts';
import { matchParts, partSelectors, type PartSelectors } from './probe-parts.ts';
import type { Dimension, Failure, Viewport } from './types.ts';

/**
 * Widget probes: one control of each kind, in each class of widget behaviour, is driven through its class's short sequence on
 * the old and the new page side by side, and what a visitor meets is read after every step: where focus is and whether its ring
 * shows, the state attributes of the control and its widget, what is open, the toasts, tab stops and page lock.
 */
export type ProbeClass = 'modality' | 'popup' | 'hover' | 'drag';

export type Op =
	| { readonly op: 'click' | 'tab in' | 'hover' | 'leave' | 'outside' | 'close' }
	/** The n-th item of the list that is open: pointed at or clicked. */
	| { readonly op: 'item'; readonly n: number; readonly how: 'hover' | 'click' }
	/** The first letter of the n-th item whose first letter is new, pressed as typeahead. */
	| { readonly op: 'typeahead'; readonly n: number }
	| { readonly op: 'key'; readonly key: string }
	| { readonly op: 'type'; readonly text: string }
	| { readonly op: 'drag'; readonly dx: number; readonly dy: number };

export interface Sequence {
	readonly cls: ProbeClass;
	readonly name: string;
	readonly ops: readonly Op[];
}

/** What a visitor meets after a step, field by field; lists are compared line by line. */
export type Reading = Readonly<Record<string, string | readonly string[]>>;

const key = (k: string): Op => ({ op: 'key', key: k });
const item = (n: number, how: 'hover' | 'click'): Op => ({ op: 'item', n, how });
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
				// A list (menu, listbox) is typed into; anything else it opens (a dialog, a popover) is tabbed through.
				/^(menu|listbox|true|combobox)$/.test(control.popup ?? (control.role === 'combobox' ? 'combobox' : ''))
					? s('open by pointer, move with ArrowDown, type the first letter of each item, close, reopen and Tab', [{ op: 'click' }, key('ArrowDown'), key('ArrowDown'), ...letters(4), key('Escape'), { op: 'click' }, key('Tab')])
					: s('open by pointer, Tab through it, Escape', [{ op: 'click' }, key('Tab'), key('Tab'), key('Shift+Tab'), key('Escape')]),
			];
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
	}
}

export function describeOp(op: Op): string {
	switch (op.op) {
		case 'click':
			return 'click it';
		case 'item':
			return `${op.how === 'hover' ? 'point at' : 'click'} item ${op.n + 1} of what is open`;
		case 'typeahead':
			return `type the first letter of item ${op.n + 1} (by distinct first letter) of what is open`;
		case 'tab in':
			return 'Tab to it from the control before it';
		case 'hover':
			return 'point at it';
		case 'leave':
			return 'move the pointer away';
		case 'outside':
			return 'click outside it and what it opened';
		case 'close':
			return "click the open dialog's close button";
		case 'key':
			return `press ${op.key}`;
		case 'type':
			return `type "${op.text}"`;
		case 'drag':
			return `drag it ${op.dx ? `${Math.abs(op.dx)} px ${op.dx > 0 ? 'right' : 'left'}` : `${Math.abs(op.dy)} px ${op.dy > 0 ? 'down' : 'up'}`}`;
	}
}

const DIMENSION: Record<ProbeClass, Dimension> = { modality: 'a11y', popup: 'behaviour', hover: 'behaviour', drag: 'behaviour' };

export const PROBE_HINTS: Record<ProbeClass, string> = {
	modality: 'Whether the focus ring shows follows how the visitor last moved: a key press (Tab, an arrow, Escape) shows it, a pointer press hides it, and typing into a text field or moving the mouse leaves it as it was. Track the modality on the document the way the old library does (keydown before pointerdown), not per control, and set the same marker (data-focus-visible or :focus-visible) on the element that has focus.',
	popup: 'What this control opens must answer as on the old page: the item the pointer is on is highlighted and the highlight goes when the pointer leaves or the list closes, so a reopened list starts fresh; a list opened by the pointer takes focus so ArrowDown moves in it, and Tab closes it; a typed letter moves to the item it starts; a hidden form input follows the chosen value; a reopened overlay is visible and its content rendered once; Tab inside a non-modal popover moves on as the old one does, a modal one keeps focus in. Opening and closing by the pointer must leave focus where the old page leaves it: on open, in the pop-up or its first item as the old library chooses; after Escape or the close button, back on the control; after a click outside, where the old page put it (the control for a modal, the clicked spot for a non-modal). Lock scrolling and hide the rest of the page only while the old page does.',
	hover: 'The pointer resting on this control (or focus reaching it) shows something on the old page, or marks it hovered: open it after the same delay, keep it while the pointer is on it, close it when the pointer leaves, and set the same hover markers (data-hovered, data-state).',
	drag: 'A pointer drag moves this control on the old page: follow the pointer (pointerdown, pointermove, pointerup), move the value, panel or slide by the same amount, take focus as the old one does, and leave the same state attributes after release.',
};

const STEP_TIMEOUT = 2_500;
const MARK = '[data-markless-migrate-probe]';
const AIM = '[data-markless-migrate-aim]';

type ProbeWindow = { __markless_migrate_probe__?: { read(): Reading; outside(): { x: number; y: number } | null; aim(what: string): boolean; letter(n: number): string } };
// Keys are held as a person holds them: Radix moves a radio group's focus in a timeout and checks the radio only while the key is still down.
const HOLD_MS = 60;
const ON_CONTROL = new Set<Op['op']>(['click', 'tab in', 'hover', 'drag']);
const DESTRUCTIVE = /\b(log ?out|sign ?out|delete|remove|destroy|unsubscribe|deactivate)\b/i;

const controlKey = (c: Pick<ProbeControl, 'role' | 'name' | 'nth'>) => `${c.role}|${c.name.replace(/\s+/g, '')}|${c.nth}`;

export function describeControl(c: Pick<ProbeControl, 'role' | 'name' | 'nth'>): string {
	return `${c.role}${c.name ? ` "${c.name.slice(0, 60)}"` : ''}${c.nth ? ` #${c.nth + 1}` : ''}`;
}

/** One sequence's readings on one side: the reading after load first, then one per step; a step that could not be done carries `step`. */
export type Run = readonly Reading[];

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

const read = (page: Page) => page.evaluate(() => (globalThis as ProbeWindow).__markless_migrate_probe__?.read() ?? { control: 'not read' }).catch((error: Error) => ({ control: `not read: ${error.message.split('\n')[0]}` }) as Reading);

/** Marks the control the probe drives; one still marked is kept unless `again`, as a step may have renamed it (a combobox showing its choice). */
async function mark(page: Page, control: ProbeControl, again = false): Promise<boolean> {
	if (!again && (await page.locator(MARK).count().catch(() => 0))) return true;
	await page.evaluate(probeControls, { mark: controlKey(control) }).catch(() => {});
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
			return target.click({ timeout: STEP_TIMEOUT }).catch(() => target.click({ timeout: STEP_TIMEOUT, force: true }));
		case 'item': {
			const found = await aim(`item ${op.n}`);
			if (!found) throw new Error(`nothing open has an item ${op.n + 1}`);
			if (op.how === 'hover') return found.hover({ timeout: STEP_TIMEOUT });
			if (DESTRUCTIVE.test((await found.textContent({ timeout: STEP_TIMEOUT }).catch(() => '')) ?? '')) throw new Error('left alone: it ends the session or deletes');
			return found.click({ timeout: STEP_TIMEOUT });
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
			return button.click({ timeout: STEP_TIMEOUT });
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
async function runSequence(side: Side, origin: string, route: string, control: ProbeControl, sequence: Sequence, parts: readonly PartSelectors[], found: Set<string>): Promise<Reading[]> {
	const page = side.page;
	await loadPage(page, new URL(route, origin).href);
	await settle(side);
	await page.evaluate(installProbe);
	await page.mouse.move(1, 1);
	if (!(await mark(page, control))) return [{ control: 'not on the page' }];
	const out: Reading[] = [await read(page)];
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
		if (parts.length) for (const file of await page.evaluate(matchParts, parts).catch(() => [] as string[])) found.add(file);
		if (new URL(page.url()).pathname !== new URL(route, origin).pathname) break;
	}
	return out;
}

export interface FieldDiff {
	readonly field: string;
	readonly old: string;
	readonly new: string;
}

const lines = (v: string | readonly string[] | undefined): readonly string[] => (v === undefined ? [] : typeof v === 'string' ? [v] : v);
const isList = (r: Reading, field: string) => Array.isArray(r[field]);
// A swipe's momentum carries a track a pixel or two further on one load than another (offsets agree within 2 px or 2%); scroll positions within 40 px are layout noise.
const near = (a: string, b: string, tolerance: number) => {
	const na = a.match(/-?\d+(\.\d+)?/g) ?? [];
	const nb = b.match(/-?\d+(\.\d+)?/g) ?? [];
	return a.replace(/-?\d+(\.\d+)?/g, '#') === b.replace(/-?\d+(\.\d+)?/g, '#') && na.length === nb.length && na.every((n, i) => Math.abs(Number(n) - Number(nb[i])) <= Math.max(tolerance, Math.abs(Number(n)) * 0.02));
};
// Fields that read a library's own markup, which a port may write another way at load; focus, tab stops and what is open are the visitor's.
const MARKUP = new Set(['control', 'widget', 'widget text', 'around', 'hovered', 'moved', 'form']);
const skeleton = (line: string) => line.replace(/\d+/g, '#');
const TOLERANCE: Record<string, number> = { moved: 2, scroll: 40 };
const same = (field: string, a: string, b: string) => a === b || (TOLERANCE[field] !== undefined && near(a, b, TOLERANCE[field]!));
const minus = (field: string, a: readonly string[], b: readonly string[]) => a.filter((x) => !b.some((y) => same(field, x, y)));

/**
 * The fields that differ at each step, old against new. A difference the two pages already had at load (markup a port writes
 * another way) is the rendered check's and left out unless the step changes it on one side only; with a second old run, what
 * differs between the two old runs at a step is noise there.
 */
export function compareRuns(old: Run, next: Run, again?: Run): FieldDiff[][] {
	const out: FieldDiff[][] = [];
	const o0 = old[0] ?? {};
	const n0 = next[0] ?? {};
	for (let k = 1; k < old.length; k++) {
		const o = old[k]!;
		const n = next[k];
		const diffs: FieldDiff[] = [];
		// A step neither page could take (pointing at an item of a dialog that has none) is no difference; one only old could not take ends the comparison.
		if (o.step && o.step !== n?.step) break;
		if (!n) {
			diffs.push({ field: 'step', old: 'done', new: 'the sequence stopped before this step' });
			out.push(diffs);
			continue;
		}
		const a = again?.[k];
		for (const field of new Set([...Object.keys(o), ...Object.keys(n)])) {
			if (field === 'step') continue;
			if (isList(o, field) || isList(n, field)) {
				// A line that varied between the two old runs may vary on new too, in the digits that varied there.
				const noise = a ? [...minus(field, lines(o[field]), lines(a[field])), ...minus(field, lines(a[field]), lines(o[field]))].map(skeleton) : [];
				const staticOld = MARKUP.has(field) ? minus(field, lines(o0[field]), lines(n0[field])) : [];
				const staticNew = MARKUP.has(field) ? minus(field, lines(n0[field]), lines(o0[field])) : [];
				const missing = minus(field, minus(field, lines(o[field]), lines(n[field])), staticOld).filter((l) => !noise.includes(skeleton(l)));
				const extra = minus(field, minus(field, lines(n[field]), lines(o[field])), staticNew).filter((l) => !noise.includes(skeleton(l)));
				if (missing.length || extra.length) diffs.push({ field, old: missing.join('; ') || '(nothing else)', new: extra.join('; ') || '(not this)' });
				continue;
			}
			const ov = String(o[field] ?? '(none)');
			const nv = String(n[field] ?? '(none)');
			if (same(field, ov, nv)) continue;
			if (a && !same(field, ov, String(a[field] ?? '(none)'))) continue;
			const ob = String(o0[field] ?? '(none)');
			const nb = String(n0[field] ?? '(none)');
			if (MARKUP.has(field) && !same(field, ob, nb) && same(field, ov, ob) === same(field, nv, nb)) continue;
			diffs.push({ field, old: ov, new: nv });
		}
		// A step only one side reports trouble with (a click Playwright found unsteady) is a difference only when what a visitor meets differs too.
		if (n.step && n.step !== o.step && diffs.length) diffs.unshift({ field: 'step', old: 'done', new: String(n.step) });
		out.push(diffs);
	}
	return out;
}

export interface ProbeOptions {
	/** Wall-clock time the probes of one route may take; controls not probed by then are reported as not exercised. */
	readonly budgetMs?: number;
	/** At most this many controls a route, one of each kind per class first. */
	readonly maxControls?: number;
	/** Control pairs (an old and a new page each) probed at once. */
	readonly concurrency?: number;
	/** Shared across the routes of a run: a control of a shared header, nav, sidebar or footer is probed on the first route that has it, keyed by its kind and name. */
	readonly layout?: Map<string, string>;
}

export interface ProbeResult {
	readonly failures: Failure[];
	/** Each probed control and class: `probed`, `alike` (another control of its kind stood for it), or why it was not. */
	readonly controls: readonly { readonly control: string; readonly cls: ProbeClass; readonly state: string; readonly ms?: number }[];
	readonly ms: number;
}

const SAMPLES = 1;
const LAYOUT = new Set(['header', 'banner', 'nav', 'navigation', 'aside', 'complementary', 'footer', 'contentinfo']);
const DEFAULT_MAX = 40;
const MIN_BUDGET_MS = 60_000;
// A popup control's two sequences, with the old side's second run, take about 30 s one pair at a time.
const PER_CONTROL_MS = 30_000;
const MAX_BUDGET_MS = 600_000;

/** Probes the route's controls, class by class, old against new; the old side runs twice where the first runs differ. */
export async function checkProbes(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport, journeys?: readonly RecordedJourney[], options: ProbeOptions = {}): Promise<ProbeResult> {
	const started = Date.now();
	const parts = await partSelectors();
	const scan = await openSide(browser, sides.old, viewport);
	let found: ProbeControl[];
	try {
		await loadPage(scan.page, new URL(route, sides.old.origin).href);
		await settle(scan);
		await markHandlers(scan.page);
		const opened = await discover(scan, sides.old.origin, route, await scan.page.evaluate(probeControls, {}));
		await loadPage(scan.page, new URL(route, sides.old.origin).href);
		await settle(scan);
		await markHandlers(scan.page);
		found = await scan.page.evaluate(probeControls, { found: opened });
	} finally {
		await scan.close();
	}
	const probing = Date.now();
	const controls: { control: string; cls: ProbeClass; state: string; ms?: number }[] = [];
	const work: { control: ProbeControl; sequence: Sequence }[] = [];
	const kinds = new Map<string, number>();
	const max = options.maxControls ?? DEFAULT_MAX;
	const probed = new Set<string>();
	for (const control of found) {
		for (const cls of control.classes as ProbeClass[]) {
			const kind = `${cls}|${control.kind}`;
			const seen = kinds.get(kind) ?? 0;
			kinds.set(kind, seen + 1);
			const named = describeControl(control);
			const shared = LAYOUT.has(control.region) ? `${kind}|${control.name}` : undefined;
			const owner = shared ? options.layout?.get(shared) : undefined;
			if (owner && owner !== route) {
				controls.push({ control: named, cls, state: `probed on ${owner}, which shares this layout` });
				continue;
			}
			if (shared) options.layout?.set(shared, route);
			if (seen >= SAMPLES) {
				controls.push({ control: named, cls, state: 'alike: the first of its kind was probed' });
				continue;
			}
			if (!probed.has(controlKey(control)) && probed.size >= max) {
				controls.push({ control: named, cls, state: `left out: over ${max} controls` });
				continue;
			}
			probed.add(controlKey(control));
			for (const sequence of sequencesFor(cls, control)) work.push({ control, sequence });
		}
	}
	const pairs = Math.max(1, options.concurrency ?? 2);
	const budget = options.budgetMs ?? Math.min(MAX_BUDGET_MS, Math.max(MIN_BUDGET_MS, (probed.size * PER_CONTROL_MS) / pairs));
	const failures: Failure[] = [];
	const state = new Map<string, { control: string; cls: ProbeClass; state: string; ms: number }>();
	const queue = [...work];
	const worker = async () => {
		const sides2 = { old: await openSide(browser, sides.old, viewport), new: await openSide(browser, sides.new, viewport) };
		try {
			for (let item = queue.shift(); item; item = queue.shift()) {
				const id = `${controlKey(item.control)}|${item.sequence.cls}`;
				const entry = state.get(id) ?? { control: describeControl(item.control), cls: item.sequence.cls, state: 'probed', ms: 0 };
				state.set(id, entry);
				if (Date.now() - probing > budget) {
					entry.state = `left out: the probes' ${Math.round(budget / 1000)} s budget ran out`;
					continue;
				}
				const files = new Set<string>();
				const began = Date.now();
				const [old, next] = await Promise.all([runSequence(sides2.old, sides.old.origin, route, item.control, item.sequence, [], new Set()), runSequence(sides2.new, sides.new.origin, route, item.control, item.sequence, parts, files)]);
				// A control the new page lacks is the journeys' and the rendered check's finding; the probe has nothing to drive there.
				if (old[0]?.control !== 'not on the page' && next[0]?.control === 'not on the page') {
					entry.state = 'not on the new page: the journeys and the rendered check compare whether it is there';
					continue;
				}
				let steps = compareRuns(old, next);
				if (steps.some((d) => d.length)) {
					const again = await runSequence(sides2.old, sides.old.origin, route, item.control, item.sequence, [], new Set());
					steps = compareRuns(old, next, again);
				}
				entry.ms += Date.now() - began;
				if (old[0]?.control === 'not on the page') entry.state = 'not found again on the old page';
				const k = steps.findIndex((d) => d.length);
				if (k < 0) continue;
				failures.push(probeFailure(route, item.control, item.sequence, k, steps, old, next, [...files]));
			}
		} finally {
			await Promise.all([sides2.old.close(), sides2.new.close()]);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(pairs, work.length)) }, worker));
	for (const e of state.values()) {
		controls.push({ control: e.control, cls: e.cls, state: e.state, ...(e.ms ? { ms: e.ms } : {}) });
		if (e.state.startsWith('left out') || e.state.startsWith('not found')) failures.push(unprobed(route, e.control, e.cls, e.state));
	}
	for (const c of controls) if (c.state.startsWith('left out: over')) failures.push(unprobed(route, c.control, c.cls, c.state));
	return { failures, controls, ms: Date.now() - started };
}

const DISCOVER_MAX = 24;

/**
 * On the old page, clicks each button of a distinct name that says nothing of what it does (no aria-haspopup, not a toggle, not
 * in a shared layout, not one that ends the session or deletes) once, and keeps whether it opened a dialog, menu, listbox or
 * popover: it gets the popup probe. React Aria's dialog trigger carries no aria-haspopup.
 */
async function discover(side: Side, origin: string, route: string, controls: readonly ProbeControl[]): Promise<Record<string, string[]>> {
	const page = side.page;
	const out: Record<string, string[]> = {};
	const names = new Set<string>();
	const candidates = controls.filter((c) => c.role === 'button' && !c.classes.some((k) => k === 'popup') && !LAYOUT.has(c.region) && !DESTRUCTIVE.test(c.name) && !names.has(c.name) && names.add(c.name)).slice(0, DISCOVER_MAX);
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
		const clicked = await page.locator(MARK).first().click({ timeout: 1_500 }).then(() => true, () => false);
		await settle(side);
		if (new URL(page.url()).pathname !== new URL(route, origin).pathname) {
			await fresh();
			continue;
		}
		const after = await read(page);
		const opened = clicked && lines(after.open).some((o) => !lines(before.open).includes(o));
		const key = controlKey(control);
		if (opened) out[key] = ['popup'];
		if (opened) {
			await page.keyboard.press('Escape', { delay: HOLD_MS });
			await settle(side);
			if (lines((await read(page)).open).some((o) => !lines(before.open).includes(o))) await fresh();
		}
	}
	return out;
}

function unprobed(route: string, control: string, cls: ProbeClass, why: string): Failure {
	return { route, dimension: DIMENSION[cls], check: `not exercised: ${cls} probe of ${control}`, expected: `the ${cls} probe drives it on both pages`, actual: why, hint: 'A control check could not drive is not proven alike. Raise the probe budget, or fix what kept the probe from reaching it; the route stays red until it is probed.' };
}

function probeFailure(route: string, control: ProbeControl, sequence: Sequence, k: number, steps: readonly FieldDiff[][], old: Run, next: Run, files: readonly string[]): Failure {
	const trail = sequence.ops.slice(0, k + 1).map(describeOp);
	const diffs = steps[k]!;
	const later = steps.flatMap((d, i) => (i > k && d.length ? [i + 1] : []));
	const context = (r: Reading | undefined) => (diffs.some((d) => d.field === 'focus') ? '' : `; focus: ${String(r?.focus ?? '?')}`);
	return {
		route,
		dimension: DIMENSION[sequence.cls],
		check: `${sequence.cls} probe of ${describeControl(control)}: ${sequence.name} (step ${k + 1} of ${sequence.ops.length}: ${trail.at(-1)})`,
		expected: `old, after ${trail.join(', then ')}: ${diffs.map((d) => `${d.field}: ${d.old}`).join('; ')}${context(old[k + 1])}`,
		actual: `new: ${diffs.map((d) => `${d.field}: ${d.new}`).join('; ')}${context(next[k + 1])}${later.length ? `; it differs again at step${later.length > 1 ? 's' : ''} ${later.join(', ')}` : ''}`,
		hint: `${PROBE_HINTS[sequence.cls]}${files.length ? ` Likely part: ${files.join(', ')} (its selectors match this control or what it opened).` : ''}`,
	};
}
