import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS, type Viewport } from '../check/types.ts';

/** How a control shows what it holds back. */
/** `copy`: a click whose effect kept is what it writes to the clipboard. */
export type RevealAction = 'click' | 'hover' | 'contextmenu' | 'copy';

/** Where a revealed subtree went: under `body`, or under the element at `path` (child element indexes from the body). */
export interface Revealed {
	/** `body`, the path of the element it went under, or `replace`: the control took itself away and this is what its container then held. */
	readonly into: 'body' | 'replace' | 'clipboard' | readonly number[];
	/** The element children of the parent before which it went, by index among the parent's children before the reveal; -1 is the end. For `replace`, how many levels above the control the replaced container is. */
	readonly before: number;
	readonly html: string;
}

export interface Reveal {
	/** The control's id, its aria-controls, or `p:` and its path. */
	readonly key: string;
	readonly path: readonly number[];
	/** The control's tag, data-slot and text, and which element with them it is in document order: found again by these, not the path, in a document from another load. */
	readonly sig?: string;
	readonly nth?: number;
	readonly action: RevealAction;
	readonly viewport: string;
	readonly added: readonly Revealed[];
}

export interface RevealCapture {
	readonly route: string;
	readonly reveals: readonly Reveal[];
	readonly skipped: readonly string[];
}

// Controls ARIA marks as holding content back, and the gesture that shows it.
const CONTROLS: readonly (readonly [selector: string, action: RevealAction])[] = [
	['[aria-expanded="false"]:not([aria-disabled="true"]):not([disabled])', 'click'],
	['[role="tab"][aria-selected="false"]:not([aria-disabled="true"]):not([disabled])', 'click'],
	['[data-slot="tooltip-trigger"], [data-slot="hover-card-trigger"]', 'hover'],
	['[data-slot="context-menu-trigger"]', 'contextmenu'],
];

// A hover trigger rendered through its child (Radix asChild, Base UI render) carries the child's data-slot: Radix's keeps
// its data-state, Base UI's its generated id. Hovered in a pass of its own, cached apart from the controls above.
const CHILD_HOVER: readonly (readonly [selector: string, action: RevealAction])[] = [
	[':is(button, a)[data-state="closed"]:not([aria-expanded]):not([aria-pressed]):not([role]), :is(button, a)[id^="base-ui-"]:not([aria-haspopup]):not([aria-expanded]):not([aria-pressed]):not([role])', 'hover'],
];

const key = (route: string, extra: readonly (readonly [string, string])[] = []) => createHash('sha256').update(`reveal:${route}${extra.length ? `|${JSON.stringify(extra)}` : ''}`).digest('hex').slice(0, 16);

interface Candidate {
	/** Listed by the site: only a control that takes itself away is recorded. */
	readonly extra?: boolean;
	readonly path: number[];
	readonly sig: string;
	readonly nth: number;
	readonly key: string;
	readonly action: RevealAction;
	readonly visible: boolean;
}

async function candidates(page: Page, extra: readonly (readonly [string, RevealAction])[], controls: readonly (readonly [string, RevealAction])[] = CONTROLS): Promise<Candidate[]> {
	const listed = new Set(extra.map(([selector]) => selector));
	const found = await page.evaluate((controls) => {
		const pathOf = (el: Element): number[] => {
			const out: number[] = [];
			for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) out.unshift([...node.parentElement!.children].indexOf(node));
			return out;
		};
		const seen = new Set<Element>();
		const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
		const counts = new Map<string, number>();
		const order = new Map<Element, number>();
		for (const el of document.body.querySelectorAll('*')) {
			if (el.closest('template')) continue;
			const sig = sigOf(el);
			const n = counts.get(sig) ?? 0;
			counts.set(sig, n + 1);
			order.set(el, n);
		}
		const out: { path: number[]; key: string; action: 'click' | 'hover' | 'contextmenu'; visible: boolean; selector: string; sig: string; nth: number }[] = [];
		for (const [selector, action] of controls) {
			for (const el of document.body.querySelectorAll(selector)) {
				if (seen.has(el) || el.closest('template')) continue;
				seen.add(el);
				const rect = el.getBoundingClientRect();
				const style = getComputedStyle(el);
				const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
				const path = pathOf(el);
				out.push({ path, key: el.id || el.getAttribute('aria-controls') || `p:${path.join('.')}`, action: action as 'click' | 'hover' | 'contextmenu', visible, selector, sig: sigOf(el), nth: order.get(el) ?? 0 });
			}
		}
		return out;
	}, [...controls, ...extra] as unknown as [string, string][]);
	return found.map(({ selector, ...c }) => ({ ...c, ...(listed.has(selector) ? { extra: true } : {}) }));
}

async function bodyHash(page: Page): Promise<string> {
	return page.evaluate(() => {
		let h = 0;
		const text = document.body.outerHTML;
		for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
		return String(h);
	});
}

/** Uses one control and records the subtrees its use added to the page. */
async function reveal(page: Page, candidate: Candidate): Promise<Revealed[] | string> {
	await page.evaluate(() => {
		const w = window as unknown as { __mmAdded?: { parent: Element; node: Element; next: Element | null }[]; __mmObserver?: MutationObserver };
		w.__mmAdded = [];
		w.__mmObserver = new MutationObserver((records) => {
			for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && r.target instanceof Element) w.__mmAdded!.push({ parent: r.target, node: n, next: n.nextElementSibling });
		});
		w.__mmObserver.observe(document.body, { childList: true, subtree: true });
	});
	const target = await page.evaluateHandle((path) => {
		let el: Element = document.body;
		for (const i of path) el = el.children[i]!;
		return el;
	}, candidate.path);
	const el = target.asElement();
	if (!el) return 'not found';
	if (candidate.action === 'copy') {
		await page.evaluate(() => {
			const w = window as unknown as { __mmClipboard?: string[] };
			w.__mmClipboard = [];
			const write = (text: string) => {
				w.__mmClipboard!.push(text);
				return Promise.resolve();
			};
			Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write, write: () => Promise.resolve(), readText: () => Promise.resolve('') } });
		});
		await el.click({ timeout: 2000 }).catch(() => {});
		await quiet(page, 300);
		const written = await page.evaluate(() => (window as unknown as { __mmClipboard?: string[] }).__mmClipboard ?? []);
		return written.length ? [{ into: 'clipboard', before: -1, html: written[written.length - 1]! }] : [];
	}
	await el.evaluate((e) => {
		const chain: Element[] = [];
		for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) chain.push(n);
		(window as unknown as { __mmChain?: Element[] }).__mmChain = chain;
	});
	try {
		if (candidate.action === 'click') await el.click({ timeout: 2000 });
		else if (candidate.action === 'hover') {
			await el.hover({ timeout: 2000 });
			await el.focus().catch(() => {});
		} else await el.click({ button: 'right', timeout: 2000 });
	} catch (error) {
		return `could not ${candidate.action}: ${(error as Error).message.split('\n')[0]}`;
	}
	await quiet(page, candidate.action === 'hover' ? 900 : candidate.extra ? 1500 : 300);
	const replaced = await el.evaluate((e) => !e.isConnected).catch(() => true);
	if (replaced) {
		// A control that takes itself away (a "View Code" button swapping in the full source): what its container holds now.
		const kept = await page.evaluate(() => {
			const w = window as unknown as { __mmObserver?: MutationObserver; __mmChain?: Element[] };
			w.__mmObserver?.disconnect();
			const chain = w.__mmChain ?? [];
			const depth = chain.findIndex((n) => n.isConnected);
			return depth < 0 ? undefined : { depth: depth + 1, html: chain[depth]!.innerHTML };
		});
		return kept ? [{ into: 'replace', before: kept.depth, html: kept.html }] : [];
	}
	return page.evaluate(() => {
		const w = window as unknown as { __mmAdded?: { parent: Element; node: Element; next: Element | null }[]; __mmObserver?: MutationObserver };
		w.__mmObserver?.disconnect();
		const pathOf = (el: Element): number[] => {
			const out: number[] = [];
			for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) out.unshift([...node.parentElement!.children].indexOf(node));
			return out;
		};
		const added = (w.__mmAdded ?? []).filter((a) => a.node.isConnected && !(w.__mmAdded ?? []).some((b) => b !== a && b.node.contains(a.node)));
		return added.map((a) => {
			const siblings = [...a.parent.children].filter((c) => !added.some((x) => x.node === c));
			const at = a.next ? siblings.indexOf(a.next) : -1;
			return { into: a.parent === document.body ? ('body' as const) : pathOf(a.parent), before: at, html: a.node.outerHTML };
		});
	});
}

/** Waits for what a gesture started: a short pause, then the requests it made and the animations it ran. */
async function quiet(page: Page, ms: number): Promise<void> {
	await page.waitForTimeout(ms);
	await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
	await finishAnimations(page).catch(() => {});
}

/** The tab selected before another in the same list was chosen, to choose it again afterwards. */
async function selectedSibling(page: Page, path: readonly number[]): Promise<number[] | undefined> {
	return page.evaluate((path) => {
		let el: Element = document.body;
		for (const i of path) el = el.children[i]!;
		if (el.getAttribute('role') !== 'tab') return undefined;
		const list = el.closest('[role="tablist"]');
		const selected = list?.querySelector('[role="tab"][aria-selected="true"]');
		if (!selected) return undefined;
		const out: number[] = [];
		for (let node: Element | null = selected; node && node !== document.body; node = node.parentElement) out.unshift([...node.parentElement!.children].indexOf(node));
		return out;
	}, path);
}

async function undo(page: Page, previous: number[] | undefined, baseline: string): Promise<boolean> {
	if (previous) {
		await page
			.evaluate((path) => {
				let el: Element = document.body;
				for (const i of path) el = el.children[i]!;
				(el as HTMLElement).click();
			}, previous)
			.catch(() => {});
	} else {
		await page.keyboard.press('Escape').catch(() => {});
		await page.mouse.move(1, 1).catch(() => {});
	}
	await quiet(page, 250);
	return (await bodyHash(page)) === baseline;
}

async function fresh(browser: Browser, origin: string, route: string, viewport: Viewport) {
	const { context, page } = await openPage(browser, defaultEnv(origin), viewport);
	await loadPage(page, new URL(route, origin).href);
	await quiet(page, 300);
	return { context, page, baseline: await bodyHash(page) };
}

/** Content a control portaled into the body alike on several pages, by control key: used again instead of using the control on every page. */
export type RevealMemo = Map<string, { readonly html: string; readonly reveal: Reveal; count: number }>;

const REUSE_AFTER = 3;

/** Uses every control on a route that holds content back, on each viewport where it can be used, and records what each showed. */
export async function captureReveals(browser: Browser, origin: string, route: string, dir: string, memo: RevealMemo = new Map(), viewports: readonly Viewport[] = VIEWPORTS, extra: readonly (readonly [string, RevealAction])[] = [], pass: { readonly controls: readonly (readonly [string, RevealAction])[]; readonly tag: string } = { controls: CONTROLS, tag: '' }): Promise<RevealCapture> {
	const file = join(dir, `${key(`${pass.tag}${route}`, extra)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as RevealCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const reveals: Reveal[] = [];
	const skipped: string[] = [];
	const done = new Set<string>();
	let hidden = true;
	for (const viewport of viewports) {
		// A control another viewport could not show is the only reason to load the page again at this one.
		if (!hidden) break;
		hidden = false;
		let open = await fresh(browser, origin, route, viewport);
		try {
			const found = await candidates(open.page, extra, pass.controls);
			hidden = found.some((c) => !c.visible && !done.has(c.key));
			for (const candidate of found) {
				if (!candidate.visible || done.has(candidate.key)) continue;
				const known = memo.get(`${viewport.name} ${candidate.key}`);
				if (known && known.count >= REUSE_AFTER) {
					done.add(candidate.key);
					reveals.push({ ...known.reveal, path: candidate.path, sig: candidate.sig, nth: candidate.nth });
					continue;
				}
				const previous = await selectedSibling(open.page, candidate.path);
				const raw = await reveal(open.page, candidate);
				const added = candidate.extra && typeof raw !== 'string' ? raw.filter((a) => a.into === 'replace' || a.into === 'clipboard') : raw;
				if (typeof added === 'string') skipped.push(`${candidate.key} (${viewport.name}): ${added}`);
				else {
					done.add(candidate.key);
					if (added.length) {
						const shown: Reveal = { key: candidate.key, path: candidate.path, sig: candidate.sig, nth: candidate.nth, action: candidate.action, viewport: viewport.name, added };
						reveals.push(shown);
						const html = added.map((a) => a.html).join('');
						const entry = memo.get(`${viewport.name} ${candidate.key}`);
						if (added.every((a) => a.into === 'body')) {
							if (entry && entry.html === html) entry.count++;
							else memo.set(`${viewport.name} ${candidate.key}`, { html, reveal: shown, count: 1 });
						}
					}
				}
				if (!(await undo(open.page, previous, open.baseline))) {
					await open.context.close().catch(() => {});
					open = await fresh(browser, origin, route, viewport);
				}
			}
		} finally {
			await open.context.close().catch(() => {});
		}
	}
	const capture: RevealCapture = { route, reveals, skipped };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

/** Captures every route's reveals, `concurrency` at a time. */
export async function captureAllReveals(browser: Browser, origin: string, routes: readonly string[], dir: string, options: { concurrency?: number; log?: (line: string) => void; extra?: readonly (readonly [string, RevealAction])[] } = {}): Promise<RevealCapture[]> {
	const memo: RevealMemo = new Map();
	const out: RevealCapture[] = new Array(routes.length);
	let next = 0;
	let done = 0;
	const worker = async () => {
		while (next < routes.length) {
			const index = next++;
			const failed = (error: Error): RevealCapture => ({ route: routes[index]!, reveals: [], skipped: [`the route: ${error.message.split('\n')[0]}`] });
			const own = await captureReveals(browser, origin, routes[index]!, dir, memo, VIEWPORTS, options.extra ?? []).catch(failed);
			const child = await captureReveals(browser, origin, routes[index]!, dir, memo, VIEWPORTS, [], { controls: CHILD_HOVER, tag: 'child-hover:' }).catch(failed);
			const keys = new Set(own.reveals.map((r) => r.key));
			out[index] = { route: own.route, reveals: [...own.reveals, ...child.reveals.filter((r) => !keys.has(r.key))], skipped: [...own.skipped, ...child.skipped] };
			done++;
			options.log?.(`revealed ${done}/${routes.length} ${routes[index]} (${out[index]!.reveals.length} controls)`);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
	return out;
}
