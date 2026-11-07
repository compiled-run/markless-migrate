// What moves with the scroll position: an element faded or slid in as it enters the screen and out as it leaves, or mapped to the position (a framer useScroll), read at the same positions scrolling down and back up, old and new.
import type { Browser } from 'playwright';
import type { SideEnv } from './browser.ts';
import { openSession } from './journeys.ts';
import { motionEnv } from './motion.ts';
import type { Viewport } from './types.ts';
import type { ScrollRow, ScrollSample } from './scroll-motion-compare.ts';

/** Positions down the page, as shares of how far it scrolls; the way back up reads the same ones again. */
const STEPS = 8;
const MAX_TRACKS = 60;

/** Runs in the page: scrolls down in steps and back up, waits at each position for what it started to finish, and reads every element that moves or fades there; `want` are read wherever they are, moving or not. */
export async function sampleScrollPage({ steps, max, want }: { steps: number; max: number; want: readonly string[] }): Promise<ScrollSample> {
	const reach = document.documentElement.scrollHeight - innerHeight;
	if (reach < innerHeight / 4) return { positions: [], tracks: [] };
	const shares = [...Array.from({ length: steps + 1 }, (_, i) => i / steps), ...Array.from({ length: steps }, (_, i) => (steps - 1 - i) / steps)];
	const positions = shares.map((s, i) => `${i <= steps ? 'down' : 'up'} ${Math.round(s * 100)}%`);
	const els = [...document.body.querySelectorAll('*')].filter((e) => !(e instanceof HTMLScriptElement || e instanceof HTMLStyleElement)).slice(0, 4000);
	const count = new Map<string, number>();
	const sigOf = new Map<Element, string>();
	for (const e of els) {
		const base = `${e.localName}${(e.getAttribute('class') ?? '').trim() ? `.${(e.getAttribute('class') ?? '').trim().split(/\s+/).slice(0, 6).join('.')}` : ''}`;
		const n = count.get(base) ?? 0;
		count.set(base, n + 1);
		sigOf.set(e, `${base}#${n}`);
	}
	let writes = 0;
	const watch = new MutationObserver((records) => void (writes += records.length));
	watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
	const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
	// What a position starts (a fade-in its section entering view runs) ends before it is read: CSS and Web Animations are finished, a script's tween is waited out.
	const settle = async () => {
		await frame();
		await frame();
		for (let i = 0, still = 0; i < 30 && still < 2; i++) {
			for (const a of document.getAnimations()) {
				const end = a.effect?.getComputedTiming().endTime;
				if (a.playState === 'running' && a.timeline === document.timeline && typeof end === 'number' && Number.isFinite(end)) a.finish();
			}
			const before = writes;
			await frame();
			still = writes === before ? still + 1 : 0;
		}
	};
	const read = (e: Element) => {
		const cs = getComputedStyle(e);
		const m = cs.transform === 'none' ? new DOMMatrix() : new DOMMatrix(cs.transform);
		const [tx, ty] = cs.translate === 'none' ? [0, 0] : cs.translate.split(' ').map((v) => Number.parseFloat(v) || 0);
		const scale = cs.scale === 'none' ? 1 : Number.parseFloat(cs.scale) || 1;
		return `${Math.round(m.e + (tx ?? 0))},${Math.round(m.f + (ty ?? 0))},${(Math.hypot(m.a, m.b) * scale).toFixed(2)},${Number(cs.opacity).toFixed(2)}`;
	};
	const readings = new Map<Element, string[]>(els.map((e) => [e, []]));
	for (const share of shares) {
		scrollTo(0, Math.round(reach * share));
		await settle();
		for (const e of els) readings.get(e)!.push(read(e));
	}
	watch.disconnect();
	scrollTo(0, 0);
	const wanted = new Set(want);
	// Each element's own transform and opacity: what it inherits from a moving parent is the parent's.
	const moving = els.filter((e) => new Set(readings.get(e)).size > 1);
	const tracks = [...new Set([...moving.slice(0, max), ...els.filter((e) => wanted.has(sigOf.get(e)!))])].map((e) => ({ sig: sigOf.get(e)!, at: readings.get(e)! }));
	return { positions, tracks };
}

async function sample(browser: Browser, env: SideEnv, route: string, viewport: Viewport, want: readonly string[]): Promise<ScrollSample> {
	const session = await openSession(browser, motionEnv(env, false), route, viewport);
	try {
		return await session.page.evaluate(sampleScrollPage, { steps: STEPS, max: MAX_TRACKS, want: [...want] });
	} finally {
		await session.close();
	}
}

/** The old page once per width; where it moves anything with the scroll, a second old load and the new one, reading what the first moved. */
export async function observeScroll(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewports: readonly Viewport[]): Promise<ScrollRow> {
	const out: ScrollRow['viewports'][number][] = [];
	for (const viewport of viewports) {
		const first = await sample(browser, sides.old, route, viewport, []);
		if (!first.tracks.length) {
			out.push({ viewport: viewport.name, olds: [first] });
			continue;
		}
		const want = first.tracks.map((t) => t.sig);
		const [again, next] = await Promise.all([sample(browser, sides.old, route, viewport, want), sample(browser, sides.new, route, viewport, want)]);
		out.push({ viewport: viewport.name, olds: [first, again], next });
	}
	return { viewports: out };
}
