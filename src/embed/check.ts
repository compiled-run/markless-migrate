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

/** What activating an embed did, read 4 s after the click or key. */
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

/** A name for the embed a pair compares: the component's embed id, else the provider and key of the old embed's address. */
export function embedName(o: LiveEmbed, n: LiveEmbed | undefined): string {
	if (n?.role === 'component' && n.id) return n.id;
	if (o.role === 'widget') return `${o.src.replace(/^slot:/, '')}-${o.tag}`;
	const found = frameProvider(o.src);
	return found ? `${found.provider.id}-${found.key}`.replace(/[^A-Za-z0-9_-]+/g, '-') : `${o.tag}-${o.src.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9_-]+/g, '-')}`.slice(0, 80);
}

/** Runs in the page: marks the i-th live embed so Playwright can reach it. Must stay self-contained. */
function markTarget([index, list]: [number, LiveEmbed[]]): void {
	document.querySelector('[data-markless-migrate-target]')?.removeAttribute('data-markless-migrate-target');
	const want = list[index];
	if (!want) return;
	const near = (el: Element) => {
		const r = el.getBoundingClientRect();
		return Math.abs(Math.round(r.x + scrollX) - want.box.x) <= 1 && Math.abs(Math.round(r.y + scrollY) - want.box.y) <= 1 && Math.abs(Math.round(r.width) - want.box.width) <= 1 && Math.abs(Math.round(r.height) - want.box.height) <= 1;
	};
	const all: Element[] = [];
	const walk = (root: Document | ShadowRoot) => {
		for (const el of root.querySelectorAll('*')) {
			all.push(el);
			if (el.shadowRoot) walk(el.shadowRoot);
		}
	};
	walk(document);
	const el = all.find((e) => e.tagName.toLowerCase() === want.tag && near(e) && (want.role !== 'component' || e.getAttribute('data-markless-embed') === want.id));
	el?.setAttribute('data-markless-migrate-target', '');
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

export async function openSide(browser: Browser, env: SideEnv, route: string, viewport: Viewport, scheme: 'light' | 'dark', study = false): Promise<Side> {
	const { context, page } = await openPage(browser, { ...env, colorScheme: scheme }, viewport, { loops: true, shareThirdParty: true });
	try {
		if (study) await context.addInitScript(openShadowRoots);
		await loadPage(page, new URL(route, env.origin).href);
		await settle(page);
		await settleAndHoldLoops(page);
		await page.evaluate(() => scrollTo(0, 0));
		return { page, embeds: await page.evaluate(liveEmbeds, false), close: () => context.close() };
	} catch (error) {
		await context.close();
		throw error;
	}
}

export async function target(side: Side, index: number) {
	await side.page.evaluate(markTarget, [index, side.embeds] as [number, LiveEmbed[]]);
	return side.page.locator(`[${TARGET}]`).first();
}

/** The embed's box in the viewport, after its own content settled, padded so a shadow or focus ring is in the picture: the page scrolls it into view first, so a capture never resizes the viewport (which makes a player frame redraw). */
async function regionOf(side: Side, index: number): Promise<Box | undefined> {
	const fresh = await side.page.evaluate(liveEmbeds, false);
	const e = fresh[index] ?? side.embeds[index];
	if (!e) return undefined;
	const { width, height } = side.page.viewportSize() ?? { width: 1280, height: 800 };
	const top = Math.max(0, e.box.y - PAD - Math.max(0, Math.round((height - e.box.height - 2 * PAD) / 2)));
	await side.page.evaluate((y) => scrollTo(scrollX, y), top);
	const scrolled = await side.page.evaluate(() => ({ x: scrollX, y: scrollY }));
	const x = Math.max(0, e.box.x - PAD - scrolled.x);
	const y = Math.max(0, e.box.y - PAD - scrolled.y);
	return { x, y, width: Math.max(1, Math.min(width - x, e.box.width + 2 * PAD)), height: Math.max(1, Math.min(height - y, e.box.height + 2 * PAD)) };
}

async function shoot(side: Side, box: Box): Promise<Buffer> {
	return side.page.screenshot({ clip: box, animations: 'disabled', caret: 'hide' });
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
		const shot = await shoot(side, box);
		if (last?.equals(shot)) break;
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
	const inner = frame ? frame.locator(FOCUSABLE).first() : (await el.evaluate((e, sel) => e.matches(sel), FOCUSABLE).catch(() => false)) ? el : el.locator(FOCUSABLE).first();
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

/** Runs in the page: the boxes of the live values (`data-markless-embed-live`) inside the marked embed, in viewport coordinates. Must stay self-contained. */
function liveBoxes(): Box[] {
	const root = document.querySelector('[data-markless-migrate-target]');
	return [...(root?.querySelectorAll('[data-markless-embed-live]') ?? [])].map((el) => {
		const r = el.getBoundingClientRect();
		return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
	});
}

export async function stateShot(side: Side, index: number, state: EmbedState, ms: number): Promise<{ png: Buffer; box: Box; live: Box[] } | undefined> {
	if (!(await settleEmbed(side, index, ms))) return undefined;
	if (state === 'focus' && !(await focusInside(side, index))) return undefined;
	const box = await regionOf(side, index);
	if (!box) return undefined;
	if (state === 'hover') {
		const el = await target(side, index);
		await el.hover({ timeout: 2000, force: true }).catch(() => {});
		await side.page.waitForTimeout(400);
	} else if (state === 'focus') await side.page.waitForTimeout(300);
	const png = await shoot(side, box);
	await target(side, index);
	const live = (await side.page.evaluate(liveBoxes)).map((b) => ({ ...b, x: b.x - box.x, y: b.y - box.y }));
	await side.page.mouse.move(0, 0);
	await side.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	return { png, box, live };
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
	await page.route('**/*', (route) => {
		const request = route.request();
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
			navigations.push(where(request.url()));
			return route.abort();
		}
		return route.fallback();
	});
	try {
		if (how === 'click') {
			const el = await target(side, index);
			await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
			const r = await el.boundingBox();
			if (!r) return { navigations, frames: [], playing: false, error: 'the embed has no box' };
			await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
		} else {
			if (!(await focusInside(side, index))) return { navigations, frames: await page.evaluate(framesIn, { ...e.box }), playing: false, error: 'no control inside it takes keyboard focus' };
			await page.keyboard.press('Enter');
		}
		await page.waitForTimeout(4000);
		const frames = await page.evaluate(framesIn, { ...e.box });
		return { navigations: [...new Set(navigations)].sort(), frames, playing: await mediaPlaying(page, frames) };
	} finally {
		await page.unroute('**/*').catch(() => {});
	}
}

export const describeActivation = (a: Activation) => [a.error ?? '', a.frames.length ? `in its place: ${a.frames.join(', ')}` : 'nothing loads in its place', a.playing ? 'media playing' : 'nothing playing', a.navigations.length ? `leads to ${a.navigations.join(', ')}` : 'goes nowhere'].filter(Boolean).join('; ');

export function sameActivation(o: Activation, n: Activation): boolean {
	const frames = (a: Activation) => JSON.stringify(a.frames.map((f) => f.replace(/^(\S+ https:\/\/www\.youtube)(-nocookie)?(\.com\/embed)/, '$1$3')));
	return frames(o) === frames(n) && o.playing === n.playing && JSON.stringify(o.navigations) === JSON.stringify(n.navigations);
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

const HINT_VISUAL = 'The Markless component standing in for this embed must show what the settled old embed shows, pixel for pixel: open the old, new and diff images, compare against the embed study (markless-migrate embeds) and fix the component\'s markup, data and CSS. A kept embed that differs was changed by the port.';
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
	const pairs = probeOld.embeds.map((o, i) => ({ i, o, n: probeNew.embeds[i] })).filter(({ o, n }) => {
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
				for (const { i, o, n } of pairs) {
					const result = results.get(embedName(o, n))!;
					if (!n) continue;
					for (const state of STATES) {
						const [a, b, c] = [await stateShot(sides[0]!, i, state, ms), await stateShot(sides[1]!, i, state, ms), await stateShot(sides[2]!, i, state, ms)];
						if (!a) continue;
						const label = `${viewport.name}-${scheme}-${state}`;
						if (!c) {
							failures.push({ route, dimension: 'visual', check: `embed ${result.name} ${scheme} ${state}`, viewport: viewport.name, expected: `the old embed ${state === 'focus' ? 'takes keyboard focus' : 'shows'}`, actual: state === 'focus' ? 'nothing inside the new one takes keyboard focus' : 'the new page has nothing in its place', hint: HINT_VISUAL });
							continue;
						}
						const diff: VisualDiff = identicalShots(a.png, c.png) ?? compareWithNoise(a.png, c.png, b ? [b.png] : [], []);
						const ok = !visuallyDifferent(diff);
						// The component's live values (a count read at convert time) may have moved on the provider since: offered for automatic acceptance only when nothing else differs.
						const moved = !ok && c.live.length && !diff.sizeMismatch && !visuallyDifferent(compareWithNoise(a.png, c.png, b ? [b.png] : [], c.live)) ? { rule: 'embed-live-data' as const, reason: `only the component's live value differs (${c.live.length} element(s) marked data-markless-embed-live): the provider's value moved since the component's data was read` } : undefined;
						const files = await saveImages(options.dir, result.name, label, { old: a.png, new: c.png, diff: diff.png });
						result.visual.push({ viewport: viewport.name, scheme, state, differing: diff.differing, area: diff.area, ok, files });
						shots.push({ label: `embed ${result.name} ${scheme} ${state}`, viewport: viewport.name, old: a.png, new: c.png, ...(diff.png ? { diff: diff.png } : {}), regions: diff.regions, ok });
						if (!ok) {
							const size = diff.sizeMismatch ? `the embed's picture is ${diff.sizeMismatch.actual}, the old one's ${diff.sizeMismatch.expected}; ` : '';
							failures.push({ route, dimension: 'visual', check: `embed ${result.name} ${scheme} ${state}`, viewport: viewport.name, expected: `the settled old embed's pixels (${a.box.width - 2 * PAD}x${a.box.height - 2 * PAD})`, actual: `${size}${diff.differing} pixels (${((100 * diff.differing) / Math.max(1, diff.area)).toFixed(2)}%) differ${files.length ? `; old, new and diff: ${files.join(', ')}` : ''}`, hint: HINT_VISUAL, ...(moved ? { automatic: moved } : {}) });
						}
					}
				}
			} finally {
				await Promise.all(sides.map((s) => s.close()));
			}
		}
	}
	for (const { i, o, n } of pairs) {
		const result = results.get(embedName(o, n))!;
		if (!n) {
			failures.push({ route, dimension: 'rendered', check: `embed ${result.name}`, viewport: first.name, expected: `<${o.tag}> ${o.src}`, actual: '(absent): no Markless component marked data-markless-embed and no kept embed in its place', hint: HINT_VISUAL });
			continue;
		}
		for (const viewport of viewports) {
			// A provider's player runs on the real clock: frozen time stalls it inside its frame, so activation is probed unfrozen.
			const run = async (env: SideEnv, how: 'click' | 'keyboard') => {
				const side = await openSide(browser, { ...env, freeze: false }, route, viewport, 'light');
				try {
					return await activate(side, i, how);
				} finally {
					await side.close();
				}
			};
			const old = await run(envs.old, 'click');
			for (const how of ['click', 'keyboard'] as const) {
				const next = await run(envs.new, how);
				const ok = sameActivation(old, next) && !next.error;
				result.activation.push({ viewport: viewport.name, how, old, new: next, ok });
				if (!ok) failures.push({ route, dimension: 'behaviour', check: `embed ${result.name} activation by ${how}`, viewport: viewport.name, expected: `as the old embed on a click: ${describeActivation(old)}`, actual: describeActivation(next), hint: HINT_ACTIVATION });
			}
		}
	}
	if (options.dir) for (const r of results.values()) await writeFile(join(options.dir, r.name, 'check', 'result.json'), `${JSON.stringify(r, null, '\t')}\n`).catch(() => {});
	return { failures, shots, results: [...results.values()] };
}
