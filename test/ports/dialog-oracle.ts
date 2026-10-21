// Drives the Markless port of @radix-ui/react-dialog and the real library side by side through the same action
// sequences, and compares what each page shows at fixed moments: after each action settles, halfway through the wait
// that follows it, at the end of that wait, and in the frame after each element's own animation ends.
import type { BrowserContext, CDPSession, Page } from 'playwright';

/** a: shadcn's dialog; b: a backdrop slower than its dialog; c: nothing animates; d: shadcn's sheet; e: opened and closed by
 * the page through `open` and `onOpenChange`, with no trigger; f: an alert dialog. */
export const DIALOGS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
export type DialogId = (typeof DIALOGS)[number];

/** The close controls each scenario dialog renders, by the order a person would reach for them. */
export const CLOSERS: Record<DialogId, readonly string[]> = { a: ['a-cancel', 'a-x'], b: ['b-close'], c: ['c-close'], d: ['d-x'], e: ['e-close', 'e-save'], f: ['f-cancel', 'f-action'] };
/** A control inside each dialog that takes focus when clicked. */
export const INSIDE: Record<DialogId, string> = { a: 'a-name', b: 'b-description', c: 'c-description', d: 'd-reset', e: 'e-name', f: 'f-description' };

export type Command =
	| { readonly kind: 'click-trigger'; readonly dialog: DialogId }
	| { readonly kind: 'program-trigger'; readonly dialog: DialogId }
	| { readonly kind: 'click-close'; readonly dialog: DialogId; readonly which: number }
	| { readonly kind: 'click-inside'; readonly dialog: DialogId }
	| { readonly kind: 'click-outside' }
	| { readonly kind: 'key'; readonly key: 'Escape' | 'Tab' | 'Shift+Tab' };

export interface Step {
	readonly command: Command;
	/** Animation milliseconds to let pass after the action has settled. */
	readonly wait: number;
}

export interface ElementState {
	readonly shown: boolean;
	readonly visible?: boolean;
	readonly attrs?: Record<string, string>;
	readonly opacity?: number;
	readonly transform?: string;
	readonly box?: readonly number[];
	readonly pointerEvents?: string;
	readonly exposed?: boolean;
	/** Animations still running on the element, with how far each is from its end. */
	readonly animations?: readonly { readonly name: string; readonly left: number }[];
}

export interface Snapshot {
	readonly label: string;
	readonly elements: Record<string, ElementState>;
	readonly body: Record<string, string>;
	readonly guards: readonly string[];
	readonly scrollLockStyle: string | null;
	readonly active: string;
	readonly selection: string;
}

// Runs in the page: the state of every element with a data-testid, the body, the focus guards and the focus.
function capture(label: string): Snapshot {
	const shownEl = (el: Element) => el.isConnected && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';
	const name = (el: Element | null): string => {
		if (!el) return 'null';
		if (el === document.body) return 'body';
		if (el.hasAttribute('data-radix-focus-guard')) return el === document.body.firstElementChild ? 'guard:start' : el === document.body.lastElementChild ? 'guard:end' : 'guard:inner';
		const id = (el as HTMLElement).dataset?.testid;
		return id ? `#${id}` : el.tagName.toLowerCase();
	};
	const ref = (value: string) =>
		value
			.split(/\s+/)
			.map((id) => {
				const target = id ? document.getElementById(id) : null;
				return target && shownEl(target) ? name(target) : 'absent';
			})
			.join(' ');
	const effectiveOpacity = (el: Element) => {
		let o = 1;
		for (let node: Element | null = el; node; node = node.parentElement) o *= Number(getComputedStyle(node).opacity);
		return o;
	};
	const elements: Record<string, ElementState> = {};
	for (const el of document.querySelectorAll<HTMLElement>('[data-testid]')) {
		const key = el.dataset.testid!;
		if (!shownEl(el)) {
			elements[key] = { shown: false };
			continue;
		}
		const attrs: Record<string, string> = {};
		for (const a of el.attributes) {
			// Where the dialog is rendered decides which elements aria-hidden lands on; exposure is compared instead.
			if (a.name === 'data-testid' || a.name === 'hidden' || a.name === 'aria-hidden' || a.name === 'data-aria-hidden') continue;
			if (a.name === 'id') attrs.id = 'set';
			else if (a.name === 'aria-controls' || a.name === 'aria-labelledby' || a.name === 'aria-describedby') attrs[a.name] = ref(a.value);
			else if (a.name === 'class') attrs.class = a.value;
			else attrs[a.name] = a.value;
		}
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		const opacity = effectiveOpacity(el);
		elements[key] = {
			shown: true,
			visible: opacity > 0.001 && cs.visibility !== 'hidden' && r.right > 0.5 && r.bottom > 0.5 && r.left < innerWidth - 0.5 && r.top < innerHeight - 0.5,
			attrs,
			opacity: Math.round(Number(cs.opacity) * 1000) / 1000,
			transform: cs.transform,
			box: [r.x, r.y, r.width, r.height].map((n) => Math.round(n)),
			pointerEvents: cs.pointerEvents,
			// An element holding the dialog, or one with nothing to announce (the empty overlay), has no exposure to compare.
			exposed: el.querySelector('[role=dialog]:not([hidden])') || (!el.textContent?.trim() && el.tabIndex < 0 && !el.getAttribute('role')) ? undefined : !el.closest('[aria-hidden="true"]') && !el.closest('[inert]'),
			animations: el
				.getAnimations()
				.filter((a) => a.playState === 'running' || a.playState === 'paused')
				.map((a) => {
					const end = Number(a.effect?.getComputedTiming().endTime ?? 0);
					return { name: (a as CSSAnimation).animationName ?? 'transition', left: Math.round(end - Number(a.currentTime ?? 0)) };
				}),
		};
	}
	const body: Record<string, string> = {};
	for (const a of document.body.attributes) body[a.name] = a.value;
	const bodyStyle = getComputedStyle(document.body);
	body['computed:overflow'] = bodyStyle.overflow;
	body['computed:margin-right'] = bodyStyle.marginRight;
	body['computed:pointer-events'] = bodyStyle.pointerEvents;
	// Where the guards sit relative to the dialog depends on where it is rendered; their number and attributes do not.
	const guards = [...document.querySelectorAll('[data-radix-focus-guard]')].map((g) => `${g.getAttribute('aria-hidden') ?? ''} ${g.getAttribute('tabindex')} ${g.getAttribute('style') ?? ''}`);
	const lock = [...document.head.querySelectorAll('style')].find((s) => s.textContent?.includes('data-scroll-locked'));
	const active = document.activeElement;
	const selection = active instanceof HTMLInputElement ? `${active.selectionStart}-${active.selectionEnd}` : '';
	return { label, elements, body, guards, scrollLockStyle: lock?.textContent ?? null, active: name(active), selection };
}

/** Installed before any page script: records a snapshot in the frame after each element's own animation ends. */
function recordAnimationEnds(captureSource: string): void {
	const take = new Function(`return (${captureSource})`)() as (label: string) => unknown;
	const w = window as unknown as { __pinned: unknown[] };
	w.__pinned = [];
	document.addEventListener(
		'animationend',
		(event) => {
			const target = event.target as HTMLElement;
			const id = target?.dataset?.testid;
			if (!id) return;
			const what = `${id} ${event.animationName} ended`;
			requestAnimationFrame(() => {
				w.__pinned.push(take(`first frame after ${what}`));
				requestAnimationFrame(() => w.__pinned.push(take(`second frame after ${what}`)));
			});
		},
		true,
	);
}

export interface Side {
	readonly page: Page;
	readonly cdp: CDPSession;
}

export async function openSide(context: BrowserContext, origin: string): Promise<Side> {
	const page = await context.newPage();
	await page.addInitScript(`(${recordAnimationEnds.toString()})(${JSON.stringify(capture.toString())})`);
	const cdp = await context.newCDPSession(page);
	await cdp.send('Animation.enable');
	(page as Page & { origin?: string }).origin = origin;
	return { page, cdp };
}

export async function reset(side: Side, origin: string): Promise<void> {
	await side.cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
	await side.page.goto(origin, { waitUntil: 'load' });
	await side.page.evaluate(() => document.fonts.ready);
	await side.page.waitForTimeout(300);
	await side.cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
}

const snapshot = (side: Side, label: string) => side.page.evaluate(capture, label);

// Waits until the page has made no DOM change for a while, with the animation clock stopped.
async function settle(page: Page): Promise<void> {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				let timer = setTimeout(done, 60);
				const observer = new MutationObserver(() => {
					clearTimeout(timer);
					timer = setTimeout(done, 60);
				});
				const deadline = setTimeout(done, 3000);
				observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
				function done() {
					observer.disconnect();
					clearTimeout(deadline);
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
				}
			}),
	);
}

async function center(page: Page, testid: string): Promise<{ x: number; y: number } | null> {
	return page.evaluate((id) => {
		const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
		if (!el || el.closest('[hidden]')) return null;
		const r = el.getBoundingClientRect();
		return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
	}, testid);
}

/** Where each trigger sits on the page before anything opens; a later click there lands on whatever is on top. */
export async function triggerCenters(page: Page): Promise<Record<DialogId, { x: number; y: number }>> {
	const out = {} as Record<DialogId, { x: number; y: number }>;
	for (const d of DIALOGS) out[d] = (await center(page, `${d}-trigger`))!;
	return out;
}

async function act(page: Page, command: Command, triggers: Record<DialogId, { x: number; y: number }>): Promise<void> {
	switch (command.kind) {
		case 'click-trigger':
			return page.mouse.click(triggers[command.dialog].x, triggers[command.dialog].y);
		case 'program-trigger':
			return page.evaluate((id) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.click(), `${command.dialog}-trigger`);
		case 'click-close': {
			const list = CLOSERS[command.dialog];
			const at = await center(page, list[command.which % list.length]!);
			if (at) await page.mouse.click(at.x, at.y);
			return;
		}
		case 'click-inside': {
			const at = await center(page, INSIDE[command.dialog]);
			if (at) await page.mouse.click(at.x, at.y);
			return;
		}
		case 'click-outside':
			return page.mouse.click(4, 4);
		case 'key':
			return page.keyboard.press(command.key);
	}
}

/** Runs one step on a side and returns the snapshots it takes. */
export async function runStep(side: Side, step: Step, index: number, triggers: Record<DialogId, { x: number; y: number }>): Promise<Snapshot[]> {
	const label = `step ${index + 1} ${describe(step.command)}`;
	await side.page.evaluate(() => ((window as unknown as { __pinned: unknown[] }).__pinned = []));
	await act(side.page, step.command, triggers);
	await settle(side.page);
	const out: Snapshot[] = [await snapshot(side, `${label}, settled`)];
	if (step.wait > 0) {
		const half = Math.round(step.wait / 2);
		await advance(side, half);
		out.push(await snapshot(side, `${label}, ${half} ms later`));
		await advance(side, step.wait - half);
		await settle(side.page);
		out.push(await snapshot(side, `${label}, ${step.wait} ms later`));
	}
	const pinned = (await side.page.evaluate(() => (window as unknown as { __pinned: Snapshot[] }).__pinned)) as Snapshot[];
	return [...out, ...pinned.map((p) => ({ ...p, label: `${label}: ${p.label}` }))];
}

// Moves every animation on the page forward with the clock stopped, crossing one animation end at a time and letting
// three frames pass after each (the two snapshots taken after an end included), so every end event and what it triggers lands at the same animation time on both sides.
async function advance(side: Side, ms: number): Promise<void> {
	await side.page.evaluate(async (total) => {
		const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
		let remaining = total;
		while (remaining > 0.01) {
			const running = document.getAnimations().filter((a) => a.playState === 'running');
			const left = running.map((a) => Number(a.effect?.getComputedTiming().endTime ?? 0) - Number(a.currentTime ?? 0)).filter((n) => n > 0);
			const next = left.length ? Math.min(...left) : Infinity;
			const jump = next + 0.5 <= remaining ? next + 0.5 : remaining;
			for (const a of running) a.currentTime = Number(a.currentTime ?? 0) + jump;
			remaining -= jump;
			await frame();
			await frame();
			await frame();
		}
	}, ms);
}

export function describe(command: Command): string {
	switch (command.kind) {
		case 'click-trigger':
			return `click where ${command.dialog}-trigger is`;
		case 'program-trigger':
			return `${command.dialog}-trigger.click() from script`;
		case 'click-close':
			return `click ${CLOSERS[command.dialog][command.which % CLOSERS[command.dialog].length]}`;
		case 'click-inside':
			return `click ${INSIDE[command.dialog]}`;
		case 'click-outside':
			return 'click outside';
		case 'key':
			return `press ${command.key}`;
	}
}

/** Animation milliseconds within which an element is about to end an animation, where the two clocks may disagree. */
const NEAR_END = 0.25;

const nearEnd = (e: ElementState | undefined) => !!e?.animations?.some((a) => a.left >= -NEAR_END && a.left <= NEAR_END);

/** Every difference between two snapshots of the same moment, in words. */
export function differences(expected: Snapshot, actual: Snapshot): string[] {
	const out: string[] = [];
	const unsure = Object.keys(expected.elements).some((k) => nearEnd(expected.elements[k]) || nearEnd(actual.elements[k]));
	if (unsure) return out;
	// The first painted frame after an end is compared for what it shows and nothing else: React removes an element that
	// finished leaving one task after that frame, holding it at its last keyframe and undoing what it did to the page
	// with it, so there an element at opacity 0 counts as gone.
	const firstFrame = expected.label.includes('first frame after');
	const seen = (s: ElementState) => (firstFrame ? s.shown && s.visible !== false : s.shown);
	for (const key of new Set([...Object.keys(expected.elements), ...Object.keys(actual.elements)])) {
		const e = expected.elements[key] ?? { shown: false };
		const a = actual.elements[key] ?? { shown: false };
		if (firstFrame && (!seen(e) || !seen(a))) {
			if (seen(e) !== seen(a)) out.push(`${key}: Radix ${seen(e) ? `shows it (opacity ${e.opacity})` : 'shows nothing there'}, the port ${seen(a) ? `shows it (opacity ${a.opacity})` : 'shows nothing there'}`);
			continue;
		}
		if (firstFrame) {
			if (Math.abs((e.opacity ?? 1) - (a.opacity ?? 1)) > 0.06) out.push(`${key} opacity: Radix ${e.opacity}, the port ${a.opacity}`);
			if (!sameTransform(e.transform, a.transform)) out.push(`${key} transform: Radix ${e.transform}, the port ${a.transform}`);
			continue;
		}
		if (e.shown !== a.shown) {
			out.push(`${key}: Radix ${e.shown ? `shows it (opacity ${e.opacity})` : 'does not render it'}, the port ${a.shown ? `shows it (opacity ${a.opacity})` : 'does not render it'}`);
			continue;
		}
		if (!e.shown) continue;
		for (const attr of new Set([...Object.keys(e.attrs ?? {}), ...Object.keys(a.attrs ?? {})])) {
			if (e.attrs?.[attr] !== a.attrs?.[attr]) out.push(`${key} [${attr}]: Radix ${JSON.stringify(e.attrs?.[attr] ?? null)}, the port ${JSON.stringify(a.attrs?.[attr] ?? null)}`);
		}
		if (Math.abs((e.opacity ?? 1) - (a.opacity ?? 1)) > 0.06) out.push(`${key} opacity: Radix ${e.opacity}, the port ${a.opacity}`);
		if (!sameTransform(e.transform, a.transform)) out.push(`${key} transform: Radix ${e.transform}, the port ${a.transform}`);
		if (e.box && a.box && e.box.some((n, i) => Math.abs(n - a.box![i]!) > 2)) out.push(`${key} box: Radix ${e.box.join(',')}, the port ${a.box.join(',')}`);
		if (e.pointerEvents !== a.pointerEvents) out.push(`${key} pointer-events: Radix ${e.pointerEvents}, the port ${a.pointerEvents}`);
		if (e.exposed !== undefined && a.exposed !== undefined && e.exposed !== a.exposed) out.push(`${key}: Radix ${e.exposed ? 'exposes it to assistive technology' : 'hides it from assistive technology'}, the port ${a.exposed ? 'exposes it' : 'hides it'}`);
		const names = (s: ElementState) => (s.animations ?? []).map((x) => x.name).join(',');
		if (names(e) !== names(a)) out.push(`${key} animations: Radix [${names(e)}], the port [${names(a)}]`);
	}
	if (firstFrame) return out;
	for (const attr of new Set([...Object.keys(expected.body), ...Object.keys(actual.body)])) {
		if (expected.body[attr] !== actual.body[attr]) out.push(`body [${attr}]: Radix ${JSON.stringify(expected.body[attr] ?? null)}, the port ${JSON.stringify(actual.body[attr] ?? null)}`);
	}
	if (expected.guards.join('|') !== actual.guards.join('|')) out.push(`focus guards: Radix [${expected.guards.join(' | ')}], the port [${actual.guards.join(' | ')}]`);
	if (expected.scrollLockStyle !== actual.scrollLockStyle) out.push(`scroll lock stylesheet: Radix ${expected.scrollLockStyle === null ? 'none' : 'present'}, the port ${actual.scrollLockStyle === null ? 'none' : 'differs or is missing'}`);
	if (expected.active !== actual.active) out.push(`focus: Radix on ${expected.active}, the port on ${actual.active}`);
	if (expected.selection !== actual.selection) out.push(`selection in the focused field: Radix ${expected.selection}, the port ${actual.selection}`);
	return out;
}

function sameTransform(a: string | undefined, b: string | undefined): boolean {
	if (a === b) return true;
	const nums = (s: string | undefined) => (s?.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
	const x = nums(a);
	const y = nums(b);
	return x.length === y.length && x.every((n, i) => Math.abs(n - y[i]!) < 0.05 * Math.max(1, Math.abs(n)));
}
