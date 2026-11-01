import { acceptedLabel } from './automatic.ts';
import { coverageLines } from './coverage.ts';
import { headlines, worstLine } from './responsiveness.ts';
import { loadLine, psiLines } from './load.ts';
import { PSI_NOTICE } from './psi.ts';
import { routeState } from './route-state.ts';
import { networkLines } from './slow-network-verdicts.ts';
import { wasteLines, wasteSummaryLines } from './waste.ts';
import { notCompared, type Coverage, type Failure, type LoginResult, type Report, type RouteResult } from './types.ts';

function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} kB`;
}

function clip(value: string, max = 160): string {
	return value.length > max ? `${value.slice(0, max)}...` : value;
}

function failureLines(f: Failure): string[] {
	if (f.accepted?.automatic) return [`      ${acceptedLabel(f.accepted)}: ${f.dimension}${f.viewport ? ` (${f.viewport})` : ''}: ${f.check}${f.id ? `  [${f.id}]` : ''}`, `        evidence: ${f.accepted.reason}`];
	if (f.accepted) return [`      accepted ${f.dimension}${f.viewport ? ` (${f.viewport})` : ''}: ${f.check}${f.id ? `  [${f.id}]` : ''}`, `        reason:   ${f.accepted.reason} (${f.accepted.by}, ${f.accepted.date})`];
	const lines = [`      ${f.dimension}${f.viewport ? ` (${f.viewport})` : ''}: ${f.check}${f.id ? `  [${f.id}]` : ''}`, `        expected: ${clip(f.expected)}`, `        actual:   ${clip(f.actual)}`, `        fix:      ${f.hint}`];
	if (f.where) lines.push(`        where:    ${f.where}`);
	return lines;
}

function loginLines(login: LoginResult): string[] {
	const lines = [`      sign-in: ${login.ok ? 'same session cookies' : 'differs'}${login.cookies.old.length ? ` (${login.cookies.old.join(', ')})` : ''}`];
	for (const f of login.failures) lines.push(...failureLines(f));
	return lines;
}

export function coverageLine(c: Coverage): string {
	const shared = c.elements.filter((e) => e.shared).length;
	return `interactions exercised: ${c.exercised} of ${c.total}${shared ? ` (${shared} in a layout shared with another route)` : ''}${c.skipped ? `; ${c.skipped} keyboard journeys left out for the budget` : ''}${c.sequencesSkipped ? `; ${c.sequencesSkipped} repeated-use sequences left out for the budget` : ''}`;
}

export function summarize(report: Report): string {
	const lines = [`OLD ${report.old}  vs  NEW ${report.new}`, ...(report.responsiveness ? headlines(report.responsiveness) : []), ''];
	const width = Math.max(5, ...report.routes.map((r) => r.route.length));
	let role: string | undefined;
	for (const route of report.routes) {
		if (report.roles && route.role !== role) {
			role = route.role;
			lines.push(`As ${role}:`);
			const login = report.logins?.find((l) => l.role === role);
			if (login) lines.push(...loginLines(login));
		}
		if (route.blocked) {
			lines.push(`BLOCKED  ${route.route.padEnd(width)}  ${route.blocked.message}`);
			continue;
		}
		if (route.infrastructure) {
			lines.push(`NETWORK  ${route.route.padEnd(width)}  not checked, an infrastructure failure (not the app's): ${route.infrastructure.message}`);
			continue;
		}
		const failed = Object.entries(route.dimensions).filter(([, state]) => state === 'fail').map(([d]) => d);
		const accepted = route.failures.filter((f) => f.accepted).length;
		const w = route.weight;
		const stopped = notCompared(route);
		const js = route.only === 'embeds' ? 'only the embeds compared (--only embeds)' : route.only === 'probes' ? 'only the widget probes compared (--only probes)' : route.only ? 'only page load compared (--only load)' : stopped ? 'page not compared: the two apps did not let this role in alike' : `JS on the wire ${kb(w.old.downloaded)} -> ${kb(w.new.downloaded)}, run at load ${kb(w.old.executed)} -> ${kb(w.new.executed)} (uncompressed)`;
		const state = routeState(route);
		lines.push(`${state === 'pass' ? 'pass' : state === 'differs' ? 'FAIL' : 'INCOMPLETE'}  ${route.route.padEnd(width)}  ${route.ok ? '' : `[${failed.join(', ')}]  `}${accepted ? `(${accepted} accepted) ` : ''}${route.endpoint ? `compared as ${route.endpoint}` : js}`);
		if (route.template && route.template.representative !== route.route) lines.push(`      visual, responsiveness and motion: checked on ${route.template.representative}, the representative of its template group (${route.template.pattern}, ${route.template.members} pages)`);
		if (route.coverage) lines.push(`      ${coverageLine(route.coverage)}`);
		if (route.probes) lines.push(`      ${probesLine(route.probes)}`);
		for (const note of route.improvements ?? []) lines.push(`      improvement (not red): ${note}`);
		if (route.responsiveness) lines.push(`      ${worstLine(route.responsiveness)}`);
		if (route.motion) {
			const differ = route.motion.interactions.filter((i) => !i.ok || i.reduced?.ok === false).length;
			lines.push(`      motion: ${route.motion.checked} interactions recorded, ${route.motion.interactions.length} moved${differ ? `, ${differ} differently on new` : ', alike on both'}${route.motion.skipped.length ? `; ${route.motion.skipped.length} not recorded` : ''}`);
		}
		if (route.load) lines.push(`      ${loadLine(route.load)}`, ...psiLines(route.load.psi).map((l) => `      ${l}`), ...networkLines(route.load.network).map((l) => `      ${l}`));
		const waste = route.load?.waste;
		if (waste) lines.push(...('unavailable' in waste ? [`first-click waste: ${waste.unavailable}`] : wasteLines(waste, 5)).map((l) => `      ${l}`));
		for (const f of route.failures) lines.push(...failureLines(f));
	}
	const keyless = report.routes.some((r) => r.load?.psi && ('unavailable' in r.load.psi ? /quota|keyless/.test(r.load.psi.unavailable) : !r.load.psi.keyed));
	if (keyless) lines.push('', PSI_NOTICE);
	const samples = report.unchecked?.filter((u) => !u.reason) ?? [];
	const writes = report.unchecked?.filter((u) => u.reason) ?? [];
	if (samples.length) lines.push('', `Not checked, needs a sample (add one to .migrate/samples.json):`, ...samples.map((u) => `  ${u.route}  no value for ${u.params.map((p) => `:${p}`).join(', ')}${u.file ? `  ${u.file}:${u.line}` : ''}`));
	if (writes.length) lines.push('', `Not checked, fetching it writes (check it with --route against staging copies):`, ...writes.map((u) => `  ${u.route}  ${u.reason}${u.file ? `  ${u.file}:${u.line}` : ''}`));
	for (const login of report.logins ?? []) if (!report.routes.some((r) => r.role === login.role)) lines.push(`As ${login.role}: not checked`, ...loginLines(login));
	const green = report.routes.filter((r) => r.ok).length;
	const blocked = report.routes.filter((r) => r.blocked).length;
	const network = report.routes.filter((r) => r.infrastructure).length;
	const unverified = report.routes.filter((r) => !r.ok && !r.blocked && !r.infrastructure && routeState(r) === 'incomplete').length;
	const red = report.routes.length - green - blocked - network - unverified;
	if (report.cache && Object.values(report.cache).some(Boolean)) {
		const c = report.cache;
		lines.push('', `Old side from the cache (.migrate/cache): ${c.hit} reused because nothing the old page loads changed${c.changed ? `, ${c.changed} loaded again because a response changed` : ''}${c['stale-checker'] ? `, ${c['stale-checker']} loaded again for a new checker version` : ''}${c.miss ? `, ${c.miss} not cached yet` : ''}. Pass --no-cache to load every old page again.`);
	}
	if (report.templates) {
		const pages = report.templates.groups.reduce((n, g) => n + g.members.length, 0);
		lines.push('', `Every page got the http, rendered, seo, assets, css, a11y, i18n, network, weight and behaviour checks (every control of every page is used). Visual, responsiveness and motion ran on one representative per template group (grouped by URL pattern, page layout and the kinds of control each page renders): ${report.templates.groups.length} group${report.templates.groups.length === 1 ? '' : 's'} covering ${pages} pages. Pass --every-dimension to run them on every page.`, ...report.templates.groups.map((g) => `  ${g.pattern}  ${g.members.length} pages, representative ${g.representative}`));
	}
	if (report.navigation) {
		const n = report.navigation;
		lines.push('', `In-place navigation: ${n.destinations} page${n.destinations === 1 ? '' : 's'} (one per layout and scripts) reached by clicking a link on other pages ${n.pairs} time${n.pairs === 1 ? '' : 's'}, ${n.inPlace} swapped in place and compared with a fresh load; ${n.loads} page loads in ${Math.round(n.ms / 1000)} s. Pass --no-navigation to leave it out.`);
	}
	const wasted = report.routes.flatMap((r) => (r.load?.waste && !('unavailable' in r.load.waste) ? [{ route: r.route, waste: r.load.waste }] : []));
	const wasteSummary = wasteSummaryLines(wasted, report.wasteReferences);
	if (wasteSummary.length) lines.push('', ...wasteSummary);
	if (report.coverage) lines.push('', ...coverageLines(report.coverage));
	if (report.staleAccepts?.length) lines.push('', 'Accepted differences that no longer match anything (remove them from .migrate/accepted.json):', ...report.staleAccepts.map((a) => `  ${a.route}${a.role ? ` as ${a.role}` : ''} ${a.dimension}: ${a.check}  (${a.reason})`));
	lines.push('', `${green} of ${report.routes.length} ${report.roles ? 'route checks (route and role)' : 'routes'} green${red ? `, ${red} red` : ''}${unverified ? `, ${unverified} incomplete (no difference found, but some of it not verified)` : ''}${blocked ? `, ${blocked} blocked by bot protection` : ''}${network ? `, ${network} not checked for an infrastructure failure (DNS, connection or timeout)` : ''}${report.acceptedCount ? `, ${report.acceptedCount} accepted difference${report.acceptedCount === 1 ? '' : 's'}${report.automaticCount ? ` (${report.automaticCount} automatically)` : ''}` : ''}${samples.length ? `; ${samples.length} route${samples.length === 1 ? '' : 's'} not checked (needs a sample)` : ''}${writes.length ? `; ${writes.length} not checked (fetching it writes)` : ''}.`);
	if (report.partial) lines.push(partialLine(report.partial));
	return `${lines.join('\n')}\n`;
}

export function partialLine(partial: NonNullable<Report['partial']>): string {
	return partial.total === null
		? `Partial run: ${partial.checked} route${partial.checked === 1 ? '' : 's'} checked and no plan lists the old site's routes (run plan): never overall green.`
		: `Partial run: ${partial.checked} of ${partial.total} routes checked. A run limited by --route or --changed is never overall green; run check without --route to check every route.`;
}

/** `widget probes: 12 controls driven (34 alike stood for by one of their kind), 2 not driven, 48 s`. */
export function probesLine(p: NonNullable<RouteResult['probes']>): string {
	const driven = p.controls.filter((c) => c.state === 'probed').length;
	const alike = p.controls.filter((c) => c.state.startsWith('alike')).length;
	const shared = p.controls.filter((c) => c.state.startsWith('probed on ')).length;
	const not = p.controls.length - driven - alike - shared;
	return `widget probes: ${driven} control${driven === 1 ? '' : 's'} driven${alike ? ` (${alike} alike stood for by one of their kind)` : ''}${shared ? `, ${shared} driven on another route that renders the same widget` : ''}${not ? `, ${not} not driven` : ''}, ${Math.round(p.ms / 1000)} s`;
}
