import { createRequire } from 'node:module';
import type { CDPSession, Page } from 'playwright';
import { HINTS } from './hints.ts';
import { diffLines, lineTemplates } from './noise.ts';
import type { A11yCapture, Failure } from './types.ts';

const MAX_TABS = 60;
const LANDMARKS = new Set(['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'search', 'form']);

let axeSource: string | undefined;
function axe(): string {
	axeSource ??= (createRequire(import.meta.url)('axe-core') as { source: string }).source;
	return axeSource;
}

interface AxNode {
	readonly ignored?: boolean;
	readonly role?: { readonly value?: string };
	readonly name?: { readonly value?: string };
}

const label = (node: AxNode | undefined) => (node ? `${node.role?.value ?? 'unknown'}${node.name?.value ? ` "${node.name.value.replace(/\s+/g, ' ').trim()}"` : ''}` : 'nothing');

const INSIDE_FRAME = '\u0000inside a frame';
/** A frame, what a loader drew in place of its placeholder, or the Markless component standing in for an embed, is one stop whatever it holds: the embed step compares its inside. */
export const EMBED_STOP = 'embed (a frame, or the Markless component in its place)';
const MAX_FRAME_TABS = 20;

// The focused element's role and name from Chromium's accessibility tree; undefined once focus is on the body or wraps around, INSIDE_FRAME while it moves among a frame's own stops.
async function focused(session: CDPSession): Promise<string | undefined> {
	const { result } = await session.send('Runtime.evaluate', {
		expression: `(() => { const el = document.activeElement; if (!el || el === document.body) return null; let deep = el; while (deep.shadowRoot && deep.shadowRoot.activeElement) deep = deep.shadowRoot.activeElement; const host = el.closest('[data-markless-embed], [data-markless-migrate-widget]'); if (host) { if (host.__mmTabbed) return 'frame'; host.__mmTabbed = true; return 'embed'; } if (el.__mmTabbed) return /^(IFRAME|FRAME)$/.test(deep.tagName) ? 'frame' : null; el.__mmTabbed = true; return /^(IFRAME|FRAME)$/.test(el.tagName) ? 'embed' : el; })()`,
	});
	if (result.value === 'frame') return INSIDE_FRAME;
	if (result.value === 'embed') return EMBED_STOP;
	if (!result.objectId) return undefined;
	const { nodes } = (await session.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false })) as { nodes: AxNode[] };
	return label(nodes.find((n) => !n.ignored) ?? nodes[0]);
}

// The text axe found outside every landmark: where it reports it depends on where hidden elements sit, the text does not.
function outsideText(selectors: string[]): string[] {
	const lines: string[] = [];
	for (const selector of selectors) {
		const el = document.querySelector(selector) as HTMLElement | null;
		for (const line of (el?.innerText ?? '').split('\n')) if (line.trim()) lines.push(line.trim());
	}
	return lines;
}

// Compared word by word, as a reported element may hold a whole line on one page and a piece of it on the other.
const wordCounts = (lines: readonly string[]) => {
	const counts = new Map<string, number>();
	for (const word of lines.join(' ').split(/\s+/)) if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
	return counts;
};

// Runs last on a page: it presses Tab, which moves focus and may scroll.
export async function captureA11y(page: Page): Promise<A11yCapture> {
	const session = await page.context().newCDPSession(page);
	try {
		// Evaluated, not added as a <script>: a page whose Content-Security-Policy forbids inline scripts still gets audited.
		await page.evaluate(`${axe()}\n;void 0;`);
		const results = (await page.evaluate(() => (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<unknown> } }).axe.run(document, { resultTypes: ['violations'] }))) as {
			violations: { id: string; impact: string | null; help: string; helpUrl: string; nodes: { target: unknown[] }[] }[];
		};
		const regionTargets = results.violations.find((v) => v.id === 'region')?.nodes.map((n) => String(n.target[0])) ?? [];
		const regionText = regionTargets.length ? await page.evaluate(outsideText, regionTargets).catch(() => undefined) : undefined;
		const violations = Object.fromEntries(results.violations.map((v) => [v.id, { impact: v.impact ?? 'unknown', help: v.help, helpUrl: v.helpUrl, count: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.map(String).join(' ')), ...(v.id === 'region' && regionText ? { text: regionText } : {}) }]));

		await session.send('Accessibility.enable');
		const { nodes } = (await session.send('Accessibility.getFullAXTree')) as { nodes: AxNode[] };
		const landmarks = nodes.filter((n) => !n.ignored && LANDMARKS.has(n.role?.value ?? '')).map(label).sort();

		const motion = await page.evaluate(
			() =>
				(window as unknown as { __mmMotion?: string[] }).__mmMotion ??
				document
					.getAnimations()
					.filter((a) => a.playState === 'running')
					.map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'script animation')
					.sort(),
		);

		await page.evaluate(() => {
			(document.activeElement as HTMLElement | null)?.blur();
			window.getSelection()?.removeAllRanges();
		});
		const focusOrder: string[] = [];
		// A frame is one stop: how many stops its own document has (a widget's iframe, a player) is its business, and Tab is pressed on until focus leaves it.
		for (let presses = 0, inFrame = 0; focusOrder.length < MAX_TABS && presses < MAX_TABS + MAX_FRAME_TABS; presses++) {
			await page.keyboard.press('Tab');
			const now = await focused(session);
			if (now === INSIDE_FRAME) {
				if (++inFrame > MAX_FRAME_TABS) break;
				continue;
			}
			inFrame = 0;
			if (now === undefined) break;
			focusOrder.push(now);
		}
		return { violations, landmarks, focusOrder, motion };
	} finally {
		await session.detach().catch(() => {});
	}
}

function sequence(items: readonly string[], from: number): string {
	const start = Math.max(0, from - 2);
	const shown = items.slice(start, start + 8).map((item, k) => `${start + k + 1}. ${item}`);
	return `${start ? '... ' : ''}${shown.join(' → ') || '(nothing focusable)'}${start + 8 < items.length ? ' ...' : ''}`;
}

export function compareA11y(route: string, viewport: string, oldA: A11yCapture, others: readonly A11yCapture[], next: A11yCapture): Failure[] {
	const failures: Failure[] = [];
	for (const [id, v] of Object.entries(next.violations)) {
		const olds = [oldA, ...others].map((o) => o.violations[id]);
		if (v.text && olds.every((o) => o?.text)) {
			const oldCounts = olds.map((o) => wordCounts(o!.text!));
			const extra = [...wordCounts(v.text)].filter(([word, n]) => n > Math.max(...oldCounts.map((c) => c.get(word) ?? 0))).map(([word]) => word);
			const added = [...new Set(v.text.filter((line) => line.split(/\s+/).some((word) => extra.includes(word))))];
			if (added.length) failures.push({ route, dimension: 'a11y', check: `axe ${id}: ${v.help}`, viewport, expected: 'no text outside the landmarks that the old page did not have', actual: `outside every landmark: ${added.slice(0, 5).map((l) => `"${l.length > 60 ? `${l.slice(0, 60)}...` : l}"`).join(', ')}${added.length > 5 ? ` and ${added.length - 5} more lines` : ''}`, hint: `${HINTS.axe} ${v.helpUrl}` });
			continue;
		}
		const before = Math.max(oldA.violations[id]?.count ?? 0, ...others.map((o) => o.violations[id]?.count ?? 0));
		if (v.count <= before) continue;
		failures.push({ route, dimension: 'a11y', check: `axe ${id}: ${v.help}`, viewport, expected: `${before} element${before === 1 ? '' : 's'}`, actual: `${v.count} (${v.impact}): ${v.targets.join(', ')}`, hint: `${HINTS.axe} ${v.helpUrl}` });
	}

	const landmarks = diffLines(lineTemplates(oldA.landmarks, ...others.map((o) => o.landmarks)), next.landmarks);
	for (const c of landmarks.changed) failures.push({ route, dimension: 'a11y', check: 'landmarks', viewport, expected: c.expected, actual: c.actual, hint: HINTS.landmarks });
	for (const line of landmarks.missing) failures.push({ route, dimension: 'a11y', check: 'landmarks', viewport, expected: line, actual: '(absent)', hint: HINTS.landmarks });
	for (const line of landmarks.unexpected) failures.push({ route, dimension: 'a11y', check: 'landmarks', viewport, expected: '(absent)', actual: line, hint: HINTS.landmarks });

	const templates = lineTemplates(oldA.focusOrder, ...others.map((o) => o.focusOrder));
	const order = diffLines(templates, next.focusOrder);
	if (order.changed.length || order.missing.length || order.unexpected.length) {
		const first = next.focusOrder.findIndex((item, i) => !templates[i]?.test(item));
		const at = first === -1 ? Math.min(templates.length, next.focusOrder.length) : first;
		failures.push({ route, dimension: 'a11y', check: `focus order (Tab), first difference at stop ${at + 1}`, viewport, expected: sequence(oldA.focusOrder, at), actual: sequence(next.focusOrder, at), hint: HINTS.focusOrder });
	}

	const calm = new Set([...oldA.motion, ...others.flatMap((o) => o.motion)]);
	const moving = next.motion.filter((name) => !calm.has(name));
	if (moving.length) {
		failures.push({ route, dimension: 'a11y', check: 'motion under prefers-reduced-motion: reduce', viewport, expected: oldA.motion.join(', ') || 'no running animations', actual: `running: ${[...new Set(moving)].join(', ')}`, hint: HINTS.reducedMotion });
	}
	return failures;
}
