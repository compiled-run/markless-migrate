import type { LoginResult, Report } from './types.ts';

function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} kB`;
}

function clip(value: string, max = 160): string {
	return value.length > max ? `${value.slice(0, max)}...` : value;
}

function loginLines(login: LoginResult): string[] {
	const lines = [`      sign-in: ${login.ok ? 'same session cookies' : 'differs'}${login.cookies.old.length ? ` (${login.cookies.old.join(', ')})` : ''}`];
	for (const f of login.failures) lines.push(`      ${f.dimension}: ${f.check}`, `        expected: ${clip(f.expected)}`, `        actual:   ${clip(f.actual)}`, `        fix:      ${f.hint}`);
	return lines;
}

export function summarize(report: Report): string {
	const lines = [`OLD ${report.old}  vs  NEW ${report.new}`, ''];
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
		const w = route.weight;
		const js = `JS on the wire ${kb(w.old.downloaded)} -> ${kb(w.new.downloaded)}, run at load ${kb(w.old.executed)} -> ${kb(w.new.executed)} (uncompressed)`;
		lines.push(`${route.ok ? 'pass' : 'FAIL'}  ${route.route.padEnd(width)}  ${route.ok ? '' : `[${failed.join(', ')}]  `}${js}`);
		for (const f of route.failures) {
			lines.push(`      ${f.dimension}${f.viewport ? ` (${f.viewport})` : ''}: ${f.check}`);
			lines.push(`        expected: ${clip(f.expected)}`);
			lines.push(`        actual:   ${clip(f.actual)}`);
			lines.push(`        fix:      ${f.hint}`);
		}
	}
	for (const login of report.logins ?? []) if (!report.routes.some((r) => r.role === login.role)) lines.push(`As ${login.role}: not checked`, ...loginLines(login));
	const green = report.routes.filter((r) => r.ok).length;
	const blocked = report.routes.filter((r) => r.blocked).length;
	const red = report.routes.length - green - blocked;
	lines.push('', `${green} of ${report.routes.length} ${report.roles ? 'route checks (route and role)' : 'routes'} green${red ? `, ${red} red` : ''}${blocked ? `, ${blocked} blocked by bot protection` : ''}.`);
	return `${lines.join('\n')}\n`;
}
