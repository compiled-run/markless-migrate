// What a first interaction or a link is held to, from both sides' timed runs: text over recorded samples, no browser.
import { HINTS } from './hints.ts';
import type { ControlTiming, Fetch, Responsiveness, Sample, Speed, SpeedName, SpeedTiming, Worst } from './responsiveness.ts';
import { DEFAULT_BUDGET_MS, msText } from './responsiveness-summary.ts';
import type { Failure } from './types.ts';

export const SLACK_MS = 16;
export const SLACK_RATIO = 0.1;

/** A mid-range phone: Lighthouse's mobile viewport, touch input, the CPU slowed by `cpu`. */
export function speeds(cpu: number): Speed[] {
	return [
		{ name: 'desktop', label: 'desktop', cpu: 1, viewport: { name: 'desktop', width: 1280, height: 800, isMobile: false } },
		{ name: 'throttled', label: `${cpu}x CPU, mobile`, cpu, viewport: { name: 'mobile', width: 412, height: 823, isMobile: true } },
	];
}

/** A run's time, when it can be compared: a link whose next page did not show inside the window was not timed, whatever its event took. */
export function timeOf(kind: ControlTiming['kind'], s: Sample): number | undefined {
	return kind === 'navigation' && s.result === 'none' ? undefined : s.ms;
}

export interface Verdict {
	readonly ok: boolean;
	/** Another run is needed before the verdict holds: only one run exceeded. */
	readonly rerun: boolean;
	readonly oldMs?: number;
	readonly newMs?: number;
	readonly slower: boolean;
	readonly overBudget: boolean;
	readonly allowedMs?: number;
}

/** NEW fails when every one of its runs exceeds the slower OLD run by max(16 ms, 10%, how much OLD's own runs varied) or the budget, or when most of them exceed the budget; one run over asks for another. */
export function judge(old: readonly (number | undefined)[], next: readonly (number | undefined)[], budgetMs?: number): Verdict {
	const olds = old.filter((n): n is number => n !== undefined);
	const news = next.filter((n): n is number => n !== undefined);
	if (!news.length) return { ok: true, rerun: false, slower: false, overBudget: false, ...(olds.length ? { oldMs: Math.max(...olds) } : {}) };
	const oldMs = olds.length ? Math.max(...olds) : undefined;
	const oldSpread = olds.length > 1 ? oldMs! - Math.min(...olds) : 0;
	const allowedMs = oldMs !== undefined ? oldMs + Math.max(SLACK_MS, oldMs * SLACK_RATIO, oldSpread) : undefined;
	const slow = (n: number) => allowedMs !== undefined && n > allowedMs;
	const over = (n: number) => budgetMs !== undefined && n > budgetMs;
	const exceeds = (n: number) => slow(n) || over(n);
	const all = news.every(exceeds);
	if (all && news.length < 2) return { ok: false, rerun: true, newMs: news[0]!, slower: slow(news[0]!), overBudget: over(news[0]!), ...(oldMs !== undefined ? { oldMs, allowedMs: allowedMs! } : {}) };
	const overBudget = most(news, over);
	const newMs = all ? Math.max(...news) : overBudget ? middle(news) : Math.min(...news.filter((n) => !exceeds(n)));
	return { ok: !all && !overBudget, rerun: false, newMs, slower: all && news.every(slow), overBudget, ...(oldMs !== undefined ? { oldMs, allowedMs: allowedMs! } : {}) };
}

/** More than half the runs: both of two, three of five. */
export const most = (runs: readonly number[], test: (ms: number) => boolean): boolean => runs.filter(test).length * 2 > runs.length;
const middle = (runs: readonly number[]) => [...runs].sort((a, b) => a - b)[Math.floor(runs.length / 2)]!;

const kB = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

/** Code the interaction caused or waited on: a modulepreload, preload or prefetch hint already in the document when the pointer went down (a router's idle prefetch) is not. */
export const interactionCode = (f: Fetch): boolean => f.kind === 'code' && !f.hint;

/** Why a NEW interaction was slow, from what its runs saw: code it fetched, a runtime starting, a long task, data it waited on, cold against warm. */
export function likelyCause(samples: readonly Sample[], kind: ControlTiming['kind'], old: readonly Sample[] = []): string {
	const s = [...samples].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))[0];
	if (!s) return 'not measured';
	const causes: string[] = [];
	if (kind === 'navigation') {
		const o = old[0];
		if (s.result === 'reloaded' && o && o.result === 'navigated') causes.push('a full page load where the old app navigates in the page (client-side), with a blank page between');
		if (s.server) {
			const oldServer = o?.server;
			const cold = s.server.warmTtfb !== undefined && s.server.ttfb > s.server.warmTtfb + 100 ? `, ${s.server.warmTtfb} ms when fetched again straight after (a cold server function)` : '';
			causes.push(`server time ${s.server.ttfb} ms to answer${cold}${oldServer ? `, old ${oldServer.ttfb} ms` : ''}${s.server.served ? ` (${s.server.served})` : ''}, outside this timing`);
			if (s.server.htmlBytes) causes.push(`${kB(s.server.htmlBytes)} of HTML`);
		}
		if (o?.prefetch && !s.prefetch) causes.push(`the old page had ${o.prefetch} prefetch hint${o.prefetch === 1 ? '' : 's'} when the pointer went down, the new one none`);
		else if (!s.prefetch) causes.push('no prefetch');
	}
	const code = s.fetches.filter(interactionCode);
	if (kind === 'in-page' && s.result === 'reloaded' && old[0] && old[0].result !== 'reloaded') causes.push('a full page load where the old app stays on the page');
	else if (kind === 'in-page' && code.length) causes.push(`code fetch: ${code.map((f) => `${f.url} (${kB(f.bytes)})`).join(', ')}`);
	if (s.evaluated.length) causes.push(`runtime start: ${s.evaluated.join(', ')} evaluated on the interaction`);
	const long = [...s.longTasks].sort((a, b) => b.ms - a.ms)[0];
	if (long) causes.push(`long task ${long.ms} ms${long.script ? `, top script ${long.script}` : ''}`);
	const data = s.fetches.filter((f) => f.kind === 'data' && !/^\/?$/.test(f.url));
	if (kind === 'in-page' && data.length) causes.push(`waits on ${data.length} data fetch${data.length === 1 ? '' : 'es'}: ${data.slice(0, 3).map((f) => f.url).join(', ')}`);
	if (s.warmMs !== undefined && s.ms !== undefined && s.ms > s.warmMs * 2 && s.ms - s.warmMs > SLACK_MS) causes.push(`first-interaction cost: ${s.ms} ms cold, ${s.warmMs} ms the second time`);
	return causes.join('; ') || 'no single cause seen: the handler itself is slower';
}

const codeBytes = (s: Sample) => s.fetches.filter(interactionCode).reduce((sum, f) => sum + f.bytes, 0);

/** The old page fetches code on this interaction too (VitePress loads its search box and index when search opens), in every run, and the new page fetches no more of it. */
function oldFetchesAlike(olds: readonly Sample[], news: readonly Sample[]): boolean {
	const inPage = (s: Sample) => s.result !== 'reloaded';
	if (!olds.length || !olds.every((s) => inPage(s) && codeBytes(s) > 0)) return false;
	const allowed = Math.min(...olds.map(codeBytes));
	return news.every((s) => !inPage(s) || codeBytes(s) <= allowed + Math.max(1024, allowed * SLACK_RATIO));
}

/** The verdict for one control at one speed from both sides' runs. */
export function speedTiming(speed: Speed, kind: ControlTiming['kind'], olds: readonly Sample[], news: readonly Sample[], budgetMs: number): SpeedTiming {
	return timing(speed, kind, olds, news, verdictFor(kind, speed, olds, news, budgetMs), budgetMs);
}

export function verdictFor(kind: ControlTiming['kind'], speed: Speed, olds: readonly Sample[], news: readonly Sample[], budgetMs: number): Verdict {
	const time = (s: Sample) => timeOf(kind, s);
	if (olds.some((s) => s.heldBack) || news.some((s) => s.heldBack)) return { ...judge(olds.map(time), news.map(time)), ok: true, rerun: false, slower: false, overBudget: false };
	// Navigation is held to the old app at the throttled speed only; the desktop figures are reported.
	if (kind === 'navigation' && speed.name !== 'throttled') return { ...judge(olds.map(time), news.map(time)), ok: true, rerun: false, slower: false, overBudget: false };
	return judge(
		olds.map(time),
		news.map(time),
		kind === 'in-page' && speed.name === 'throttled' ? budgetMs : undefined,
	);
}

function timing(speed: Speed, kind: ControlTiming['kind'], olds: readonly Sample[], news: readonly Sample[], verdict: Verdict, budgetMs: number): SpeedTiming {
	const problems: string[] = [];
	const oldMs = verdict.oldMs;
	const newMs = verdict.newMs;
	if (verdict.slower) problems.push(`slower than the old ${msText(oldMs)} by more than max(16 ms, 10%, the old runs' spread)`);
	if (verdict.overBudget) problems.push(`over the ${budgetMs} ms budget`);
	const fetched = codeProblem(kind, olds, news);
	if (fetched) problems.push(fetched);
	const spread = olds.length > 1 && news.length > 1 ? { old: range(olds), new: range(news) } : undefined;
	return {
		speed: speed.name,
		old: olds,
		new: news,
		...(oldMs !== undefined ? { oldMs } : {}),
		...(newMs !== undefined ? { newMs } : {}),
		...(spread ? { spread } : {}),
		ok: problems.length === 0,
		problems,
		...(problems.length ? { cause: likelyCause(news, kind, olds) } : {}),
	};
}

const FETCHED = 'fetched code on the first interaction: ';

function codeProblem(kind: ControlTiming['kind'], olds: readonly Sample[], news: readonly Sample[]): string | undefined {
	// A new document loads its own scripts; that is a page load, not an interaction fetching code.
	const code = news.flatMap((s) => (kind === 'in-page' && s.result !== 'reloaded' ? s.fetches.filter(interactionCode) : []));
	return code.length && !oldFetchesAlike(olds, news) ? `${FETCHED}${[...new Set(code.map((f) => `${f.url} (${kB(f.bytes)})`))].join(', ')}` : undefined;
}

function range(samples: readonly Sample[]): number {
	const values = samples.flatMap((s) => (s.ms !== undefined ? [s.ms] : []));
	return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
}

export function worstOf(controls: readonly ControlTiming[]): Responsiveness['worst'] {
	const out: { interaction: Partial<Record<SpeedName, Worst>>; navigation: Partial<Record<SpeedName, Worst>> } = { interaction: {}, navigation: {} };
	for (const c of controls) {
		const bucket = c.kind === 'navigation' ? out.navigation : out.interaction;
		for (const t of c.speeds) {
			const current = bucket[t.speed];
			const slowestOld = Math.max(current?.slowestOld ?? -1, t.oldMs ?? -1);
			const kept = t.newMs !== undefined && (!current || (current.new ?? -1) < t.newMs) ? { control: c.control, ...(t.oldMs !== undefined ? { old: t.oldMs } : {}), new: t.newMs } : current;
			if (kept) bucket[t.speed] = { ...kept, ...(slowestOld >= 0 ? { slowestOld } : {}) };
		}
	}
	return { ...(Object.keys(out.interaction).length ? { interaction: out.interaction } : {}), ...(Object.keys(out.navigation).length ? { navigation: out.navigation } : {}) };
}

export function failuresOf(route: string, controls: readonly ControlTiming[], all: readonly Speed[], budgetMs = DEFAULT_BUDGET_MS): Failure[] {
	const failures: Failure[] = [];
	for (const c of controls) {
		for (const t of c.speeds) {
			if (t.ok) continue;
			const speed = all.find((s) => s.name === t.speed)!;
			const what = c.kind === 'navigation' ? 'navigation from' : 'first interaction with';
			const runs = (samples: readonly Sample[]) => samples.map((s) => msText(s.ms)).join(', ');
			failures.push({
				route,
				dimension: 'responsiveness',
				check: `${what} ${c.control} (${speed.label})`,
				viewport: speed.viewport.name,
				expected: `old ${msText(t.oldMs)} (runs ${runs(t.old)}); new within max(16 ms, 10%) of it${c.kind === 'in-page' && speed.name === 'throttled' ? (t.note ? ` (the old app is over the ${budgetMs} ms budget too)` : ` and under the budget`) : ''}${c.kind === 'in-page' ? ', fetching no code' : ''}`,
				actual: `new ${msText(t.newMs)} (runs ${runs(t.new)}); likely cause: ${t.cause}; ${t.problems.join('; ')}`,
				hint: c.kind === 'navigation' ? HINTS.navigation : HINTS.responsiveness,
			});
		}
	}
	return failures;
}

const timed = (samples: readonly Sample[]) => samples.flatMap((s) => (s.ms !== undefined ? [s.ms] : []));

/**
 * One control's recorded verdict as the check holds it now. The 4x budget holds where the old app meets it; where most old runs
 * miss it the new one is held to the old alone, by the slower-than test and its confirming runs. Code counts only when the
 * interaction caused it.
 */
function held(kind: ControlTiming['kind'], t: SpeedTiming, budgetMs: number): SpeedTiming {
	let problems = [...t.problems];
	let note: string | undefined;
	let newMs = t.newMs;
	const olds = timed(t.old);
	if (kind === 'in-page' && t.speed === 'throttled' && most(olds, (ms) => ms > budgetMs)) {
		problems = problems.filter((p) => p !== `over the ${budgetMs} ms budget`);
		// The run kept is the one the old-only verdict keeps: the faster within the old app's margin, else the slower.
		newMs = judge(olds, timed(t.new)).newMs ?? newMs;
		note = `the old app is over the ${budgetMs} ms budget too, so the new one is held to the old: old ${msText(t.oldMs)}, new ${msText(newMs)}`;
	}
	if (t.new.some((s) => s.fetches.some((f) => f.kind === 'code' && !interactionCode(f)))) {
		const code = codeProblem(kind, t.old, t.new);
		problems = problems.flatMap((p) => (p.startsWith(FETCHED) ? (code ? [code] : []) : [p]));
	}
	if (!note && problems.length === t.problems.length && problems.every((p, i) => p === t.problems[i])) return t;
	const { cause: _, note: __, newMs: ___, ...rest } = t;
	return { ...rest, ...(newMs !== undefined ? { newMs } : {}), ok: problems.length === 0, problems, ...(problems.length ? { cause: likelyCause(t.new, kind, t.old) } : {}), ...(note ? { note } : {}) };
}

/** A route's recorded timings held to the rules above; its failures are written again only when a verdict changed. */
export function judgeResponsiveness(route: string, recorded: { readonly responsiveness: Responsiveness; readonly failures: readonly Failure[] }): { responsiveness: Responsiveness; failures: Failure[] } {
	const r = recorded.responsiveness;
	const controls = r.controls.map((c) => ({ ...c, speeds: c.speeds.map((t) => held(c.kind, t, r.budgetMs)) }));
	if (controls.every((c, i) => c.speeds.every((t, k) => t === r.controls[i]!.speeds[k]))) return { responsiveness: r, failures: [...recorded.failures] };
	return { responsiveness: { ...r, controls, worst: worstOf(controls) }, failures: failuresOf(route, controls, speeds(r.cpu), r.budgetMs) };
}
