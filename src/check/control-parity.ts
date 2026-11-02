import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Browser, CDPSession, Page } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { installParity } from './control-parity-page.ts';
import { loadPage } from './infrastructure.ts';
import { motionEnv } from './motion.ts';
import { markUse, settle, settleCalm, settleDeferred, trackRequests, trackTimers, type Requests } from './settle.ts';
import type { Viewport } from './types.ts';
import { INPUT_VALUES, inputKind, isField, judgeControlParity, keySet, needsAgain, steadyPoints, usedControls, type ControlParityResult, type GridPoint, type Motion, type ParityControl, type ParityPair, type ParityRow, type ParityTrial, type TrialHead, type Use, type WidthRead } from './control-parity-compare.ts';

export interface ControlParityOptions {
	/** Widths whose controls, boxes and hit points are compared; the first is where controls are used. */
	readonly widths?: readonly number[];
	/** Widths each pop-up's place against its trigger is compared at. */
	readonly anchorWidths?: readonly number[];
	/** A second engine the pop-up places are compared in too. */
	readonly webkit?: Browser;
	/** Film opening and closing pop-ups (Chromium only). */
	readonly film?: boolean;
	readonly maxUses?: number;
	readonly maxKeys?: number;
	readonly maxInputs?: number;
	/** Pixels a control's or its container's box may differ by. */
	readonly boxTolerance?: number;
	readonly settleMs?: number;
	/** How long the uses, keys and typed values may take on one route before the rest are left out. */
	readonly budgetMs?: number;
	/** Runs around each use, from the input to its settling (the busy-CPU lane keeps the machine busy there). */
	readonly during?: <T>(work: () => Promise<T>) => Promise<T>;
	/** Only the uses, keys and typed values: the original's controls are listed at the first width and nothing is compared across widths. */
	readonly usesOnly?: boolean;
}

type Sides = { readonly old: SideEnv; readonly new: SideEnv };
const SCROLL_SETTLE_MS = 500;
type Name = 'old' | 'new';

const parity = <T>(page: Page, fn: string, arg?: unknown): Promise<T> =>
	page.evaluate(([f, a]) => (globalThis as unknown as { __markless_migrate_parity__: Record<string, (x: unknown) => unknown> }).__markless_migrate_parity__[f as string]!(a), [fn, arg] as const) as Promise<T>;

interface Open {
	readonly page: Page;
	readonly requests: Requests;
	readonly errors: string[];
	readonly cdp?: CDPSession;
	readonly close: () => Promise<void>;
}

async function open(browser: Browser, env: SideEnv, viewport: Viewport, route: string, settleMs: number, cdp = false): Promise<Open> {
	const { context, page } = await openPage(browser, env, viewport, { sameOriginOnly: true });
	await context.addInitScript(trackTimers);
	const requests = trackRequests(page);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e.message ?? e).split('\n')[0]!.slice(0, 160)));
	page.on('dialog', (d) => void d.dismiss().catch(() => {}));
	try {
		await loadPage(page, new URL(route, env.origin).href);
		// A slow live answer (a directory's health JSON) can still change the layout: wait for the network to rest.
		await requests.quiet(200, 15_000);
		await markUse(page, Math.min(settleMs, 300));
		await settle(page, requests, Math.min(settleMs, 300));
		// What the page put off at load lands before any use, not in it.
		await settleDeferred(page, requests);
		await settleScroll(page);
		await page.evaluate(installParity);
	} catch (error) {
		await context.close().catch(() => {});
		throw error;
	}
	return { page, requests, errors, ...(cdp ? { cdp: await context.newCDPSession(page) } : {}), close: () => context.close() };
}

/** A page scrolls some of its parts after load (a sidebar to its active link): it is read once every scroll position holds. */
async function settleScroll(page: Page): Promise<void> {
	const read = () => page.evaluate(() => [scrollY, ...[...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map((e) => e.scrollTop)].join(',')).catch(() => '');
	let last = await read();
	for (let waited = 0; waited < 3000; waited += 120) {
		await page.waitForTimeout(120);
		const now = await read();
		if (now === last) return;
		last = now;
	}
}

const viewportAt = (base: Viewport, width: number): Viewport => (width < 600 ? { name: `${width}`, width, height: 844, isMobile: true } : { name: `${width}`, width, height: base.height, isMobile: false });

/** Every frame the compositor paints while `run` runs and until frames stop coming (a screencast sends a frame only when the picture changed). */
async function filmed<T>(cdp: CDPSession, run: () => Promise<T>): Promise<{ result: T; motion: Motion }> {
	const frames: { t: number; data: string }[] = [];
	const onFrame = (f: { data: string; metadata: { timestamp?: number }; sessionId: number }) => {
		frames.push({ t: (f.metadata.timestamp ?? Date.now() / 1000) * 1000, data: f.data });
		void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
	};
	cdp.on('Page.screencastFrame', onFrame);
	await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 480, maxHeight: 340, everyNthFrame: 1 });
	await new Promise((done) => setTimeout(done, 120));
	const base = frames.length;
	const result = await run();
	let last = frames.length;
	for (let waited = 0; waited < 3000; waited += 250) {
		await new Promise((done) => setTimeout(done, 250));
		if (frames.length === last && waited >= 500) break;
		last = frames.length;
	}
	await cdp.send('Page.stopScreencast').catch(() => {});
	cdp.off('Page.screencastFrame', onFrame);
	return { result, motion: motionOf(frames.slice(Math.max(0, base - 1))) };
}

/** The distinct pictures a filmed use painted, how long they ran and their cadence (the gaps between changes). */
export function motionOf(frames: readonly { t: number; data: string }[]): Motion {
	const imgs = frames.map((f) => ({ t: f.t, png: PNG.sync.read(Buffer.from(f.data, 'base64')) })).filter((f) => f.png.width);
	if (imgs.length < 2) return { distinct: 0, durationMs: 0, maxGapMs: 0, medianGapMs: 0, frames: imgs.map((f) => f.png) };
	// A fade steps through small colour changes: a low colour threshold counts each step, a few pixels' change is a frame.
	const differs = (a: PNG, b: PNG) => (a.width === b.width && a.height === b.height ? pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.02 }) > Math.max(8, a.width * a.height * 0.0001) : true);
	const distinct = [imgs[0]!];
	for (const f of imgs.slice(1)) if (differs(distinct.at(-1)!.png, f.png)) distinct.push(f);
	const changes = distinct.slice(1);
	const gaps = changes.slice(1).map((f, i) => f.t - changes[i]!.t).sort((a, b) => a - b);
	return { distinct: changes.length, durationMs: changes.length ? Math.round(distinct.at(-1)!.t - changes[0]!.t) : 0, maxGapMs: gaps.length ? Math.round(gaps.at(-1)!) : 0, medianGapMs: gaps.length ? Math.round(gaps[gaps.length >> 1]!) : 0, frames: distinct.map((f) => f.png) };
}

/**
 * Old against new, for the controls of one route: which controls each width shows and the boxes of them and their
 * containers, what a click reaches over each control and each region, where each pop-up opens against its trigger at
 * each width (and in WebKit), how it opens and closes frame by frame, what a standard set of keys does from each kind of
 * control, and how each field takes realistic values; judged by control-parity-compare.ts.
 */
export async function checkControlParity(browser: Browser, sides: Sides, route: string, viewport: Viewport, options: ControlParityOptions = {}): Promise<ControlParityResult> {
	return judgeControlParity(route, await observeControlParity(browser, sides, route, viewport, options));
}

/** Reads each width's controls and uses the original's controls on both sides, once more where the first pair differs. */
export async function observeControlParity(browser: Browser, sides: Sides, route: string, viewport: Viewport, options: ControlParityOptions = {}): Promise<ParityRow> {
	const started = Date.now();
	const widths = options.widths ?? [viewport.width, 1440, 390];
	const anchorWidths = options.anchorWidths ?? [viewport.width, 1440];
	const tolerance = options.boxTolerance ?? 2;
	const settleMs = options.settleMs ?? 600;
	const usesOnly = Boolean(options.usesOnly);
	const at = (width: number) => viewportAt(viewport, width);
	const reads: WidthRead[] = [];

	// What each width shows, read twice on the original so only what holds still there is compared.
	for (const width of widths) {
		const read = async (side: Name) => {
			const o = await open(browser, sides[side], at(width), route, settleMs);
			try {
				// Where a page leaves its inner scrollers (a sidebar centred on its link while the page streams) varies by load.
				await o.page.evaluate(() => {
					for (const e of document.querySelectorAll('*')) if (e !== document.scrollingElement && e.scrollTop && e.scrollHeight > e.clientHeight + 1) e.scrollTop = 0;
				});
				const list = await parity<ParityControl[]>(o.page, 'controls');
				const grid = await parity<GridPoint[]>(o.page, 'grid', null);
				return { list, grid, page: o };
			} catch (error) {
				await o.close();
				throw error;
			}
		};
		const a = await read('old');
		await a.page.close();
		if (usesOnly) {
			reads.push({ width, a: { list: a.list, grid: a.grid } });
			break;
		}
		const b = await read('old');
		await b.page.close();
		const n = await read('new');
		const portGrid = await parity<GridPoint[]>(n.page.page, 'grid', steadyPoints(a.grid, b.grid)).catch(() => [] as GridPoint[]);
		await n.page.close();
		reads.push({ width, a: { list: a.list, grid: a.grid }, b: { list: b.list, grid: b.grid }, n: { list: n.list }, portGrid });
	}
	const controls = usedControls(reads[0]!, usesOnly);

	// One use of a control on one side, from a fresh load; `calm` waits for the page to stop changing first.
	const use = async (side: Name, control: ParityControl, act: (page: Page) => Promise<void>, width = widths[0]!, how: { browser?: Browser; film?: boolean; field?: string; calm?: boolean } = {}): Promise<Use> => {
		const env = how.film ? motionEnv(sides[side], false) : sides[side];
		const o = await open(how.browser ?? browser, env, at(width), route, settleMs, Boolean(how.film));
		try {
			if (how.calm) await settleCalm(o.page);
			await markUse(o.page, SCROLL_SETTLE_MS);
			if (!(await parity<boolean>(o.page, 'mark', control.key))) return { missing: 'not on the page' };
			await settle(o.page, o.requests, SCROLL_SETTLE_MS);
			const armed = await parity<{ hits: string[] } | null>(o.page, 'arm');
			if (!armed) return { missing: 'not on the page' };
			const before = o.errors.length;
			let motion: Motion | undefined;
			await (options.during ?? ((work) => work()))(async () => {
				await markUse(o.page, settleMs);
				if (how.film && o.cdp) motion = (await filmed(o.cdp, () => act(o.page))).motion;
				else await act(o.page);
				await settle(o.page, o.requests, settleMs);
			});
			// Where a pop-up opens is read where it settles, not mid-slide; its motion is compared on its own.
			await parity(o.page, 'settle').catch(() => {});
			const read = await parity<Use>(o.page, 'read').catch(() => undefined);
			const u = new URL(o.page.url());
			const r: Use = read ?? { affected: [], url: u.pathname + u.search !== route ? u.pathname + u.search : '' };
			let field: Use['field'], shown: string | undefined, close: Use['close'];
			if (how.field !== undefined && read) {
				field = await parity<Use['field']>(o.page, 'field');
				// What a pop-up the field drives shows for the value: ArrowDown in the field, else the button beside it.
				await o.page.locator('[data-markless-migrate-parity]').first().focus({ timeout: 2000 }).catch(() => {});
				await markUse(o.page, 500);
				await o.page.keyboard.press('ArrowDown').catch(() => {});
				await settle(o.page, o.requests, 500);
				shown = await parity<string>(o.page, 'popupSummary').catch(() => '');
				if (!shown && (await parity<boolean>(o.page, 'markBeside').catch(() => false))) {
					await markUse(o.page, 600);
					await o.page.locator('[data-markless-migrate-parity-beside]').first().click({ timeout: 2000 }).catch(() => {});
					await settle(o.page, o.requests, 600);
					shown = await parity<string>(o.page, 'popupSummary').catch(() => '');
				}
			}
			if (how.film && o.cdp && r.popupRole) {
				await markUse(o.page, settleMs);
				const shot = await filmed(o.cdp, () => o.page.keyboard.press('Escape'));
				await settle(o.page, o.requests, settleMs);
				close = { motion: shot.motion, still: await parity<boolean>(o.page, 'stillOpen').catch(() => false) };
			}
			return { ...r, hits: armed.hits, errors: o.errors.slice(before), ...(motion ? { motion } : {}), ...(field ? { field } : {}), ...(shown !== undefined ? { shown } : {}), ...(close ? { close } : {}) };
		} catch (error) {
			return { missing: (error as Error).message.split('\n')[0]!.slice(0, 160) };
		} finally {
			await o.close();
		}
	};
	const click = (page: Page) => page.locator('[data-markless-migrate-parity]').first().click({ timeout: 3000 });
	const trials: ParityTrial[] = [];
	// The old side first, then the port unless the original lacks the control; a second pair when the first differs.
	const tryPair = async (trial: TrialHead, pairOf: (calm: boolean) => Promise<ParityPair>): Promise<ParityPair> => {
		const first = await pairOf(false);
		const { again, calm } = needsAgain(trial, first, route);
		trials.push({ ...trial, first, ...(again ? { second: await pairOf(calm) } : {}) } as ParityTrial);
		return first;
	};
	const pairWith = (control: ParityControl, act: (page: Page) => Promise<void>, width: number, how: { browser?: Browser; film?: boolean; field?: string }) => async (calm: boolean): Promise<ParityPair> => {
		const old = await use('old', control, act, width, { ...how, calm });
		return { old, port: old.missing ? old : await use('new', control, act, width, { ...how, calm }) };
	};

	const budget = started + (options.budgetMs ?? 150_000);
	const spent = () => Date.now() > budget;
	const maxUses = options.maxUses ?? 6;
	const popups: ParityControl[] = [];
	const filmedTemplates = new Set<string>();
	// Pop-up triggers first: their place, their motion and what a click on them reaches.
	const used = [...controls.filter((c) => c.popup && !c.layout), ...controls.filter((c) => !c.popup && !c.layout && !isField(c)), ...controls.filter((c) => c.popup && c.layout)].slice(0, maxUses);
	for (const control of used) {
		const film = Boolean(options.film) && !filmedTemplates.has(control.template) && control.popup;
		if (spent()) {
			trials.push({ phase: 'use', control, film, leftOut: true });
			continue;
		}
		const first = await tryPair({ phase: 'use', control, film }, pairWith(control, click, widths[0]!, { film }));
		if (first.old.missing || first.port.missing) continue;
		if (first.old.popupRole) popups.push(control);
		if (film) filmedTemplates.add(control.template);
	}

	// Where each pop-up opens at the other widths, and in WebKit at every width.
	const engines: { name: string; browser: Browser; widths: readonly number[] }[] = [{ name: 'Chromium', browser, widths: anchorWidths.filter((w) => w !== widths[0]) }, ...(options.webkit ? [{ name: 'WebKit', browser: options.webkit, widths: anchorWidths }] : [])];
	for (const engine of engines) {
		for (const width of engine.widths) {
			for (const control of popups.slice(0, 3)) {
				if (spent()) {
					trials.push({ phase: 'anchor', engine: engine.name, width, control, leftOut: true });
					continue;
				}
				await tryPair({ phase: 'anchor', engine: engine.name, width, control }, pairWith(control, click, width, { browser: engine.browser }));
			}
		}
	}

	// Keys: one control of each kind, focused on a fresh load, given each key of its set.
	let keyTrials = 0;
	const maxKeys = options.maxKeys ?? 8;
	const kinds = new Set<string>();
	const rank = (c: ParityControl) => (c.layout ? 2 : c.role === 'link' ? 1 : 0);
	for (const control of [...controls].sort((a, b) => rank(a) - rank(b))) {
		if (keyTrials >= maxKeys) break;
		if (kinds.has(control.template)) continue;
		kinds.add(control.template);
		for (const keys of keySet(control).slice(0, 4)) {
			if (keyTrials >= maxKeys) break;
			if (spent()) {
				trials.push({ phase: 'key', control, keys, leftOut: true });
				continue;
			}
			keyTrials++;
			const press = async (page: Page) => {
				await page.locator('[data-markless-migrate-parity]').first().focus({ timeout: 3000 });
				for (const k of keys) {
					await markUse(page, 150);
					await page.keyboard.press(k);
					await settle(page, undefined, 150);
				}
			};
			await tryPair({ phase: 'key', control, keys }, pairWith(control, press, widths[0]!, {}));
		}
	}

	// Fields: realistic values typed, then Enter and a blur.
	let inputTrials = 0;
	const maxInputs = options.maxInputs ?? 6;
	const fieldKinds = new Map<string, number>();
	for (const control of controls.filter((c) => !c.layout && isField(c))) {
		const kind = inputKind(control);
		const seen = (fieldKinds.get(`${control.template}|${kind}`) ?? 0) + 1;
		fieldKinds.set(`${control.template}|${kind}`, seen);
		if (seen > (kind === 'text' ? 1 : 3)) continue;
		for (const value of INPUT_VALUES[kind]) {
			if (inputTrials >= maxInputs) break;
			if (spent()) {
				trials.push({ phase: 'input', control, value, leftOut: true });
				continue;
			}
			inputTrials++;
			const type = async (page: Page) => {
				const field = page.locator('[data-markless-migrate-parity]').first();
				await field.click({ timeout: 3000 });
				if (control.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) await field.fill(value, { timeout: 3000 });
				else {
					await page.keyboard.press('ControlOrMeta+A');
					await page.keyboard.press('Backspace');
					await page.keyboard.type(value, { delay: 15 });
				}
				await page.keyboard.press('Enter');
				await settle(page, undefined, 200);
				await markUse(page, settleMs);
				await parity(page, 'blur').catch(() => {});
			};
			await tryPair({ phase: 'input', control, value }, pairWith(control, type, widths[0]!, { field: value }));
		}
	}
	return { widths, tolerance, usesOnly, reads, trials, ms: Date.now() - started };
}
