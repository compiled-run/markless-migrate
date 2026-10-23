import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Frame, Page } from 'playwright';
import { openPage, type SideEnv } from '../check/browser.ts';
import { settle } from '../check/capture.ts';
import { liveEmbeds, type LiveEmbed } from '../check/embeds.ts';
import { loadPage } from '../check/infrastructure.ts';
import { settleAndHoldLoops } from '../check/loops.ts';
import type { Box, Failure, Shot, Viewport } from '../check/types.ts';
import { compareWithNoise, identicalShots, visuallyDifferent, type VisualDiff } from '../check/visual.ts';
import { openShadowRoots } from './page.ts';
import { PNG } from 'pngjs';
import { frameProvider } from './providers.ts';

export type EmbedState = 'rest' | 'hover' | 'focus';
const STATES: readonly EmbedState[] = ['rest', 'hover', 'focus'];
const SCHEMES = ['light', 'dark'] as const;
const PAD = 8;
const TARGET = 'data-markless-migrate-target';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export interface EmbedCheckOptions {
	/** Embeds already checked in this run, by name and the old element's tag, with the route that checked them: an embed shared by many pages (a header's button) is checked once. */
	readonly claimed: Map<string, string>;
	/** Where each embed's old, new and diff images go for the agent: `<dir>/<name>/check/`. */
	readonly dir?: string;
	/** How long an embed may take to settle after the page has (default 6 s). */
	readonly settleMs?: number;
}

/** What activating an embed did: read once it plays or leads somewhere, or 10 s after the click or key. */
export interface Activation {
	/** Pages it opened or led to, by origin and path. */
	readonly navigations: readonly string[];
	/** Frames and media elements in its place, by tag, origin and path. */
	readonly frames: readonly string[];
	/** Whether a video or audio in its place is playing. */
	readonly playing: boolean;
	readonly error?: string;
}

export interface EmbedPairResult {
	readonly name: string;
	readonly route: string;
	readonly kind: 'component' | 'kept' | 'missing';
	readonly visual: readonly { readonly viewport: string; readonly scheme: string; readonly state: EmbedState; readonly differing: number; readonly area: number; readonly ok: boolean; readonly files?: readonly string[] }[];
	readonly activation: readonly { readonly viewport: string; readonly how: 'click' | 'keyboard'; readonly old: Activation; readonly new: Activation; readonly ok: boolean }[];
}

/** An embed's identity on any page of the route: its element and address (a component's embed id), and which of the same it is. */
export interface EmbedIdentity {
	readonly sig: string;
	readonly nth: number;
}

const signature = (e: LiveEmbed) => `${e.tag}|${e.src}`;

export function identityOf(list: readonly LiveEmbed[], index: number): EmbedIdentity {
	const sig = signature(list[index]!);
	return { sig, nth: list.slice(0, index).filter((e) => signature(e) === sig).length };
}

/** Where an embed is on another load of the route (another viewport hides or shows some), or -1. */
export function indexOf(list: readonly LiveEmbed[], id: EmbedIdentity): number {
	let seen = 0;
	for (const [i, e] of list.entries()) if (signature(e) === id.sig && seen++ === id.nth) return i;
	return -1;
}

/** A name for the embed a pair compares: the component's embed id, else the provider and key of the old embed's address. */
export function embedName(o: LiveEmbed, n: LiveEmbed | undefined): string {
	if (n?.role === 'component' && n.id) return n.id;
	if (o.role === 'widget') return `${o.src.replace(/^slot:/, '')}-${o.tag}`;
	const found = frameProvider(o.src);
	return found ? `${found.provider.id}-${found.key}`.replace(/[^A-Za-z0-9_-]+/g, '-') : `${o.tag}-${o.src.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9_-]+/g, '-')}`.slice(0, 80);
}

/** Runs in the page: marks the i-th live embed so Playwright can reach it: a component by its embed id, a frame by its address, a widget by its tag, the nearest to where it was if there are several. Must stay self-contained. */
function markTarget([index, list]: [number, LiveEmbed[]]): void {
	const MARKED = 'data-markless-migrate-target';
	for (const el of document.querySelectorAll(`[${MARKED}]`)) el.removeAttribute(MARKED);
	const want = list[index];
	if (!want) return;
	const all: Element[] = [];
	const walk = (root: Document | ShadowRoot) => {
		for (const el of root.querySelectorAll('*')) {
			all.push(el);
			if (el.shadowRoot) walk(el.shadowRoot);
		}
	};
	walk(document);
	const address = (el: Element) => {
		const url = URL.parse(el.getAttribute(el.localName === 'object' ? 'data' : 'src') ?? '', location.href);
		return url ? (url.origin === location.origin ? url.pathname : `${url.origin}${url.pathname}`) : '';
	};
	const same = (el: Element) => {
		if (el.localName !== want.tag) return false;
		if (want.role === 'component') return el.getAttribute('data-markless-embed') === want.id;
		if (want.role === 'widget') return true;
		return want.tag === 'video' || address(el) === want.src;
	};
	const distance = (el: Element) => {
		const r = el.getBoundingClientRect();
		return Math.abs(r.x + scrollX - want.box.x) + Math.abs(r.y + scrollY - want.box.y) + Math.abs(r.width - want.box.width) + Math.abs(r.height - want.box.height);
	};
	const el = all.filter(same).sort((a, b) => distance(a) - distance(b))[0];
	el?.setAttribute(MARKED, '');
}

/** Runs in the page: frames and media elements that overlap a box, by tag, origin and path. Must stay self-contained. */
function framesIn(box: Box): string[] {
	const out: string[] = [];
	const walk = (root: Document | ShadowRoot) => {
		for (const el of root.querySelectorAll('*')) {
			if (el.matches('iframe, video, audio, embed, object')) {
				const r = el.getBoundingClientRect();
				const x = r.x + scrollX;
				const y = r.y + scrollY;
				if (r.width > 0 && r.height > 0 && x < box.x + box.width && x + r.width > box.x && y < box.y + box.height && y + r.height > box.y) {
					const raw = el.getAttribute(el.localName === 'object' ? 'data' : 'src') ?? (el as HTMLMediaElement).currentSrc ?? '';
					const url = URL.parse(raw, location.href);
					out.push(`${el.localName} ${url && /^https?:$/.test(url.protocol) ? `${url.origin}${url.pathname}` : raw.slice(0, 60)}`);
				}
			}
			if (el.shadowRoot) walk(el.shadowRoot);
		}
	};
	walk(document);
	return out.sort();
}

const where = (url: string) => {
	const u = URL.parse(url);
	return u && /^https?:$/.test(u.protocol) ? `${u.origin}${u.pathname.replace(/\/$/, '')}` : url;
};

export interface Side {
	readonly page: Page;
	readonly embeds: LiveEmbed[];
	close(): Promise<void>;
}

/** A page for the embed step: settled and held like the checker's other captures, or, `live`, as a visitor gets it (real clock, its own loops, every third-party answer fetched afresh), which a player needs to play. */
export async function openSide(browser: Browser, env: SideEnv, route: string, viewport: Viewport, scheme: 'light' | 'dark', options: { readonly study?: boolean; readonly live?: boolean } = {}): Promise<Side> {
	const { context, page } = await openPage(browser, { ...env, colorScheme: scheme, ...(options.live ? { freeze: false as const } : {}) }, viewport, options.live ? { embedWrites: true } : { loops: true, shareThirdParty: true });
	try {
		if (options.study) await context.addInitScript(openShadowRoots);
		await loadPage(page, new URL(route, env.origin).href);
		await settle(page);
		if (!options.live) await settleAndHoldLoops(page);
		await page.evaluate(() => scrollTo(0, 0));
		return { page, embeds: await page.evaluate(liveEmbeds, false), close: () => context.close().catch(() => {}) };
	} catch (error) {
		await context.close();
		throw error;
	}
}

export async function target(side: Side, index: number) {
	await side.page.evaluate(markTarget, [index, side.embeds] as [number, LiveEmbed[]]);
	return side.page.locator(`[${TARGET}]`).first();
}

/** The embed's box as it now is, after its own content settled, in page coordinates. */
async function regionOf(side: Side, index: number): Promise<Box | undefined> {
	const fresh = await side.page.evaluate(liveEmbeds, false);
	return (fresh[index] ?? side.embeds[index])?.box;
}

/** A picture of the embed element itself: Playwright scrolls it into view and maps a zoomed-out phone page's scale, without resizing the viewport (which makes a player frame redraw). */
async function shoot(side: Side, index: number): Promise<Buffer | undefined> {
	const el = await target(side, index);
	return el.screenshot({ animations: 'disabled', caret: 'hide', timeout: 10_000 }).catch(() => undefined);
}

/** Scrolls the embed into view and waits until two pictures of it in a row are the same: its frames loaded and drew. */
async function settleEmbed(side: Side, index: number, ms: number): Promise<Box | undefined> {
	const el = await target(side, index);
	await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
	const frame = await el.elementHandle({ timeout: 2000 }).then((h) => h?.contentFrame() ?? null).catch(() => null);
	await frame?.waitForLoadState('load', { timeout: ms }).catch(() => {});
	const deadline = Date.now() + ms;
	let last: Buffer | undefined;
	let box = await regionOf(side, index);
	while (box && Date.now() < deadline) {
		await side.page.waitForTimeout(400);
		box = await regionOf(side, index);
		if (!box) break;
		const shot = await shoot(side, index);
		if (!shot || last?.equals(shot)) break;
		last = shot;
	}
	return box;
}

/** Runs in the page: focuses the last focusable element before the marked embed, so a Tab lands on the embed's first control even inside a closed shadow root. Must stay self-contained. */
function focusBefore(selector: string): boolean {
	const target = document.querySelector('[data-markless-migrate-target]');
	if (!target) return false;
	let before: HTMLElement | undefined;
	for (const el of document.querySelectorAll<HTMLElement>(selector)) {
		if (el === target || target.contains(el)) break;
		if (target.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) break;
		if (el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') before = el;
	}
	if (before) before.focus();
	else (document.activeElement as HTMLElement | null)?.blur();
	return true;
}

/** The first control a keyboard reaches inside the embed, in its frame when it is one; a widget in a closed shadow root is reached by Tab from the control before it. */
async function focusInside(side: Side, index: number): Promise<boolean> {
	const el = await target(side, index);
	const frame = await el.elementHandle({ timeout: 2000 }).then((h) => h?.contentFrame() ?? null).catch(() => null);
	const inner = frame ? frame.locator(FOCUSABLE).first() : (await el.evaluate((e, sel) => e.matches(sel), FOCUSABLE, { timeout: 3000 }).catch(() => false)) ? el : el.locator(FOCUSABLE).first();
	if (await inner.count().catch(() => 0)) {
		await inner.focus({ timeout: 2000 }).catch(() => {});
		// A key press makes the focus a keyboard one, so :focus-visible shows as it would for a visitor tabbing in.
		await side.page.keyboard.press('Shift+Tab');
		await side.page.keyboard.press('Tab');
		return true;
	}
	if (!(await side.page.evaluate(focusBefore, FOCUSABLE))) return false;
	await side.page.keyboard.press('Tab');
	return side.page.evaluate(() => {
		const t = document.querySelector('[data-markless-migrate-target]');
		const a = document.activeElement;
		return Boolean(t && a && (t === a || t.contains(a)));
	});
}

/** Runs in the page: the marked embed's width and the boxes of its live values (`data-markless-embed-live`), relative to it, in CSS pixels. Must stay self-contained. */
function liveBoxes(): { width: number; boxes: Box[] } {
	const root = document.querySelector('[data-markless-migrate-target]');
	if (!root) return { width: 1, boxes: [] };
	const o = root.getBoundingClientRect();
	return { width: o.width || 1, boxes: [...root.querySelectorAll('[data-markless-embed-live]')].map((el) => {
		const r = el.getBoundingClientRect();
		return { x: r.x - o.x, y: r.y - o.y, width: r.width, height: r.height };
	}) };
}

/** Runs in the page: whether the marked embed is drawn at all: visible, and not clipped away by an ancestor that hides its overflow. Must stay self-contained. */
function drawn(): boolean {
	const el = document.querySelector('[data-markless-migrate-target]');
	if (!el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
	const r = el.getBoundingClientRect();
	for (let up = el.parentElement; up; up = up.parentElement) {
		const s = getComputedStyle(up);
		if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
		const c = up.getBoundingClientRect();
		if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) return false;
	}
	return true;
}

export async function stateShot(side: Side, index: number, state: EmbedState, ms: number): Promise<{ png: Buffer; box: Box; live: Box[]; drawn: boolean } | undefined> {
	if (!(await settleEmbed(side, index, ms))) return undefined;
	if (state === 'focus' && !(await focusInside(side, index))) return undefined;
	const box = await regionOf(side, index);
	if (!box) return undefined;
	if (state === 'hover') {
		const el = await target(side, index);
		await el.hover({ timeout: 2000, force: true }).catch(() => {});
		await side.page.waitForTimeout(400);
	} else if (state === 'focus') await side.page.waitForTimeout(300);
	const png = await shoot(side, index);
	if (!png) return undefined;
	const found = await side.page.evaluate(liveBoxes);
	const visible = await side.page.evaluate(drawn).catch(() => true);
	// The picture is in device pixels, scaled again on a zoomed-out phone page: the boxes follow it.
	const scale = png.readUInt32BE(16) / found.width;
	const live = found.boxes.map((b) => ({ x: Math.round(b.x * scale), y: Math.round(b.y * scale), width: Math.round(b.width * scale), height: Math.round(b.height * scale) }));
	await side.page.mouse.move(0, 0);
	await side.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	return { png, box, live, drawn: visible };
}

async function mediaPlaying(page: Page, frames: readonly string[]): Promise<boolean> {
	const origins = new Set(frames.map((f) => URL.parse(f.split(' ')[1] ?? '')?.origin).filter(Boolean));
	const candidates: Frame[] = page.frames().filter((f) => f === page.mainFrame() || origins.has(URL.parse(f.url())?.origin));
	for (const f of candidates) {
		const playing = await f.evaluate(() => [...document.querySelectorAll('video, audio')].some((m) => !(m as HTMLMediaElement).paused && (m as HTMLMediaElement).currentTime > 0)).catch(() => false);
		if (playing) return true;
	}
	return false;
}

const navigationHolds = new WeakMap<Page, { onNavigation?: (url: string) => void }>();

/**
 * Aborts the page's own navigations while held, handing each URL to onNavigation. The route stays on the page for its
 * lifetime: unrouting it while a request is between it and the context's route makes Playwright answer that request
 * twice ("Route is already handled!"), an unhandled rejection that ends the whole check.
 */
export async function holdNavigations(page: Page, onNavigation: (url: string) => void): Promise<() => void> {
	let hold = navigationHolds.get(page);
	if (!hold) {
		const state: { onNavigation?: (url: string) => void } = {};
		hold = state;
		navigationHolds.set(page, state);
		await page.route('**/*', (route) => {
			const request = route.request();
			if (state.onNavigation && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
				state.onNavigation(request.url());
				return route.abort();
			}
			return route.fallback();
		});
	}
	const held = hold;
	held.onNavigation = onNavigation;
	return () => {
		if (held.onNavigation === onNavigation) held.onNavigation = undefined;
	};
}

/** Clicks the embed's middle, or reaches its first control by keyboard and presses Enter, and reads what that did. */
export async function activate(side: Side, index: number, how: 'click' | 'keyboard'): Promise<Activation> {
	const page = side.page;
	const box = await settleEmbed(side, index, 6000);
	const e = side.embeds[index];
	if (!box || !e) return { navigations: [], frames: [], playing: false, error: 'the embed is not on the page' };
	const navigations: string[] = [];
	page.context().on('page', (popup) => {
		const settled = /^https?:/.test(popup.url()) ? Promise.resolve() : popup.waitForURL(/^https?:/, { timeout: 3500 }).catch(() => {});
		void settled.then(() => {
			navigations.push(where(popup.url()));
			return popup.close();
		});
	});
	const release = await holdNavigations(page, (url) => navigations.push(where(url)));
	try {
		if (how === 'click') {
			const el = await target(side, index);
			await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
			const r = await el.boundingBox({ timeout: 3000 }).catch(() => null);
			if (!r) return { navigations, frames: [], playing: false, error: 'the embed has no box' };
			await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
		} else {
			if (!(await focusInside(side, index))) return { navigations, frames: await page.evaluate(framesIn, { ...e.box }), playing: false, error: 'no control inside it takes keyboard focus' };
			await page.keyboard.press('Enter');
		}
		// A component loads the player only now, where the old one was loaded with the page: what it does is read as soon as it plays or leads somewhere, within 10 s.
		let frames: string[] = [];
		let playing = false;
		for (const deadline = Date.now() + 10_000; Date.now() < deadline; ) {
			await page.waitForTimeout(500);
			frames = await page.evaluate(framesIn, { ...e.box });
			playing = await mediaPlaying(page, frames);
			if (playing || navigations.length) break;
		}
		await page.waitForTimeout(300);
		return { navigations: [...new Set(navigations)].sort(), frames, playing };
	} finally {
		release();
	}
}

export const describeActivation = (a: Activation) => [a.error ?? '', a.frames.length ? `in its place: ${a.frames.join(', ')}` : 'nothing loads in its place', a.playing ? 'media playing' : 'nothing playing', a.navigations.length ? `leads to ${a.navigations.join(', ')}` : 'goes nowhere'].filter(Boolean).join('; ');

export function sameActivation(o: Activation, n: Activation): boolean {
	const frames = (a: Activation) => JSON.stringify(a.frames.map((f) => f.replace(/^(\S+ https:\/\/www\.youtube)(-nocookie)?(\.com\/embed)/, '$1$3')));
	const navigations = JSON.stringify(o.navigations) === JSON.stringify(n.navigations);
	// Activation that leads to the same pages on both sides is the same, whatever frame stays in place (the old button's own frame, which a component has none of).
	const led = navigations && o.navigations.length > 0;
	return (led || frames(o) === frames(n)) && o.playing === n.playing && navigations;
}

/** The one colour a picture is all of, or undefined: an embed drawn nowhere it has a box. */
function blank(png: Buffer): string | undefined {
	const { data } = PNG.sync.read(png);
	for (let i = 4; i < data.length; i += 4) if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2] || data[i + 3] !== data[3]) return undefined;
	return `${data[0]},${data[1]},${data[2]},${data[3]}`;
}

async function saveImages(dir: string | undefined, name: string, label: string, images: Record<string, Buffer | undefined>): Promise<string[]> {
	if (!dir) return [];
	const folder = join(dir, name, 'check');
	await mkdir(folder, { recursive: true });
	const files: string[] = [];
	for (const [kind, png] of Object.entries(images)) {
		if (!png) continue;
		const file = join(folder, `${label}-${kind}.png`);
		await writeFile(file, png);
		files.push(file);
	}
	return files;
}

const HINT_VISUAL = 'The Markless component standing in for this embed must show what the settled old embed shows, pixel for pixel: open the old, new and diff images, compare against the embed study (markless-migrate embeds) and fix the component\'s markup, data and CSS. A value the provider keeps changing (a star or view count) goes on an element marked data-markless-embed-live: when only it differs, the difference is accepted automatically. A kept embed that differs was changed by the port.';
const HINT_ACTIVATION = 'Activating the embed (a click on its middle, or Enter on its first control) must do what it does on the old page: load the original embed unchanged (and play, when the old one plays on that click), or lead to the same pages. Load the original on activation when in doubt.';

/**
 * The embed step of a route: every embed on the old page against what the new page has in its place (a Markless
 * component marked `data-markless-embed`, or the same embed kept), pixel for pixel at desktop and mobile, in light and
 * dark, at rest, hovered and focused (two old loads give the noise), then what activating it by click and by keyboard
 * does. An embed already checked on another route of this run is left to that route.
 */
export async function checkEmbeds(browser: Browser, envs: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewports: readonly Viewport[], options: EmbedCheckOptions): Promise<{ failures: Failure[]; shots: Shot[]; results: EmbedPairResult[] }> {
	const failures: Failure[] = [];
	const shots: Shot[] = [];
	const ms = options.settleMs ?? 6000;
	const first = viewports[0]!;
	const probeOld = await openSide(browser, envs.old, route, first, 'light');
	const probeNew = await openSide(browser, envs.new, route, first, 'light').catch(async (error) => {
		await probeOld.close();
		throw error;
	});
	const pairs = probeOld.embeds.map((o, i) => ({ i, o, n: probeNew.embeds[i], oldId: identityOf(probeOld.embeds, i), newId: probeNew.embeds[i] ? identityOf(probeNew.embeds, i) : undefined })).filter(({ o, n }) => {
		const key = `${embedName(o, n)}|${o.tag}`;
		if (options.claimed.has(key)) return false;
		options.claimed.set(key, route);
		return true;
	});
	await Promise.all([probeOld.close(), probeNew.close()]);
	if (!pairs.length) return { failures, shots, results: [] };
	const results = new Map(pairs.map(({ o, n }) => [embedName(o, n), { name: embedName(o, n), route, kind: !n ? ('missing' as const) : n.role === 'component' ? ('component' as const) : ('kept' as const), visual: [] as EmbedPairResult['visual'][number][], activation: [] as EmbedPairResult['activation'][number][] }]));
	for (const viewport of viewports) {
		for (const scheme of SCHEMES) {
			const sides = [await openSide(browser, envs.old, route, viewport, scheme), await openSide(browser, envs.old, route, viewport, scheme), await openSide(browser, envs.new, route, viewport, scheme)];
			try {
				for (const { o, n, oldId, newId } of pairs) {
					const result = results.get(embedName(o, n))!;
					if (!n || !newId) continue;
					const [ia, ib, ic] = [indexOf(sides[0]!.embeds, oldId), indexOf(sides[1]!.embeds, oldId), indexOf(sides[2]!.embeds, newId)];
					// Hidden on the old page at this viewport (a navbar button on a phone): the new one must be hidden too.
					if (ia < 0) {
						if (ic >= 0) failures.push({ route, dimension: 'visual', check: `embed ${result.name} ${scheme}`, viewport: viewport.name, expected: 'hidden, as the old embed is at this viewport', actual: `shown (${sides[2]!.embeds[ic]!.box.width}x${sides[2]!.embeds[ic]!.box.height})`, hint: HINT_VISUAL });
						continue;
					}
					for (const state of STATES) {
						const shot = (side: Side, at: number) => (at < 0 ? Promise.resolve(undefined) : stateShot(side, at, state, ms).catch(() => undefined));
						const [a, b, c] = [await shot(sides[0]!, ia), await shot(sides[1]!, ib), await shot(sides[2]!, ic)];
						if (!a) continue;
						const label = `${viewport.name}-${scheme}-${state}`;
						if (!c) {
							failures.push({ route, dimension: 'visual', check: `embed ${result.name} ${scheme} ${state}`, viewport: viewport.name, expected: `the old embed ${state === 'focus' ? 'takes keyboard focus' : 'shows'}`, actual: state === 'focus' ? 'nothing inside the new one takes keyboard focus' : 'the new page has nothing in its place', hint: HINT_VISUAL });
							continue;
						}
						// An embed with a box but drawn nowhere on either side (inside a collapsed phone menu) shows the same: nothing.
						if ((!a.drawn && !c.drawn) || (blank(a.png) && blank(a.png) === blank(c.png))) {
							result.visual.push({ viewport: viewport.name, scheme, state, differing: 0, area: 0, ok: true });
							continue;
						}
						const diff: VisualDiff = identicalShots(a.png, c.png) ?? compareWithNoise(a.png, c.png, b ? [b.png] : [], []);
						// A box rounded a pixel or two differently, with every shared pixel the same, is the same picture: boxes compare within 2 px everywhere else.
						const rounding = Boolean(diff.sizeMismatch) && diff.differing === 0 && (() => {
							const [ew, eh] = diff.sizeMismatch!.expected.split('x').map(Number);
							const [aw, ah] = diff.sizeMismatch!.actual.split('x').map(Number);
							return Math.abs(ew! - aw!) <= 2 && Math.abs(eh! - ah!) <= 2;
						})();
						const ok = rounding || !visuallyDifferent(diff);
						// The component's live values (a count read at convert time) may have moved on the provider since: offered for automatic acceptance only when nothing else differs.
						const moved = !ok && c.live.length && !diff.sizeMismatch && !visuallyDifferent(compareWithNoise(a.png, c.png, b ? [b.png] : [], c.live)) ? { rule: 'embed-live-data' as const, reason: `only the component's live value differs (${c.live.length} element(s) marked data-markless-embed-live): the provider's value moved since the component's data was read` } : undefined;
						const files = await saveImages(options.dir, result.name, label, { old: a.png, new: c.png, diff: diff.png });
						result.visual.push({ viewport: viewport.name, scheme, state, differing: diff.differing, area: diff.area, ok, files });
						shots.push({ label: `embed ${result.name} ${scheme} ${state}`, viewport: viewport.name, old: a.png, new: c.png, ...(diff.png ? { diff: diff.png } : {}), regions: diff.regions, ok });
						if (!ok) {
							const size = diff.sizeMismatch ? `the embed's picture is ${diff.sizeMismatch.actual}, the old one's ${diff.sizeMismatch.expected}; ` : '';
							failures.push({ route, dimension: 'visual', check: `embed ${result.name} ${scheme} ${state}`, viewport: viewport.name, expected: `the settled old embed's pixels (${a.box.width}x${a.box.height})`, actual: `${size}${diff.differing} pixels (${((100 * diff.differing) / Math.max(1, diff.area)).toFixed(2)}%) differ${files.length ? `; old, new and diff: ${files.join(', ')}` : ''}`, hint: HINT_VISUAL, ...(moved ? { automatic: moved } : {}) });
						}
					}
				}
			} finally {
				await Promise.all(sides.map((s) => s.close()));
			}
		}
	}
	for (const { o, n } of pairs) {
		if (n) continue;
		const result = results.get(embedName(o, n))!;
		failures.push({ route, dimension: 'rendered', check: `embed ${result.name}`, viewport: first.name, expected: `<${o.tag}> ${o.src}`, actual: '(absent): no Markless component marked data-markless-embed and no kept embed in its place', hint: HINT_VISUAL });
	}
	const present = pairs.filter((p) => p.n && p.newId);
	// Each embed is activated in turn on one page per side, way and viewport: a click or key never takes the page away (a new tab is recorded and closed, a navigation is recorded and stopped).
	const activateAll = async (env: SideEnv, viewport: Viewport, how: 'click' | 'keyboard', ids: readonly EmbedIdentity[]): Promise<(Activation | undefined)[]> => {
		const side = await openSide(browser, env, route, viewport, 'light', { live: true });
		try {
			const out: (Activation | undefined)[] = [];
			for (const id of ids) {
				const at = indexOf(side.embeds, id);
				out.push(at < 0 ? undefined : await activate(side, at, how).catch((error: Error): Activation => ({ navigations: [], frames: [], playing: false, error: `activating it failed: ${error.message.split('\n')[0]}` })));
			}
			return out;
		} finally {
			await side.close();
		}
	};
	if (present.length) {
		for (const viewport of viewports) {
			const oldIds = present.map((p) => p.oldId);
			const newIds = present.map((p) => p.newId!);
			const clicked = await activateAll(envs.old, viewport, 'click', oldIds);
			const keyed = await activateAll(envs.old, viewport, 'keyboard', oldIds);
			const next = { click: await activateAll(envs.new, viewport, 'click', newIds), keyboard: await activateAll(envs.new, viewport, 'keyboard', newIds) };
			present.forEach(({ o, n }, k) => {
				const result = results.get(embedName(o, n))!;
				if (!clicked[k]) return;
				for (const how of ['click', 'keyboard'] as const) {
					const got = next[how][k] ?? { navigations: [], frames: [], playing: false, error: 'the embed is not on the page at this viewport' };
					// By keyboard, an embed may do what the old one does by keyboard, or what a click on it does (a component's play button is reached by Tab where the old player's first control is a link).
					const options = how === 'click' ? [clicked[k]!] : [keyed[k], ...(n!.role === 'component' ? [clicked[k]!] : [])].filter((a): a is Activation => Boolean(a));
					const old = options.find((a) => sameActivation(a, got) && (!got.error || Boolean(a.error))) ?? options[0]!;
					const ok = options.some((a) => sameActivation(a, got) && (!got.error || Boolean(a.error)));
					result.activation.push({ viewport: viewport.name, how, old, new: got, ok });
					if (!ok) failures.push({ route, dimension: 'behaviour', check: `embed ${result.name} activation by ${how}`, viewport: viewport.name, expected: how === 'click' ? `as the old embed on a click: ${describeActivation(old)}` : `as the old embed by keyboard or on a click: ${options.map(describeActivation).join(' / or / ')}`, actual: describeActivation(got), hint: HINT_ACTIVATION });
				}
			});
		}
	}
	if (options.dir) for (const r of results.values()) await writeFile(join(options.dir, r.name, 'check', 'result.json'), `${JSON.stringify(r, null, '\t')}\n`).catch(() => {});
	return { failures, shots, results: [...results.values()] };
}
