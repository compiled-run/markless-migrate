import type { Report } from './types.ts';

function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} kB`;
}

function clip(value: string, max = 160): string {
	return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function summarize(report: Report): string {
	const lines = [`OLD ${report.old}  vs  NEW ${report.new}`, ''];
	const width = Math.max(5, ...report.routes.map((r) => r.route.length));
	for (const route of report.routes) {
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
	const green = report.routes.filter((r) => r.ok).length;
	lines.push('', `${green} of ${report.routes.length} routes green${report.ok ? '' : `, ${report.routes.length - green} red`}.`);
	return `${lines.join('\n')}\n`;
}
