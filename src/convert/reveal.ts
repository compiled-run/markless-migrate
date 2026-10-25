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

// Radix ScrollArea (type "hover") mounts its scrollbars when the pointer enters it: hovered in a pass of its own.
const SCROLL_HOVER: readonly (readonly [selector: string, action: RevealAction])[] = [['[data-slot="scroll-area"]:not([data-base-ui-scroll-area-root])', 'hover']];

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
				// A second control with an id the page already gave another (shadcn's React Aria date pickers) is keyed by the id the converter gives it.
				let key = el.id || el.getAttribute('aria-controls') || `p:${path.join('.')}`;
				if (el.id && document.querySelectorAll(`[id="${CSS.escape(el.id)}"]`)[0] !== el) key = `${el.id}-${[...document.querySelectorAll(`[id="${CSS.escape(el.id)}"]`)].indexOf(el) + 1}`;
				out.push({ path, key, action: action as 'click' | 'hover' | 'contextmenu', visible, selector, sig: sigOf(el), nth: order.get(el) ?? 0 });
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
		(w as unknown as { __mmChanged: Element[] }).__mmChanged = [];
		w.__mmObserver = new MutationObserver((records) => {
			for (const r of records) {
				if (r.target instanceof Element && (r.addedNodes.length || r.removedNodes.length)) (w as unknown as { __mmChanged: Element[] }).__mmChanged.push(r.target);
				for (const n of r.addedNodes) if (n instanceof Element && r.target instanceof Element) w.__mmAdded!.push({ parent: r.target, node: n, next: n.nextElementSibling });
			}
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
	// Scrolled to and settled first: a popover that closes when the page scrolls (React Aria's ComboBox) would close as the click's own smooth scroll finishes.
	await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
	await settleScroll(page);
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
	// A control that also opens on hover (Radix NavigationMenu) can be opened by the pointer arriving and closed by the
	// press itself: one still collapsed is pressed again without the pointer.
	if (candidate.action === 'click' && (await el.evaluate((e) => e.isConnected && e.getAttribute('aria-expanded') === 'false').catch(() => false)) && (await page.evaluate(() => (window as unknown as { __mmAdded?: unknown[] }).__mmAdded?.length ?? 0)) === 0) {
		await page.mouse.move(1, 1).catch(() => {});
		await quiet(page, 400);
		await el.evaluate((e) => (e as HTMLElement).click()).catch(() => {});
		await quiet(page, 300);
	}
	const replaced = await el.evaluate((e) => !e.isConnected).catch(() => true);
	if (replaced) {
		// A control that takes itself away (a "View Code" button swapping in the full source): what its container holds now.
		const kept = await page.evaluate(() => {
			const w = window as unknown as { __mmObserver?: MutationObserver; __mmChain?: Element[] };
			w.__mmObserver?.disconnect();
			const chain = w.__mmChain ?? [];
			// The nearest ancestor holding every place the swap changed: the framework may keep the control's own parent and
			// change its siblings too (shadcn's View Code keeps the button's wrapper for the comment and swaps the figure).
			const changed = ((w as unknown as { __mmChanged?: Element[] }).__mmChanged ?? []).filter((n) => n.isConnected);
			const depth = chain.findIndex((n) => n.isConnected && changed.every((c) => n.contains(c)));
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

/** Waits until the page has not scrolled for three frames (a smooth scroll has finished). */
async function settleScroll(page: Page): Promise<void> {
	await page
		.waitForFunction(
			() =>
				new Promise((done) => {
					let last = window.scrollY;
					let still = 0;
					const tick = () => (window.scrollY === last ? ++still : ((last = window.scrollY), (still = 0)), still >= 3 ? done(true) : requestAnimationFrame(tick));
					requestAnimationFrame(tick);
				}),
			undefined,
			{ timeout: 2000 },
		)
		.catch(() => {});
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
export async function captureAllReveals(browser: Browser, origin: string, routes: readonly string[], dir: string, options: { concurrency?: number; log?: (line: string) => void; extra?: readonly (readonly [selector: string, action: RevealAction, routes?: string])[]; opens?: readonly { readonly selector: string; readonly routes?: string }[] } = {}): Promise<RevealCapture[]> {
	const memo: RevealMemo = new Map();
	const out: RevealCapture[] = new Array(routes.length);
	let next = 0;
	let done = 0;
	const worker = async () => {
		while (next < routes.length) {
			const index = next++;
			const failed = (error: Error): RevealCapture => ({ route: routes[index]!, reveals: [], skipped: [`the route: ${error.message.split('\n')[0]}`] });
			// A listed control with routes is the site's on those routes only.
			const extra = (options.extra ?? []).filter(([, , only]) => !only || new RegExp(only).test(routes[index]!)).map(([selector, action]) => [selector, action] as const);
			const own = await captureReveals(browser, origin, routes[index]!, dir, memo, VIEWPORTS, extra).catch(failed);
			// The site's listed controls (View Code) again on their own, cached apart: their swaps are taken from here.
			const listed = extra.length ? await captureReveals(browser, origin, routes[index]!, dir, memo, VIEWPORTS, extra, { controls: [], tag: 'listed-v2:' }).catch(failed) : undefined;
			const relisted = new Set(listed?.reveals.flatMap((r) => [r.key, `${r.sig}#${r.nth}`]) ?? []);
			const base = listed ? [...own.reveals.filter((r) => !((relisted.has(r.key) || relisted.has(`${r.sig}#${r.nth}`)) && r.added.every((a) => a.into === 'replace' || a.into === 'clipboard'))), ...listed.reveals] : own.reveals;
			const child = await captureReveals(browser, origin, routes[index]!, dir, memo, VIEWPORTS, [], { controls: CHILD_HOVER, tag: 'child-hover:' }).catch(failed);
			// Controls the site lists as opening a layer without ARIA saying so, on the routes it lists them for.
			const opens = (options.opens ?? []).filter((o) => !o.routes || new RegExp(o.routes).test(routes[index]!)).map((o) => [o.selector, 'click'] as const);
			const opened = opens.length ? await captureReveals(browser, origin, routes[index]!, dir, memo, VIEWPORTS, [], { controls: opens, tag: 'open:' }).catch(failed) : undefined;
			const scroll = await captureReveals(browser, origin, routes[index]!, dir, memo, VIEWPORTS, [], { controls: SCROLL_HOVER, tag: 'scroll-area:' }).catch(failed);
			const keys = new Set(base.map((r) => r.key));
			const more = [...child.reveals, ...(opened?.reveals.filter((r) => r.added.some((a) => a.into === 'body')) ?? []), ...scroll.reveals];
			out[index] = { route: own.route, reveals: [...base, ...more.filter((r) => !keys.has(r.key))], skipped: [...own.skipped, ...(listed?.skipped ?? []), ...child.skipped, ...(opened?.skipped ?? [])] };
			done++;
			options.log?.(`revealed ${done}/${routes.length} ${routes[index]} (${out[index]!.reveals.length} controls)`);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
	return out;
}

// React Aria's TooltipTrigger renders no element and marks nothing on its child, a PreviewTrigger's press opens nothing,
// and a context-menu MenuTrigger's area is a plain pressable: what each shows is found by resting on each React Aria
// control that opens nothing else, and right-clicking each such area.
const RAC_HOVER = '[data-rac][data-react-aria-pressable]:not([aria-expanded]):not([aria-haspopup]):not(label):not(input), [data-rac][aria-haspopup="dialog"][aria-expanded="false"][style*="touch-callout"], [role="button"][data-react-aria-pressable][id]:not([data-rac])';
const RAC_HOVER_MAX = 60;

/** Hovers each React Aria control that may hold a tooltip or preview and records what it showed. Cached by route. */
export async function captureRacHovers(browser: Browser, origin: string, route: string, dir: string): Promise<readonly Reveal[]> {
	const file = join(dir, `${createHash('sha256').update(`rac-hover:2:${route}|${RAC_HOVER}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; reveals: Reveal[] }, () => undefined);
	if (cached && cached.route === route) return cached.reveals;
	const viewport = VIEWPORTS[0]!;
	let open = await fresh(browser, origin, route, viewport);
	const reveals: Reveal[] = [];
	try {
		const found = await open.page.evaluate(([selector, max]) => {
			const pathOf = (el: Element): number[] => {
				const out: number[] = [];
				for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) out.unshift([...node.parentElement!.children].indexOf(node));
				return out;
			};
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const counts = new Map<string, number>();
			const order = new Map<Element, number>();
			for (const el of document.body.querySelectorAll('*')) {
				if (el.closest('template')) continue;
				const sig = sigOf(el);
				order.set(el, counts.get(sig) ?? 0);
				counts.set(sig, (counts.get(sig) ?? 0) + 1);
			}
			return [...document.body.querySelectorAll(selector as string)]
				.filter((el) => {
					const r = el.getBoundingClientRect();
					return !el.closest('template') && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
				})
				.slice(0, max as number)
				.map((el) => ({ path: pathOf(el), key: el.id || `p:${pathOf(el).join('.')}`, sig: sigOf(el), nth: order.get(el) ?? 0, preview: el.getAttribute('aria-haspopup') === 'dialog', area: !el.hasAttribute('data-rac') }));
		}, [RAC_HOVER, RAC_HOVER_MAX] as const);
		// React Aria shows a tooltip on hover only once the pointer has moved on the page (useFocusVisible's modality).
		const moved = () => open.page.mouse.move(2, 2).then(() => open.page.mouse.move(4, 4)).catch(() => {});
		await moved();
		for (const c of found) {
			await open.page.evaluate(() => {
				const w = window as unknown as { __mmAdded?: Element[]; __mmObserver?: MutationObserver };
				w.__mmAdded = [];
				w.__mmObserver = new MutationObserver((records) => {
					for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && r.target === document.body) w.__mmAdded!.push(n);
				});
				w.__mmObserver.observe(document.body, { childList: true });
			});
			const el = (
				await open.page.evaluateHandle((path) => {
					let node: Element = document.body;
					for (const i of path) node = node.children[i]!;
					return node;
				}, c.path)
			).asElement();
			if (!el) continue;
			const used = await (c.area ? el.click({ button: 'right', timeout: 2000 }) : el.hover({ timeout: 2000 })).then(() => true, () => false);
			if (!used) continue;
			// A PreviewTrigger opens after 600 ms.
			await quiet(open.page, c.preview ? 900 : 400);
			const added = await open.page.evaluate(() => {
				const w = window as unknown as { __mmAdded?: Element[]; __mmObserver?: MutationObserver };
				w.__mmObserver?.disconnect();
				const nodes = (w.__mmAdded ?? []).filter((n) => n.isConnected);
				const shows = '[role="tooltip"], [data-trigger="PreviewTrigger"], [data-trigger="MenuTrigger"]';
				if (!nodes.some((n) => n.matches(shows) || n.querySelector(shows))) return [];
				return nodes.map((n) => n.outerHTML);
			});
			if (added.length) reveals.push({ key: c.key, path: c.path, sig: c.sig, nth: c.nth, action: c.area ? 'contextmenu' : 'hover', viewport: viewport.name, added: added.map((html) => ({ into: 'body' as const, before: -1, html })) });
			if (c.area) await open.page.keyboard.press('Escape').catch(() => {});
			await open.page.mouse.move(1, 1).catch(() => {});
			if (added.length) await quiet(open.page, 700);
			if ((await bodyHash(open.page)) !== open.baseline) {
				await open.context.close().catch(() => {});
				open = await fresh(browser, origin, route, viewport);
				await moved();
			}
		}
	} finally {
		await open.context.close().catch(() => {});
	}
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify({ route, reveals }));
	return reveals;
}

/**
 * React Aria's submenus: a menu item with aria-haspopup opens its own popover when hovered, which no control in the
 * page shows. Each menu a reveal opened is opened again, each such item in it hovered, and what it showed recorded as a
 * reveal keyed by the item's id (one level deep). Cached by route.
 */
export async function captureRacSubmenus(browser: Browser, origin: string, route: string, dir: string, reveals: readonly Reveal[]): Promise<readonly Reveal[]> {
	const menus = reveals.filter((r) => r.action === 'click' && r.added.some((a) => /role="menuitem[^"]*"[^>]*aria-haspopup="menu"|aria-haspopup="menu"[^>]*role="menuitem/.test(a.html) && a.html.includes('data-rac')));
	if (!menus.length) return [];
	const file = join(dir, `${createHash('sha256').update(`rac-submenus:1:${route}|${JSON.stringify(menus.map((m) => [m.sig, m.nth, m.path]))}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; reveals: Reveal[] }, () => undefined);
	if (cached && cached.route === route) return cached.reveals;
	const out: Reveal[] = [];
	const viewport = VIEWPORTS[0]!;
	for (const menu of menus) {
		const { context, page, baseline } = await fresh(browser, origin, route, viewport);
		void baseline;
		try {
			const open = async () => {
				const el = (
					await page.evaluateHandle((path) => {
						let node: globalThis.Element | undefined = document.body;
						for (const i of path) node = node?.children[i];
						return node ?? null;
					}, menu.path)
				).asElement();
				if (!el) return false;
				await el.click({ timeout: 2000 });
				await quiet(page, 400);
				return true;
			};
			if (!(await open())) continue;
			const ids = await page.evaluate(() => [...document.querySelectorAll('[data-trigger="MenuTrigger"] [role^="menuitem"][aria-haspopup="menu"], [data-trigger] [role="menu"] [role^="menuitem"][aria-haspopup="menu"]')].map((e) => e.id).filter(Boolean));
			for (const id of [...new Set(ids)]) {
				await page.evaluate(() => {
					const w = window as unknown as { __mmAdded?: globalThis.Element[]; __mmObserver?: MutationObserver };
					w.__mmAdded = [];
					w.__mmObserver = new MutationObserver((records) => {
						for (const r of records) for (const n of r.addedNodes) if (n instanceof globalThis.Element) w.__mmAdded!.push(n);
					});
					w.__mmObserver.observe(document.body, { childList: true, subtree: true });
				});
				const item = page.locator(`[id="${id}"]`);
				const hovered = await item.hover({ timeout: 2000 }).then(() => true, () => false);
				if (!hovered) continue;
				await quiet(page, 500);
				const added = await page.evaluate(() => {
					const w = window as unknown as { __mmAdded?: globalThis.Element[]; __mmObserver?: MutationObserver };
					w.__mmObserver?.disconnect();
					const nodes = (w.__mmAdded ?? []).filter((n) => n.isConnected && n.querySelector('[data-trigger="SubmenuTrigger"], [role="menu"]'));
					// The submenu's popover, outermost first, without what is inside another added node.
					return nodes.filter((n) => !nodes.some((m) => m !== n && m.contains(n))).map((n) => n.outerHTML);
				});
				if (added.length) out.push({ key: id, path: [-1], action: 'hover', viewport: viewport.name, added: added.map((html) => ({ into: 'body' as const, before: -1, html })) });
				// Back to the menu alone: away from the item, so the submenu closes, then the menu is the only layer.
				await page.keyboard.press('Escape').catch(() => {});
				await quiet(page, 300);
				if (!(await page.locator('[data-trigger="MenuTrigger"]').count())) await open();
			}
		} catch {
			// a menu that cannot be opened again keeps its submenus static
		} finally {
			await context.close().catch(() => {});
		}
	}
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify({ route, reveals: out }));
	return out;
}

/**
 * React Aria ComboBoxes whose button cannot be clicked (none, for a multiple-selection one whose chips are a TagGroup;
 * hidden, while a clear button shows): their popover opens on ArrowDown or typing, which no click shows. Each such
 * input is focused on a fresh page, ArrowDown pressed and what it showed recorded as a reveal keyed by the button's id,
 * else the input's. Cached by route.
 */
export async function captureRacComboInputs(browser: Browser, origin: string, route: string, dir: string): Promise<readonly Reveal[]> {
	const file = join(dir, `${createHash('sha256').update(`rac-combo-inputs:5:${route}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; reveals: Reveal[] }, () => undefined);
	if (cached && cached.route === route) return cached.reveals;
	const out: Reveal[] = [];
	const viewport = VIEWPORTS[0]!;
	const list = async (page: Page) =>
		page.evaluate(() => {
			const pathOf = (el: globalThis.Element) => {
				const path: number[] = [];
				for (let node: globalThis.Element | null = el; node && node !== document.body; node = node.parentElement) path.unshift([...node.parentElement!.children].indexOf(node));
				return path;
			};
			const sigOf = (el: globalThis.Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const all = [...document.body.querySelectorAll('*')].filter((e) => !e.closest('template'));
			const button = (i: globalThis.Element) => i.closest('[data-rac]:has(input[role="combobox"])')?.querySelector('button[aria-haspopup="listbox"]');
			return [...document.querySelectorAll<HTMLInputElement>('input[data-rac][role="combobox"]')].filter((i) => i.id && i.getClientRects().length && !button(i)?.getClientRects().length).map((i) => ({ id: i.id, path: pathOf(i), sig: sigOf(i), nth: all.filter((e) => sigOf(e) === sigOf(i)).indexOf(i) }));
		});
	{
		const { context, page } = await fresh(browser, origin, route, viewport);
		const inputs = await list(page).catch(() => []);
		await context.close().catch(() => {});
		for (const input of inputs) {
			const { context, page } = await fresh(browser, origin, route, viewport);
			try {
				await page.evaluate(() => {
					const w = window as unknown as { __mmAdded?: globalThis.Element[]; __mmObserver?: MutationObserver };
					w.__mmAdded = [];
					w.__mmObserver = new MutationObserver((records) => {
						for (const r of records) for (const n of r.addedNodes) if (n instanceof globalThis.Element) w.__mmAdded!.push(n);
					});
					w.__mmObserver.observe(document.body, { childList: true });
				});
				const id = await page.evaluate((path) => {
					let node: globalThis.Element | undefined = document.body;
					for (const i of path) node = node?.children[i];
					node?.setAttribute('data-mm-probe', '');
					// The layer is the button's when there is one (hidden while a value shows its clear button), else the input's.
					return node?.closest('[data-rac]:has(input[role="combobox"])')?.querySelector('button[aria-haspopup="listbox"]')?.id || node?.id;
				}, input.path);
				if (!id) continue;
				// Scrolled to and settled first: the popover closes when the page scrolls.
				await page.locator('[data-mm-probe]').scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
				await settleScroll(page);
				await page.click('[data-mm-probe]', { timeout: 5000 });
				await page.keyboard.press('ArrowDown');
				await page.waitForSelector('[data-trigger="ComboBox"] [role="option"]', { timeout: 8000 }).catch(() => {});
				await quiet(page, 300);
				const added = await page.evaluate(() => {
					const w = window as unknown as { __mmAdded?: globalThis.Element[]; __mmObserver?: MutationObserver };
					w.__mmObserver?.disconnect();
					return (w.__mmAdded ?? []).filter((n) => n.isConnected && (n.matches('[data-trigger="ComboBox"]') || n.querySelector('[data-trigger="ComboBox"]'))).map((n) => n.outerHTML);
				});
				if (added.length) out.push({ key: id, path: input.path, sig: input.sig, nth: input.nth, action: 'click', viewport: viewport.name, added: added.map((html) => ({ into: 'body' as const, before: -1, html })) });
			} catch {
				// an input that cannot be opened keeps its popover unported
			} finally {
				await context.close().catch(() => {});
			}
		}
	}
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify({ route, reveals: out }));
	return out;
}
