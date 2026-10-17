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

// The focused element's role and name from Chromium's accessibility tree; undefined once focus is on the body or wraps around.
async function focused(session: CDPSession): Promise<string | undefined> {
	const { result } = await session.send('Runtime.evaluate', {
		expression: `(() => { const el = document.activeElement; if (!el || el === document.body || el.__mmTabbed) return null; el.__mmTabbed = true; return el; })()`,
	});
	if (!result.objectId) return undefined;
	const { nodes } = (await session.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false })) as { nodes: AxNode[] };
	return label(nodes.find((n) => !n.ignored) ?? nodes[0]);
}

// Runs last on a page: it presses Tab, which moves focus and may scroll.
export async function captureA11y(page: Page): Promise<A11yCapture> {
	const session = await page.context().newCDPSession(page);
	try {
		await page.addScriptTag({ content: axe() });
		const results = (await page.evaluate(() => (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<unknown> } }).axe.run(document, { resultTypes: ['violations'] }))) as {
			violations: { id: string; impact: string | null; help: string; helpUrl: string; nodes: { target: unknown[] }[] }[];
		};
		const violations = Object.fromEntries(results.violations.map((v) => [v.id, { impact: v.impact ?? 'unknown', help: v.help, helpUrl: v.helpUrl, count: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.map(String).join(' ')) }]));

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
		for (let i = 0; i < MAX_TABS; i++) {
			await page.keyboard.press('Tab');
			const now = await focused(session);
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
