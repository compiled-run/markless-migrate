// What a page-load measurement found, as failures and summary lines: text over measured numbers, no browser.
import { HINTS } from './hints.ts';
import { SIGNIFICANCE } from './stats.ts';
import type { LoadDetail, LoadSide, RouteLoad } from './load.ts';
import type { FieldData, PsiResult } from './psi.ts';
import type { Failure } from './types.ts';

export const LOAD_METRICS = ['score', 'fcp', 'lcp', 'si', 'tbt', 'cls'] as const;
export type LoadMetric = (typeof LOAD_METRICS)[number];
export type Metrics = Readonly<Record<LoadMetric, number>>;

export const METRIC_LABEL: Readonly<Record<LoadMetric, string>> = {
	score: 'Performance score',
	fcp: 'First Contentful Paint',
	lcp: 'Largest Contentful Paint',
	si: 'Speed Index',
	tbt: 'Total Blocking Time',
	cls: 'Cumulative Layout Shift',
};

export const formatMetric = (metric: LoadMetric, value: number): string =>
	metric === 'score' ? `${Math.round(value)}` : metric === 'cls' ? value.toFixed(3) : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;

const kB = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

function describeFcp(d: LoadDetail | undefined): string {
	if (!d?.beforeFcp) return '';
	const largest = d.beforeFcp.largest.slice(0, 6).map((r) => `${r.url} ${kB(r.bytes)} ${r.priority} ${r.type}`).join('; ');
	return [
		d.observed.fcp !== undefined ? `unthrottled load first painted at ${Math.round(d.observed.fcp)} ms` : '',
		`${d.beforeFcp.count} requests at a render-blocking priority (VeryHigh, or a High-priority script) finished before it and hold it back (${kB(d.beforeFcp.bytes)})${largest ? `: ${largest}` : ''}`,
		d.htmlBytes !== undefined ? `HTML ${kB(d.htmlBytes)} on the wire` : '',
		d.renderBlocking.length ? `render-blocking: ${d.renderBlocking.join(', ')}` : '',
	]
		.filter(Boolean)
		.join('; ');
}

function describeSide(d: LoadDetail | undefined): string {
	if (!d) return '';
	const phases = d.lcpPhases ? Object.entries(d.lcpPhases).map(([k, v]) => `${k} ${v} ms`).join(', ') : '';
	const largest = d.beforeLcp.largest.slice(0, 5).map((r) => `${r.url} ${kB(r.bytes)} ${r.priority} ${r.type}`).join('; ');
	return [
		d.lcpElement ? `LCP element ${d.lcpElement}` : '',
		phases ? `LCP breakdown ${phases}` : '',
		d.observed.lcp !== undefined ? `unthrottled load painted it at ${Math.round(d.observed.lcp)} ms` : '',
		`${d.beforeLcp.count} requests (${kB(d.beforeLcp.bytes)}) began before it and count toward it${largest ? `, largest: ${largest}` : ''}`,
		d.htmlBytes !== undefined ? `HTML ${kB(d.htmlBytes)} on the wire` : '',
		d.renderBlocking.length ? `render-blocking: ${d.renderBlocking.join(', ')}` : '',
		d.scripts.length ? `main thread ${d.mainThreadMs ?? '?'} ms, scripts: ${d.scripts.map((s) => `${s.url} ${s.ms} ms`).join(', ')}` : '',
	]
		.filter(Boolean)
		.join('; ');
}

const runList = (runs: LoadSide['runs'], metric: LoadMetric) => runs.map((r) => ('error' in r ? 'failed' : formatMetric(metric, (r as Metrics)[metric]))).join(', ');

/** The route's page-load failures, one per metric that is worse beyond noise, each naming what the new page's load spent its time on next to the old page's. */
export function loadFailures(route: string, load: RouteLoad): Failure[] {
	const check = (what: string) => `page load: ${what} (Lighthouse, mobile)`;
	if (load.skipped) return load.ok ? [] : [{ route, dimension: 'load', check: check('the page'), viewport: 'mobile', expected: 'Lighthouse finishes a run of the new page, as it does of the old one', actual: load.skipped, hint: HINTS.load }];
	if (load.hung) {
		if (load.ok) return [];
		const failed = load.new.runs.filter((r) => 'error' in r).length;
		const actual = load.hung.new ? `the new page hung on every attempt of its first run (${load.hung.new})${load.hung.old ? `, and so did the old page (${load.hung.old}): neither could be measured` : ''}` : `the old page hung (${load.hung.old}); the new page finished ${load.new.runs.length - failed} of its ${load.new.runs.length} runs`;
		return [{ route, dimension: 'load', check: check('the page'), viewport: 'mobile', expected: load.hung.old && !load.hung.new ? 'every run of the new page finishes, where the old page hung' : 'the new page loads without hanging', actual, hint: HINTS.load }];
	}
	const lostLcp: Failure[] = load.noLcp?.new && !load.noLcp.old ? [{ route, dimension: 'load', check: check(METRIC_LABEL.lcp), viewport: 'mobile', expected: `a largest paint, as the old page has in all of its ${load.old.runs.length} runs (median ${load.old.median ? formatMetric('lcp', load.old.median.lcp) : '?'})`, actual: `none in ${load.new.runs.filter((r) => 'error' in r && r.error.startsWith('NO_LCP')).length} of the new page's ${load.new.runs.length} runs: nothing on it qualifies as a Largest Contentful Paint (NO_LCP)`, hint: HINTS.load }] : [];
	const neverIdle = load.new.runs.filter((r) => 'error' in r && r.error.startsWith('NO_TTI_NETWORK_IDLE_PERIOD')).length;
	const lostTbt: Failure[] = load.noTbt?.new ? [{ route, dimension: 'load', check: check(METRIC_LABEL.tbt), viewport: 'mobile', expected: load.noTbt.old ? 'a load that goes quiet, so its blocking time has an end, which the old page did not reach either: neither can be measured' : `a load that goes quiet, as the old page's does (median TBT ${load.old.median ? formatMetric('tbt', load.old.median.tbt) : '?'})`, actual: `the new page's network never went quiet within Lighthouse's wait in ${neverIdle} of its ${load.new.runs.length} runs (NO_TTI_NETWORK_IDLE_PERIOD)`, hint: HINTS.load }] : [];
	return [...lostLcp, ...lostTbt, ...load.verdicts
		.filter((v) => !v.ok)
		.map((v) => {
			const paint = v.metric === 'lcp' || v.metric === 'fcp' || v.metric === 'si' || v.metric === 'score';
			const describe = v.metric === 'fcp' ? describeFcp : describeSide;
			if (v.bimodal) {
				const span = (g: readonly number[]) => (formatMetric(v.metric, g[0]!) === formatMetric(v.metric, g.at(-1)!) ? formatMetric(v.metric, g[0]!) : `${formatMetric(v.metric, g[0]!)}-${formatMetric(v.metric, g.at(-1)!)}`);
				const groups = v.bimodal.clusters.map((g) => `${span(g)} (${g.length} run${g.length > 1 ? 's' : ''})`).join(', ');
				return { route, dimension: 'load' as const, check: check(METRIC_LABEL[v.metric]), viewport: 'mobile', expected: `${METRIC_LABEL[v.metric]} the runs can compare: each side's runs around one time`, actual: `inconclusive: bimodal, the ${v.bimodal.side} page's ${load.runs} runs fall in ${v.bimodal.clusters.length} clusters: ${groups}`, hint: HINTS.loadBimodal };
			}
			return {
				route,
				dimension: 'load' as const,
				check: check(METRIC_LABEL[v.metric]),
				viewport: 'mobile',
				expected: `${formatMetric(v.metric, v.old)} or better, the old page's median of ${load.runs} (runs ${runList(load.old.runs, v.metric)})${paint ? `; old: ${describe(load.old.detail)}` : ''}`,
				actual: `${formatMetric(v.metric, v.new)}, the median of ${load.runs} (runs ${runList(load.new.runs, v.metric)}): ${v.metric === 'score' ? `${Math.round(v.worse)} points lower` : `${formatMetric(v.metric, v.worse)} worse`}, beyond the ${formatMetric(v.metric, v.floor)} allowed and the noise between runs (p = ${v.p.toFixed(3)}${v.alpha !== undefined && v.alpha < SIGNIFICANCE ? `, under the ${v.alpha.toFixed(4)} its rank among the route's metrics needs` : ''})${paint ? `; new: ${describe(load.new.detail)}` : ''}`,
				hint: HINTS.load,
			};
		})];
}

/** One line per route: each metric old -> new, the medians of the runs. */
export function loadLine(load: RouteLoad): string {
	if (load.skipped) return `page load, PageSpeed-equivalent (lab): not compared, ${load.skipped}`;
	if (load.hung) {
		const m = load.new.median;
		const port = m ? `; port: score ${formatMetric('score', m.score)}, FCP ${formatMetric('fcp', m.fcp)}, LCP ${formatMetric('lcp', m.lcp)}, SI ${formatMetric('si', m.si)}, TBT ${formatMetric('tbt', m.tbt)}, CLS ${formatMetric('cls', m.cls)}` : '';
		return `page load, PageSpeed-equivalent (lab; Lighthouse mobile): ${load.hung.old ? `original hung (${load.hung.old})` : 'original measured'}${load.hung.new ? `, port hung (${load.hung.new})` : port}`;
	}
	const parts = load.verdicts.map((v) => `${v.metric === 'score' ? 'score' : v.metric.toUpperCase()} ${formatMetric(v.metric, v.old)} -> ${formatMetric(v.metric, v.new)}${v.ok ? '' : ' (worse)'}`);
	const lcp = (side: 'old' | 'new') => (load.noLcp?.[side] ? 'none' : load[side].median ? formatMetric('lcp', load[side].median!.lcp) : '?');
	if (load.noTbt) parts.push(`TBT ${load.noTbt.old ? "never (the original's network never went quiet)" : load.old.median ? formatMetric('tbt', load.old.median.tbt) : '?'} -> ${load.noTbt.new ? 'never (worse)' : load.new.median ? formatMetric('tbt', load.new.median.tbt) : '?'}`);
	if (load.noLcp) parts.push(`LCP ${lcp('old')} -> ${lcp('new')}${load.noLcp.old ? ` (none on the original${load.noLcp.new ? ' or the port' : ''}: score and LCP not compared)` : ' (worse)'}`);
	const cpu = load.cpuMultiplier ? `, ${load.cpuMultiplier}x CPU${load.benchmarkIndex ? ` for benchmarkIndex ${load.benchmarkIndex}` : ''}` : '';
	return `page load, PageSpeed-equivalent (lab; Lighthouse mobile, median of ${load.runs}${load.browser ? `, ${load.browser}` : ''}${cpu}): ${parts.join(', ')}`;
}

const PSI_LABEL = (strategy: string) => `PageSpeed Insights, ${strategy}`;

/** The route's PageSpeed Insights failures, when PSI answered; a side PSI never finished is red only when it is the new one. */
export function psiFailures(route: string, psi: PsiResult | undefined): Failure[] | undefined {
	if (!psi || 'unavailable' in psi) return undefined;
	return psi.strategies.flatMap((s) =>
		s.verdicts.length
			? s.verdicts
					.filter((v) => !v.ok)
					.map((v) => ({
						route,
						dimension: 'load' as const,
						check: `page load: ${METRIC_LABEL[v.metric]} (${PSI_LABEL(s.strategy)})`,
						viewport: s.strategy,
						expected: `${formatMetric(v.metric, v.old)} or better, the old page's median of ${s.old.runs.length} PageSpeed Insights runs (${runList(s.old.runs, v.metric)})`,
						actual: v.bimodal ? `inconclusive: bimodal, the ${v.bimodal.side} page's runs fall in ${v.bimodal.clusters.length} clusters: ${v.bimodal.clusters.map((g) => g.map((x) => formatMetric(v.metric, x)).join(' ')).join(' / ')}` : `${formatMetric(v.metric, v.new)}, the median of ${s.new.runs.length} (${runList(s.new.runs, v.metric)}): ${v.metric === 'score' ? `${Math.round(v.worse)} points lower` : `${formatMetric(v.metric, v.worse)} worse`}, beyond the ${formatMetric(v.metric, v.floor)} allowed and the noise between runs (p = ${v.p.toFixed(3)}${v.alpha !== undefined && v.alpha < SIGNIFICANCE ? `, under the ${v.alpha.toFixed(4)} its rank among the route's metrics needs` : ''})`,
						hint: v.bimodal ? HINTS.loadBimodal : HINTS.load,
					}))
			: s.new.median
				? []
				: [{ route, dimension: 'load' as const, check: `page load: the page (${PSI_LABEL(s.strategy)})`, viewport: s.strategy, expected: 'PageSpeed Insights finishes a run of the new page', actual: String((s.new.runs[0] as { error?: string } | undefined)?.error ?? 'no run finished'), hint: HINTS.load }],
	);
}

const fieldLine = (f: FieldData) =>
	`${f.scope === 'url' ? 'this URL' : 'its origin'}${f.category ? ` ${f.category}` : ''}: ${Object.entries(f.p75).map(([k, v]) => `${k.toUpperCase()} ${k === 'cls' ? v.toFixed(2) : `${Math.round(v)} ms`}`).join(', ')}`;

/** One line per strategy PSI measured, or why it did not, for the summary. */
export function psiLines(psi: PsiResult | undefined): string[] {
	if (!psi) return [];
	if ('unavailable' in psi) return [`PageSpeed Insights: ${psi.unavailable}`];
	return psi.strategies.flatMap((s) => {
		const parts = s.verdicts.map((v) => `${v.metric === 'score' ? 'score' : v.metric.toUpperCase()} ${formatMetric(v.metric, v.old)} -> ${formatMetric(v.metric, v.new)}${v.ok ? '' : ' (worse)'}`);
		const field = [s.old.field ? `old ${fieldLine(s.old.field)}` : '', s.new.field ? `new ${fieldLine(s.new.field)}` : ''].filter(Boolean);
		return [`PageSpeed Insights ${s.strategy}${psi.keyed ? '' : ' (keyless)'}, median of ${s.old.runs.length}${s.old.lighthouse ? `, Lighthouse ${s.old.lighthouse}` : ''}: ${parts.join(', ') || 'no run finished'}`, ...(field.length ? [`  field data (Chrome UX Report, p75): ${field.join('; ')}`] : [])];
	});
}
