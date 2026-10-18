import { acceptedLabel } from './automatic.ts';
import { headlines, worstLine } from './responsiveness.ts';
import { notCompared, type Coverage, type Failure, type LoginResult, type Report } from './types.ts';

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
	return `interactions exercised: ${c.exercised} of ${c.total}${shared ? ` (${shared} in a layout shared with another route)` : ''}${c.skipped ? `; ${c.skipped} keyboard journeys left out for the budget` : ''}`;
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
		const failed = Object.entries(route.dimensions).filter(([, state]) => state === 'fail').map(([d]) => d);
		const accepted = route.failures.filter((f) => f.accepted).length;
		const w = route.weight;
		const stopped = notCompared(route.dimensions);
		const js = stopped ? 'page not compared: the two apps did not let this role in alike' : `JS on the wire ${kb(w.old.downloaded)} -> ${kb(w.new.downloaded)}, run at load ${kb(w.old.executed)} -> ${kb(w.new.executed)} (uncompressed)`;
		lines.push(`${route.ok ? 'pass' : 'FAIL'}  ${route.route.padEnd(width)}  ${route.ok ? '' : `[${failed.join(', ')}]  `}${accepted ? `(${accepted} accepted) ` : ''}${route.endpoint ? `compared as ${route.endpoint}` : js}`);
		if (route.coverage) lines.push(`      ${coverageLine(route.coverage)}`);
		if (route.responsiveness) lines.push(`      ${worstLine(route.responsiveness)}`);
		for (const f of route.failures) lines.push(...failureLines(f));
	}
	const samples = report.unchecked?.filter((u) => !u.reason) ?? [];
	const writes = report.unchecked?.filter((u) => u.reason) ?? [];
	if (samples.length) lines.push('', `Not checked, needs a sample (add one to .migrate/samples.json):`, ...samples.map((u) => `  ${u.route}  no value for ${u.params.map((p) => `:${p}`).join(', ')}${u.file ? `  ${u.file}:${u.line}` : ''}`));
	if (writes.length) lines.push('', `Not checked, fetching it writes (check it with --route against staging copies):`, ...writes.map((u) => `  ${u.route}  ${u.reason}${u.file ? `  ${u.file}:${u.line}` : ''}`));
	for (const login of report.logins ?? []) if (!report.routes.some((r) => r.role === login.role)) lines.push(`As ${login.role}: not checked`, ...loginLines(login));
	const green = report.routes.filter((r) => r.ok).length;
	const blocked = report.routes.filter((r) => r.blocked).length;
	const red = report.routes.length - green - blocked;
	if (report.staleAccepts?.length) lines.push('', 'Accepted differences that no longer match anything (remove them from .migrate/accepted.json):', ...report.staleAccepts.map((a) => `  ${a.route}${a.role ? ` as ${a.role}` : ''} ${a.dimension}: ${a.check}  (${a.reason})`));
	lines.push('', `${green} of ${report.routes.length} ${report.roles ? 'route checks (route and role)' : 'routes'} green${red ? `, ${red} red` : ''}${blocked ? `, ${blocked} blocked by bot protection` : ''}${report.acceptedCount ? `, ${report.acceptedCount} accepted difference${report.acceptedCount === 1 ? '' : 's'}${report.automaticCount ? ` (${report.automaticCount} automatically)` : ''}` : ''}${samples.length ? `; ${samples.length} route${samples.length === 1 ? '' : 's'} not checked (needs a sample)` : ''}${writes.length ? `; ${writes.length} not checked (fetching it writes)` : ''}.`);
	return `${lines.join('\n')}\n`;
}
