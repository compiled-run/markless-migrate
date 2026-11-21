// The before/after navigation timing table: two check reports of one site (the port before and after a change), each
// row the original's median, the port before, the port after, and each port's verdict and cause.
//   node scripts/nav-table.ts <before report.json> <after report.json>
import { readFile } from 'node:fs/promises';
import { navRows, type NavRow } from '../src/check/nav-timing-verdicts.ts';
import type { RouteNavTiming } from '../src/check/nav-timing.ts';

interface ReportRoute {
	readonly route: string;
	readonly load?: { readonly navTiming?: RouteNavTiming | { readonly unavailable: string } };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Each route's timed rows, read from a check report: routes whose navigation timing was not measured are left out. */
export function reportRows(report: unknown): Map<string, NavRow[]> {
	const out = new Map<string, NavRow[]>();
	const routes = isObject(report) && Array.isArray(report.routes) ? (report.routes as ReportRoute[]) : [];
	for (const r of routes) {
		const timing = r.load?.navTiming;
		if (timing && !('unavailable' in timing)) out.set(r.route, navRows(timing));
	}
	return out;
}

const key = (r: NavRow) => `${r.browser} ${r.profile} ${r.mode} ${r.kind}`;
const ms = (v: number | undefined) => (v === undefined ? '-' : `${Math.round(v)} ms`);
const verdict = (r: NavRow | undefined) => (!r ? '-' : `${r.verdict}${r.cause ? ` (${r.cause})` : ''}`);

/** The markdown table; the original is the after report's (the same original, measured again). */
export function navTable(before: Map<string, NavRow[]>, after: Map<string, NavRow[]>): string {
	const lines = ['| Route | Browser, network, press, visit | Original | Port before | Port after | Before | After |', '|---|---|---|---|---|---|---|'];
	for (const route of [...new Set([...before.keys(), ...after.keys()])].sort()) {
		const was = new Map((before.get(route) ?? []).map((r) => [key(r), r]));
		const now = new Map((after.get(route) ?? []).map((r) => [key(r), r]));
		for (const k of [...new Set([...was.keys(), ...now.keys()])].sort()) {
			const b = was.get(k);
			const a = now.get(k);
			lines.push(`| ${route} | ${k} | ${ms((a ?? b)?.old)} | ${ms(b?.new)} | ${ms(a?.new)} | ${verdict(b)} | ${verdict(a)} |`);
		}
	}
	return lines.join('\n');
}

if (import.meta.main) {
	const [beforeFile, afterFile] = process.argv.slice(2);
	if (!beforeFile || !afterFile) {
		process.stderr.write('usage: nav-table.ts <before report.json> <after report.json>\n');
		process.exit(2);
	}
	const read = async (file: string) => reportRows(JSON.parse(await readFile(file, 'utf8')));
	process.stdout.write(`${navTable(await read(beforeFile), await read(afterFile))}\n`);
}
