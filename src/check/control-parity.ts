import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Browser, CDPSession, Page } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { installParity } from './control-parity-page.ts';
import { loadPage } from './infrastructure.ts';
import { motionEnv } from './motion.ts';
import type { Failure, Shot, Viewport } from './types.ts';

/** One visible control of a page, as the page lists it (control-parity-page.ts). */
export interface ParityControl {
	readonly key: string;
	readonly role: string;
	readonly name: string;
	readonly layout: boolean;
	readonly leaves: boolean;
	readonly disabled: boolean;
	readonly popup: boolean;
	readonly template: string;
	readonly type: string;
	readonly hint: string;
	readonly options?: readonly string[];
	readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
	readonly parent?: { readonly w: number; readonly h: number };
	/** The example frame (preview, figure, section, dialog) it sits in; none for the page's main or body. */
	readonly frame?: { readonly w: number; readonly h: number };
	readonly frameId: number;
	readonly pageY: number;
}

interface GridPoint {
	readonly region: string;
	readonly fx: number;
	readonly fy: number;
	readonly key: string;
	readonly near?: readonly string[];
}

interface Anchor {
	readonly side: string;
	readonly dx: number;
	readonly dy: number;
	readonly w: number;
	readonly h: number;
	readonly tw: number;
}

/** What one use of a control did on one side. */
export interface Use {
	readonly missing?: string;
	readonly hits?: readonly string[];
	readonly affected?: readonly string[];
	readonly url?: string;
	readonly focus?: string;
	readonly popupRole?: string;
	readonly first?: { readonly ms: number; readonly opacity: number; readonly transform: string; readonly anims: readonly string[] };
	readonly anchor?: Anchor;
	readonly errors?: readonly string[];
	readonly field?: { readonly value: string; readonly invalid: string; readonly badInput: boolean };
	readonly shown?: string;
	readonly motion?: Motion;
	readonly close?: { readonly motion?: Motion; readonly still: boolean };
}

export interface Motion {
	readonly distinct: number;
	readonly durationMs: number;
	readonly maxGapMs: number;
	readonly medianGapMs: number;
	readonly frames: readonly PNG[];
}

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
}

export interface ControlParityResult {
	readonly failures: readonly Failure[];
	readonly shots: readonly Shot[];
	readonly tried: number;
	/** Uses, keys and typed values left out once the budget ran out. */
	readonly leftOut: number;
	readonly ms: number;
}

type Sides = { readonly old: SideEnv; readonly new: SideEnv };
const SCROLL_SETTLE_MS = 500;
type Name = 'old' | 'new';

const HINTS = {
	hit: 'Something covers this spot on the port, or the control there is smaller or elsewhere: a click lands on another element than on the original.',
	box: 'The control or its container is drawn at another size or place than on the original; compare its padding, line height, gap and the container\'s layout classes.',
	presence: 'The original shows this control at this width and the port does not: a responsive class, a breakpoint or a capture taken at one width only.',
	anchor: 'The pop-up opens elsewhere against its trigger than on the original: its side, align, offset or collision handling, or the width it takes from its trigger.',
	motion: 'The pop-up shows (or leaves) with other motion than on the original: its enter/exit animation, its starting style or the frames it is painted in. The route\'s shots hold both sides\' frames.',
	key: 'The original answers this key from this control and the port answers differently: its keyboard handler, its roving focus or the pop-up it opens.',
	input: 'The field takes this value differently from the original: how it parses, formats or validates what was typed, or what it updates from it.',
	error: 'The port throws where the original does not, after this use.',
} as const;

export const INPUT_VALUES = {
	date: ['May 28, 2025', '05/28/2025', '2025-05-28', 'abc', '2025-02-30', '28/05/2025', '28.05.2025', '5/28/25', 'tomorrow'],
	nativeDate: ['2025-05-28', '05282025', '2025-02-28'],
	number: ['42', '0', '-1', '3.14', '1e3', '99999999', 'abc', ''],
	text: ['May 28, 2025', '42', 'abc', 'zq zq', ''],
} as const;

export function inputKind(c: Pick<ParityControl, 'type' | 'hint' | 'name' | 'role'>): keyof typeof INPUT_VALUES {
	if (c.type === 'date') return 'nativeDate';
	if (/date|day|month|year|birth|calendar|yyyy|\d{1,2}\/\d{1,2}/i.test(`${c.hint} ${c.name}`)) return 'date';
	if (c.type === 'number' || c.role === 'spinbutton' || /numeric|decimal|amount|price|quantity/i.test(c.hint)) return 'number';
	return 'text';
}

export const isField = (c: Pick<ParityControl, 'role' | 'type' | 'options'>): boolean => /^(textbox|searchbox|spinbutton|combobox)$/.test(c.role) && !c.options && /^(text|search|date|number|email|tel|url|textarea|)$/.test(c.type);

/** The standard keys each kind of control is tried with: one key, then short sequences. */
export function keySet(c: Pick<ParityControl, 'role' | 'popup'>): string[][] {
	if (c.popup && c.role === 'button') return [['ArrowDown'], ['Enter'], ['Enter', 'Escape'], ['Space'], ['ArrowUp'], ['Enter', 'ArrowDown', 'ArrowDown', 'Enter']];
	if (/^(tab|radio|menuitemradio|treeitem|option)$/.test(c.role)) return [['ArrowRight'], ['End'], ['ArrowRight', 'Enter'], ['Tab'], ['ArrowLeft'], ['ArrowDown'], ['Home']];
	if (/^(textbox|searchbox)$/.test(c.role)) return [['ArrowDown', 'Enter'], ['Escape'], ['Tab'], ['ArrowDown']];
	if (c.role === 'combobox') return [['Enter'], ['ArrowDown', 'ArrowDown', 'Enter'], ['Enter', 'Escape'], ['Tab'], ['Space'], ['ArrowUp']];
	if (/^(slider|spinbutton)$/.test(c.role)) return [['ArrowRight'], ['End'], ['ArrowLeft'], ['Home'], ['PageUp']];
	if (/^(checkbox|switch|menuitemcheckbox)$/.test(c.role)) return [['Space'], ['Enter'], ['Tab']];
	if (c.role === 'link') return [['Tab'], ['Shift+Tab']];
	return [['Enter'], ['Space'], ['Enter', 'ArrowDown', 'ArrowDown', 'Enter'], ['Enter', 'Escape'], ['Tab'], ['Shift+Tab'], ['ArrowDown'], ['Escape']];
}

const parity = <T>(page: Page, fn: string, arg?: unknown): Promise<T> =>
	page.evaluate(([f, a]) => (globalThis as unknown as { __markless_migrate_parity__: Record<string, (x: unknown) => unknown> }).__markless_migrate_parity__[f as string]!(a), [fn, arg] as const) as Promise<T>;

interface Open {
	readonly page: Page;
	readonly errors: string[];
	readonly cdp?: CDPSession;
	readonly close: () => Promise<void>;
}

async function open(browser: Browser, env: SideEnv, viewport: Viewport, route: string, settleMs: number, cdp = false): Promise<Open> {
	const { context, page } = await openPage(browser, env, viewport, { sameOriginOnly: true });
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e.message ?? e).split('\n')[0]!.slice(0, 160)));
	page.on('dialog', (d) => void d.dismiss().catch(() => {}));
	try {
		await loadPage(page, new URL(route, env.origin).href);
		// A slow live answer (a directory's health JSON) can still change the layout: wait for the network to rest.
		await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
		await page.waitForTimeout(Math.min(settleMs, 300));
		await settleScroll(page);
		await page.evaluate(installParity);
	} catch (error) {
		await context.close().catch(() => {});
		throw error;
	}
	return { page, errors, ...(cdp ? { cdp: await context.newCDPSession(page) } : {}), close: () => context.close() };
}

/** A page scrolls some of its parts after load (a sidebar to its active link): it is read once every scroll position holds. */
async function settleScroll(page: Page): Promise<void> {
	const read = () => page.evaluate(() => [scrollY, ...[...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map((e) => e.scrollTop)].join(',')).catch(() => '');
	let last = await read();
	for (let waited = 0; waited < 3000; waited += 250) {
		await page.waitForTimeout(250);
		const now = await read();
		if (now === last) return;
		last = now;
	}
}

/** Pairs each original control with the port's: namesakes (a page's many Copy buttons) by place, so one missing does not shift every later pair. */
export function pairControls(olds: readonly ParityControl[], news: readonly ParityControl[]): Map<string, ParityControl> {
	const pool = new Map<string, ParityControl[]>();
	for (const n of news) {
		const k = countless(`${n.role}|${n.name}`);
		(pool.get(k) ?? pool.set(k, []).get(k)!).push(n);
	}
	const pairs = new Map<string, ParityControl>();
	let drift = 0;
	for (const c of [...olds].sort((a, b) => a.pageY - b.pageY)) {
		const left = pool.get(countless(`${c.role}|${c.name}`)) ?? [];
		if (!left.length) continue;
		const best = left.reduce((a, b) => (Math.abs(b.pageY - c.pageY - drift) < Math.abs(a.pageY - c.pageY - drift) ? b : a));
		if (left.length > 1 && Math.abs(best.pageY - c.pageY - drift) > 400) continue;
		left.splice(left.indexOf(best), 1);
		drift = best.pageY - c.pageY;
		pairs.set(c.key, best);
	}
	return pairs;
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

/** How two filmings of one use differ: one moves while the other jumps to its result, or both move with other durations or cadence. */
export function motionDiff(om: Motion, nm: Motion): 'jump' | 'duration' | 'cadence' | undefined {
	const moving = (m: Motion) => m.distinct >= 4 && m.durationMs >= 80;
	if ((moving(om) && nm.distinct <= 1) || (moving(nm) && om.distinct <= 1)) return 'jump';
	if (!moving(om) || !moving(nm)) return undefined;
	if (Math.abs(om.durationMs - nm.durationMs) > Math.max(150, 0.5 * om.durationMs)) return 'duration';
	if (nm.distinct < om.distinct * 0.5 || om.distinct < nm.distinct * 0.5 || nm.maxGapMs > Math.max(2 * om.maxGapMs, om.maxGapMs + 100)) return 'cadence';
	return undefined;
}

/** Up to eight of a filming's distinct frames, evenly spread, side by side in one picture. */
export function strip(frames: readonly PNG[]): Buffer {
	const n = Math.min(8, frames.length);
	const picked = Array.from({ length: n }, (_, i) => frames[Math.round((i * (frames.length - 1)) / Math.max(1, n - 1))]!);
	const w = Math.max(1, ...picked.map((p) => p.width)), h = Math.max(1, ...picked.map((p) => p.height));
	const out = new PNG({ width: w * 8, height: h });
	out.data.fill(255);
	picked.forEach((p, c) => PNG.bitblt(p, out, 0, 0, p.width, p.height, c * w, 0));
	return PNG.sync.write(out);
}

const line = (m: Motion) => `${m.distinct} painted changes over ${m.durationMs} ms (longest gap ${m.maxGapMs} ms, median ${m.medianGapMs} ms)`;
const transformMoves = (t: string) => t !== 'none' && !/^matrix\(1, 0, 0, 1, 0, -?[\d.e-]+\)$/.test(t);

export function anchorDiffers(a: Anchor, b: Anchor): boolean {
	return a.side !== b.side || Math.abs(a.dx - b.dx) > 4 || Math.abs(a.dy - b.dy) > 4 || Math.abs(a.w - b.w) > 4;
}

const describeAnchor = (a: Anchor) => `${a.side} its trigger, ${a.dx} px across and ${a.dy} px down from its corner, ${a.w}x${a.h} (trigger ${a.tw} wide)`;
const did = (u: Use) => Boolean(u.affected?.length || u.url || u.popupRole);
const effect = (u: Use) => [u.affected?.length ? `changes ${u.affected.join(', ')}` : '', u.url ? `address becomes ${u.url}` : '', u.popupRole ? `opens a ${u.popupRole}` : ''].filter(Boolean).join('; ') || 'changes nothing';

/** The pairs of readings a keyboard trial's two sides differ in, as [what, expected, actual]. */
export function keyDifferences(old: Use, port: Use): [string, string, string][] {
	const out: [string, string, string][] = [];
	if (did(old) && !did(port) && old.focus === port.focus) out.push(['answer', effect(old), 'nothing changed on the port']);
	if (!sameControl(old.focus ?? '', port.focus ?? '')) out.push(['focus', `focus ends on ${old.focus}`, `on ${port.focus}`]);
	if ((old.url ?? '') !== (port.url ?? '')) out.push(['address', old.url ? `address becomes ${old.url}` : 'the address stays', port.url ? `becomes ${port.url}` : 'the address stays']);
	if ((old.popupRole ?? '') !== (port.popupRole ?? '')) out.push(['pop-up', old.popupRole ? `a ${old.popupRole} is open` : 'no pop-up open', port.popupRole ? `a ${port.popupRole} is open` : 'no pop-up open']);
	const lost = (old.affected ?? []).filter((a) => !(port.affected ?? []).includes(a));
	if (did(port) && old.affected?.length && lost.length === old.affected.length) out.push(['region', `changes ${old.affected.join(', ')}`, `changes ${port.affected?.join(', ') || 'no region'}`]);
	return out;
}

/** The pairs of readings an input trial's two sides differ in. */
export function inputDifferences(old: Use, port: Use): [string, string, string][] {
	const out: [string, string, string][] = [];
	const o = old.field, n = port.field;
	if (o && n && o.value !== n.value) out.push(['value', `the field ends as "${o.value}"`, `"${n.value}"`]);
	if (o && n && (o.invalid !== n.invalid || o.badInput !== n.badInput)) out.push(['validity', `aria-invalid ${o.invalid || 'unset'}, ${o.badInput ? 'invalid' : 'valid'} to the browser`, `aria-invalid ${n.invalid || 'unset'}, ${n.badInput ? 'invalid' : 'valid'}`]);
	// Equal-score search results can come in another order from a CI-built original: what a pop-up shows is compared as a set.
	const asSet = (t?: string) => (t ?? '').split('; ').sort().join('; ');
	if (old.shown && asSet(old.shown) !== asSet(port.shown)) out.push(['pop-up', `its pop-up then shows ${old.shown}`, port.shown ? `shows ${port.shown}` : 'no pop-up opens']);
	if ((old.url ?? '') !== (port.url ?? '')) out.push(['address', old.url ? `address becomes ${old.url}` : 'the address stays', port.url ? `becomes ${port.url}` : 'the address stays']);
	const lost = (old.affected ?? []).filter((a) => !(port.affected ?? []).includes(a));
	if (old.affected?.length && lost.length === old.affected.length) out.push(['region', `changes ${old.affected.join(', ')}`, port.affected?.length ? `changes ${port.affected.join(', ')}` : 'nothing changed on the port']);
	return out;
}

// A count in a control's name (stars, downloads) is live data, and a calendar day's name ("Today, Tuesday, October 28th,
// 2026") is each site's build date: neither tells which control it is.
const DAY = /(?:Today, )?(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, )?(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:st|nd|rd|th)?,? \d{4}/g;
const countless = (key: string) => key.replace(DAY, 'a day').replace(/\d[\d.,]*[kKmM]?/g, '#');
export const sameControl = (a: string, b: string): boolean => a === b || countless(a) === countless(b);

const thrownOnlyBy = (old: Use, port: Use) => (port.errors ?? []).filter((e) => !(old.errors ?? []).includes(e));

/**
 * Old against new, for the controls of one route: which controls each width shows and the boxes of them and their
 * containers, what a click reaches over each control and each region, where each pop-up opens against its trigger at
 * each width (and in WebKit), how it opens and closes frame by frame, what a standard set of keys does from each kind of
 * control, and how each field takes realistic values. A difference stands only when a second load of the original agrees
 * with the first, and a second load of the port still differs.
 */
export async function checkControlParity(browser: Browser, sides: Sides, route: string, viewport: Viewport, options: ControlParityOptions = {}): Promise<ControlParityResult> {
	const started = Date.now();
	const widths = options.widths ?? [viewport.width, 1440, 390];
	const anchorWidths = options.anchorWidths ?? [viewport.width, 1440];
	const tolerance = options.boxTolerance ?? 2;
	const settleMs = options.settleMs ?? 600;
	const failures: Failure[] = [];
	const shots: Shot[] = [];
	const fail = (dimension: Failure['dimension'], check: string, expected: string, actual: string, hint: string, width?: number) => failures.push({ route, dimension, check, expected, actual, hint, ...(width ? { viewport: `${width} px wide` } : {}) });
	const at = (width: number) => viewportAt(viewport, width);

	// What each width shows, read twice on the original so only what holds still there is compared.
	let controls: ParityControl[] = [];
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
		const b = await read('old');
		await b.page.close();
		const n = await read('new');
		const steady = new Map(b.list.map((c) => [c.key, c]));
		const stable = a.list.filter((c) => steady.has(c.key));
		if (width === widths[0]) controls = stable.filter((c) => !c.leaves && !c.disabled);
		const port = pairControls(stable, n.list);
		let boxes = 0, missing = 0;
		const containers = new Set<string>();
		// A control moved only by what moved above it in its frame is no finding of its own: only where the shift changes.
		const shiftIn = new Map<number, number>();
		for (const c of [...stable].sort((a, b) => a.frameId - b.frameId || a.box.y - b.box.y)) {
			if (c.layout && width !== widths[0]) continue;
			const p = port.get(c.key);
			if (!p) {
				if (!c.layout && missing++ < 10) fail('rendered', 'controls at each width', `${c.key} shown at ${width} px wide`, 'not on the port at this width', HINTS.presence, width);
				continue;
			}
			const again = steady.get(c.key)!;
			const still = (x: { w: number; h: number }, y: { w: number; h: number }) => Math.abs(x.w - y.w) <= 1 && Math.abs(x.h - y.h) <= 1;
			const dy = p.box.y - c.box.y;
			const before = shiftIn.get(c.frameId) ?? 0;
			shiftIn.set(c.frameId, dy);
			const d = [p.box.w - c.box.w, p.box.h - c.box.h, p.box.x - c.box.x, dy - before].map(Math.abs);
			if (still(c.box, again.box) && Math.abs(c.box.x - again.box.x) <= 1 && Math.abs(c.box.y - again.box.y) <= 1 && Math.max(...d) > tolerance && boxes++ < 20) fail('css', 'control box', `${c.key}: ${c.box.w}x${c.box.h} at (${c.box.x}, ${c.box.y}) in its frame`, `${p.box.w}x${p.box.h} at (${p.box.x}, ${p.box.y})`, HINTS.box, width);
			for (const [what, x, y, z] of [['its parent', c.parent, p.parent, again.parent], ['its example frame', c.frame, p.frame, again.frame]] as const) {
				if (!x || !y || !z) continue;
				const k = `${what}|${x.w}x${x.h}|${y.w}x${y.h}`;
				if (containers.has(k) || !still(x, z) || (Math.abs(x.w - y.w) <= tolerance && Math.abs(x.h - y.h) <= tolerance)) continue;
				containers.add(k);
				if (boxes++ < 20) fail('css', 'container box', `${what} of ${c.key}: ${x.w}x${x.h}`, `${y.w}x${y.h}`, HINTS.box, width);
			}
		}
		const steadyPoints = a.grid.filter((g) => g.key !== 'no control' && b.grid.some((h) => h.region === g.region && h.fx === g.fx && h.fy === g.fy && h.key === g.key));
		const portGrid = await parity<GridPoint[]>(n.page.page, 'grid', steadyPoints).catch(() => [] as GridPoint[]);
		await n.page.close();
		let misses = 0;
		for (const g of portGrid) if (!g.near?.some((k) => sameControl(k, g.key)) && misses++ < 10) fail('behaviour', 'hit target over a region', `a click ${Math.round(g.fx * 100)}% across and ${Math.round(g.fy * 100)}% down ${g.region} (in view) reaches ${g.key}`, `reaches ${g.near?.join(' / ') || 'nothing'}`, HINTS.hit, width);
		const portRegions = new Set(portGrid.map((g) => g.region));
		for (const region of new Set(steadyPoints.map((g) => g.region))) if (!portRegions.has(region)) fail('behaviour', 'hit target over a region', `${region} in view, with controls`, 'no such region in view on the port', HINTS.hit, width);
	}

	// One use of a control on one side, from a fresh load.
	const use = async (side: Name, control: ParityControl, act: (page: Page) => Promise<void>, width = widths[0]!, how: { browser?: Browser; film?: boolean; field?: string } = {}): Promise<Use> => {
		const env = how.film ? motionEnv(sides[side], false) : sides[side];
		const o = await open(how.browser ?? browser, env, at(width), route, settleMs, Boolean(how.film));
		try {
			if (!(await parity<boolean>(o.page, 'mark', control.key))) return { missing: 'not on the page' };
			await o.page.waitForTimeout(SCROLL_SETTLE_MS);
			const armed = await parity<{ hits: string[] } | null>(o.page, 'arm');
			if (!armed) return { missing: 'not on the page' };
			const before = o.errors.length;
			let motion: Motion | undefined;
			if (how.film && o.cdp) motion = (await filmed(o.cdp, () => act(o.page))).motion;
			else await act(o.page);
			await o.page.waitForTimeout(settleMs);
			const read = await parity<Use>(o.page, 'read').catch(() => undefined);
			const u = new URL(o.page.url());
			const r: Use = read ?? { affected: [], url: u.pathname + u.search !== route ? u.pathname + u.search : '' };
			let field: Use['field'], shown: string | undefined, close: Use['close'];
			if (how.field !== undefined && read) {
				field = await parity<Use['field']>(o.page, 'field');
				// What a pop-up the field drives shows for the value: ArrowDown in the field, else the button beside it.
				await o.page.locator('[data-markless-migrate-parity]').first().focus({ timeout: 2000 }).catch(() => {});
				await o.page.keyboard.press('ArrowDown').catch(() => {});
				await o.page.waitForTimeout(500);
				shown = await parity<string>(o.page, 'popupSummary').catch(() => '');
				if (!shown && (await parity<boolean>(o.page, 'markBeside').catch(() => false))) {
					await o.page.locator('[data-markless-migrate-parity-beside]').first().click({ timeout: 2000 }).catch(() => {});
					await o.page.waitForTimeout(600);
					shown = await parity<string>(o.page, 'popupSummary').catch(() => '');
				}
			}
			if (how.film && o.cdp && r.popupRole) {
				const shot = await filmed(o.cdp, () => o.page.keyboard.press('Escape'));
				await o.page.waitForTimeout(settleMs);
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
	// A difference stands when the original repeats itself and the port, used again, still differs the same way.
	const confirmed = async <T>(first: { old: Use; port: Use }, again: () => Promise<{ old: Use; port: Use }>, differs: (old: Use, port: Use) => T | undefined): Promise<T | undefined> => {
		const found = differs(first.old, first.port);
		if (found === undefined) return undefined;
		const second = await again();
		const oldAgrees = differs(first.old, second.old) === undefined;
		const still = differs(second.old, second.port);
		return oldAgrees && still !== undefined ? found : undefined;
	};

	let tried = 0;
	let leftOut = 0;
	const budget = started + (options.budgetMs ?? 150_000);
	const spent = () => Date.now() > budget;
	const maxUses = options.maxUses ?? 6;
	const popups: ParityControl[] = [];
	const filmedTemplates = new Set<string>();
	// Pop-up triggers first: their place, their motion and what a click on them reaches.
	const used = [...controls.filter((c) => c.popup && !c.layout), ...controls.filter((c) => !c.popup && !c.layout && !isField(c)), ...controls.filter((c) => c.popup && c.layout)].slice(0, maxUses);
	for (const control of used) {
		if (spent()) {
			leftOut++;
			continue;
		}
		tried++;
		const film = Boolean(options.film) && !filmedTemplates.has(control.template) && control.popup;
		const pair = async (withFilm: boolean) => {
			const old = await use('old', control, click, widths[0], { film: withFilm });
			return { old, port: old.missing ? old : await use('new', control, click, widths[0], { film: withFilm }) };
		};
		const first = await pair(film);
		if (first.old.missing) continue;
		if (first.port.missing) {
			fail('behaviour', 'control used', `${control.key}: ${effect(first.old)}`, first.port.missing, HINTS.hit);
			continue;
		}
		let second: Promise<{ old: Use; port: Use }> | undefined;
		const again = () => (second ??= pair(film));
		const hit = await confirmed(first, again, (o, p) => {
			const off = (o.hits ?? []).map((h, i) => (h !== p.hits?.[i] ? `${['centre', 'left quarter', 'right quarter', 'top quarter', 'bottom quarter'][i]}: ${p.hits?.[i] ?? 'nothing'}` : '')).filter(Boolean);
			return off.length ? off.join('; ') : undefined;
		});
		if (hit) fail('behaviour', 'hit target over a control', `a click on ${control.key} reaches ${[...new Set(first.old.hits)].join(' / ')}`, hit, HINTS.hit);
		const thrown = await confirmed(first, again, (o, p) => (thrownOnlyBy(o, p).length ? thrownOnlyBy(o, p).join('; ') : undefined));
		if (thrown) fail('behaviour', 'errors after a use', `clicking ${control.key} throws ${first.old.errors?.join('; ') || 'nothing'}`, `throws ${thrown}`, HINTS.error);
		if (first.old.popupRole) popups.push(control);
		if (first.old.anchor && first.port.anchor) {
			const off = await confirmed(first, again, (o, p) => (o.anchor && p.anchor && anchorDiffers(o.anchor, p.anchor) ? describeAnchor(p.anchor) : undefined));
			if (off) fail('behaviour', 'pop-up place', `${control.key} opens its ${first.old.popupRole} ${describeAnchor(first.old.anchor)}`, off, HINTS.anchor, widths[0]);
		}
		if (first.old.first && first.port.first) {
			const o = first.old.first, n = first.port.first;
			const animOld = o.opacity < 0.95 || transformMoves(o.transform), animNew = n.opacity < 0.95 || transformMoves(n.transform);
			const differs = (a: Use, b: Use) => (a.first && b.first && ((a.first.opacity < 0.95 || transformMoves(a.first.transform)) !== (b.first.opacity < 0.95 || transformMoves(b.first.transform)) || Math.abs(a.first.opacity - b.first.opacity) > 0.3 || b.first.ms - a.first.ms > 80) ? true : undefined);
			if ((animOld !== animNew || Math.abs(o.opacity - n.opacity) > 0.3 || n.ms - o.ms > 80) && (await confirmed(first, again, differs))) fail('motion', 'pop-up first frame', `${control.key}: its ${first.old.popupRole} is first visible ${o.ms} ms after the press at opacity ${o.opacity}, ${o.transform}; animations ${o.anims.join(', ') || 'none'}`, `first visible ${n.ms} ms after it at opacity ${n.opacity}, ${n.transform}; animations ${n.anims.join(', ') || 'none'}`, HINTS.motion);
		}
		if (film) {
			filmedTemplates.add(control.template);
			for (const [what, om, nm] of [['opening', first.old.motion, first.port.motion], ['closing (Escape)', first.old.close?.motion, first.port.close?.motion]] as const) {
				if (!om || !nm) continue;
				const kind = motionDiff(om, nm);
				if (!kind) continue;
				const repeat = await again();
				const pick = (u: Use) => (what === 'opening' ? u.motion : u.close?.motion);
				const om2 = pick(repeat.old), nm2 = pick(repeat.port);
				if (!om2 || !nm2 || motionDiff(om, om2) || motionDiff(om2, nm2) !== kind) continue;
				fail('motion', `pop-up ${what}, frame by frame`, `${control.key}: ${line(om)}`, line(nm), HINTS.motion);
				shots.push({ label: `${control.key}: ${what}, frame by frame`, viewport: `${widths[0]} px wide`, old: strip(om.frames), new: strip(nm.frames), regions: [], ok: false });
			}
			if (first.old.close && first.port.close && !first.old.close.still && first.port.close.still) fail('behaviour', 'pop-up closing', `Escape closes the ${first.old.popupRole} ${control.key} opened`, 'it stays open on the port', HINTS.key);
		}
	}

	// Where each pop-up opens at the other widths, and in WebKit at every width.
	const engines: { name: string; browser: Browser; widths: readonly number[] }[] = [{ name: 'Chromium', browser, widths: anchorWidths.filter((w) => w !== widths[0]) }, ...(options.webkit ? [{ name: 'WebKit', browser: options.webkit, widths: anchorWidths }] : [])];
	for (const engine of engines) {
		for (const width of engine.widths) {
			for (const control of popups.slice(0, 3)) {
				if (spent()) {
					leftOut++;
					continue;
				}
				let repeat: Promise<{ old: Use; port: Use }> | undefined;
				const pair = async () => {
					const old = await use('old', control, click, width, { browser: engine.browser });
					return { old, port: old.missing ? old : await use('new', control, click, width, { browser: engine.browser }) };
				};
				const again = () => (repeat ??= pair());
				const first = await pair();
				if (!first.old.anchor) continue;
				if (!first.port.anchor) {
					const why = first.port.missing ?? 'no pop-up opens on the port';
					if (await confirmed(first, again, (o, p) => (o.anchor && !p.anchor ? true : undefined))) fail('behaviour', `pop-up at each width (${engine.name})`, `${control.key} opens a ${first.old.popupRole} at ${width} px wide`, why, HINTS.presence, width);
					continue;
				}
				const off = await confirmed(first, again, (o, p) => (o.anchor && p.anchor && anchorDiffers(o.anchor, p.anchor) ? describeAnchor(p.anchor) : undefined));
				if (off) fail('behaviour', `pop-up place (${engine.name})`, `${control.key} opens its ${first.old.popupRole} ${describeAnchor(first.old.anchor)}`, off, HINTS.anchor, width);
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
				leftOut++;
				continue;
			}
			keyTrials++;
			const press = async (page: Page) => {
				await page.locator('[data-markless-migrate-parity]').first().focus({ timeout: 3000 });
				for (const k of keys) {
					await page.keyboard.press(k);
					await page.waitForTimeout(150);
				}
			};
			let repeat: Promise<{ old: Use; port: Use }> | undefined;
			const pair = async () => {
				const old = await use('old', control, press);
				return { old, port: old.missing ? old : await use('new', control, press) };
			};
			const again = () => (repeat ??= pair());
			const first = await pair();
			if (first.old.missing || (first.old.url && first.old.url.split('?')[0] !== route.split('?')[0])) continue;
			const named = `${control.key} focused, then ${keys.join(', ')}`;
			if (first.port.missing) {
				fail('behaviour', 'keyboard', `${named}: ${effect(first.old)}`, first.port.missing, HINTS.key);
				continue;
			}
			const diffs = await confirmed(first, again, (o, p) => {
				const d = keyDifferences(o, p);
				return d.length ? d : undefined;
			});
			for (const [what, expected, actual] of diffs ?? []) fail('behaviour', `keyboard: ${what}`, `${named}: ${expected}`, actual, HINTS.key);
			const thrown = await confirmed(first, again, (o, p) => (thrownOnlyBy(o, p).length ? thrownOnlyBy(o, p).join('; ') : undefined));
			if (thrown) fail('behaviour', 'errors after a key', `${named} throws ${first.old.errors?.join('; ') || 'nothing'}`, `throws ${thrown}`, HINTS.error);
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
				leftOut++;
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
				await page.waitForTimeout(200);
				await parity(page, 'blur').catch(() => {});
			};
			let repeat: Promise<{ old: Use; port: Use }> | undefined;
			const pair = async () => {
				const old = await use('old', control, type, widths[0], { field: value });
				return { old, port: old.missing ? old : await use('new', control, type, widths[0], { field: value }) };
			};
			const again = () => (repeat ??= pair());
			const first = await pair();
			if (first.old.missing) continue;
			const named = `"${value}" typed into ${control.key}, then Enter and a blur`;
			if (first.port.missing) {
				fail('behaviour', 'field input', `${named}: the field takes it`, first.port.missing, HINTS.input);
				continue;
			}
			const diffs = await confirmed(first, again, (o, p) => {
				const d = inputDifferences(o, p);
				return d.length ? d : undefined;
			});
			for (const [what, expected, actual] of diffs ?? []) fail('behaviour', `field input: ${what}`, `${named}: ${expected}`, actual, HINTS.input);
			const thrown = await confirmed(first, again, (o, p) => (thrownOnlyBy(o, p).length ? thrownOnlyBy(o, p).join('; ') : undefined));
			if (thrown) fail('behaviour', 'errors after typing', `${named} throws ${first.old.errors?.join('; ') || 'nothing'}`, `throws ${thrown}`, HINTS.error);
		}
	}
	return { failures, shots, tried: tried + keyTrials + inputTrials, leftOut, ms: Date.now() - started };
}
