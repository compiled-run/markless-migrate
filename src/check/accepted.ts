import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Dimension, Failure, FailureDimension, Report, RouteResult } from './types.ts';
import { DIMENSIONS, notCompared } from './types.ts';
import { settleCoverage } from './coverage.ts';
import { grantAutomatic, type AutomaticRule } from './automatic.ts';

export const ACCEPTED_FILE = 'accepted.json';

/** An intended difference: failures it matches are reported as accepted, not red. Written by a human through `accept`. */
export interface Accept {
	/** Glob over the route: `*` stays within a path segment, `**` crosses them. */
	readonly route: string;
	/** The role the failure was seen as; absent matches every role. */
	readonly role?: string;
	readonly dimension: FailureDimension | '*';
	/** The failure's check, as a glob whose `*` matches any text: check names hold addresses (`after arriving from / by link`). */
	readonly check: string;
	readonly viewport?: string;
	/** Exact strings, or `/regex/flags`; `element` matches a failure about that role and accessible name. */
	readonly match?: { readonly expected?: string; readonly actual?: string; readonly element?: { readonly role: string; readonly name: string } };
	readonly reason: string;
	readonly by: string;
	readonly date: string;
	/** The failure id it was accepted from. */
	readonly id?: string;
}

export async function readAccepted(path: string): Promise<Accept[]> {
	let parsed: { accepted?: unknown[] } | unknown[];
	try {
		parsed = JSON.parse(await readFile(path, 'utf8')) as { accepted?: unknown[] } | unknown[];
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw new Error(`${path}: ${(error as Error).message}`);
	}
	return (Array.isArray(parsed) ? parsed : (parsed.accepted ?? [])).map((entry, i) => normalise(entry, `${path} entry ${i + 1}`));
}

// A hand-written entry may leave out who and when; what it matches and why must be there.
function normalise(entry: unknown, where: string): Accept {
	const e = (entry ?? {}) as Partial<Record<keyof Accept, unknown>>;
	for (const field of ['route', 'check', 'reason'] as const) if (typeof e[field] !== 'string' || !(e[field] as string).trim()) throw new Error(`${where}: "${field}" must be a non-empty string`);
	const dimension = e.dimension ?? '*';
	if (dimension !== '*' && !(DIMENSIONS as readonly unknown[]).includes(dimension)) throw new Error(`${where}: "dimension" must be one of ${DIMENSIONS.join(', ')} or *`);
	return { ...(e as unknown as Accept), dimension: dimension as Accept['dimension'], by: typeof e.by === 'string' && e.by ? e.by : '(not named)', date: typeof e.date === 'string' && e.date ? e.date : '(no date)' };
}

export async function writeAccepted(path: string, accepted: readonly Accept[]): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify({ accepted }, null, '\t')}\n`);
}

function textGlob(pattern: string): RegExp {
	return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '.*')}$`, 's');
}

function glob(pattern: string): RegExp {
	const body = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
	return new RegExp(`^${body}$`);
}

function text(pattern: string, value: string): boolean {
	const regex = pattern.match(/^\/(.+)\/([a-z]*)$/s);
	return regex ? new RegExp(regex[1]!, regex[2]).test(value) : pattern === value;
}

const unslash = (route: string) => (route.length > 1 ? route.replace(/\/+$/, '') : route);

export function routeMatches(pattern: string, route: string): boolean {
	return glob(unslash(pattern)).test(unslash(route));
}

type Origins = { readonly old: string; readonly new: string };

const scrubber = (origins: Origins) => (s: string) => s.replaceAll(origins.old, 'OLD').replaceAll(origins.new, 'NEW');

export function matches(accept: Accept, failure: Failure, origins: Origins = { old: '\u0000', new: '\u0000' }): boolean {
	const scrub = scrubber(origins);
	if (!routeMatches(accept.route, failure.route)) return false;
	if (accept.role && accept.role !== (failure.role ?? 'anonymous')) return false;
	if (accept.dimension !== '*' && accept.dimension !== failure.dimension) return false;
	if (!textGlob(accept.check).test(failure.check)) return false;
	if (accept.viewport && accept.viewport !== failure.viewport) return false;
	const m = accept.match;
	if (m?.expected !== undefined && !text(m.expected, scrub(failure.expected))) return false;
	if (m?.actual !== undefined && !text(m.actual, scrub(failure.actual))) return false;
	if (m?.element) {
		const named = `${m.element.role} "${m.element.name}"`;
		if (![failure.expected, failure.actual, failure.where ?? ''].some((s) => s.includes(named))) return false;
	}
	return true;
}

/** The same failure gets the same id on every run: origins are replaced by OLD and NEW before hashing. */
export function failureId(failure: Failure, origins: Origins): string {
	const scrub = scrubber(origins);
	// Timings differ on every run; the same slow control with the same cause is the same failure.
	const timing = (value: string) => (failure.dimension === 'responsiveness' ? value.replace(/\d+(\.\d+)?/g, '#') : value);
	const key = [failure.route, failure.role ?? '', failure.dimension, failure.check, failure.viewport ?? '', timing(scrub(failure.expected)), timing(scrub(failure.actual))].join('\u0000');
	return createHash('sha256').update(key).digest('hex').slice(0, 10);
}

function settle(route: RouteResult, failures: readonly Failure[]): RouteResult {
	if (!failures.some((f) => f.accepted)) return { ...route, failures };
	const open = failures.filter((f) => !f.accepted);
	const failed = new Set(open.map((f) => f.dimension));
	const dimensions = Object.fromEntries(DIMENSIONS.map((d) => [d, failed.has(d) ? 'fail' : route.dimensions[d] === 'skipped' ? 'skipped' : 'pass'])) as RouteResult['dimensions'];
	const compared = !route.blocked && !notCompared(route);
	return { ...route, failures, dimensions, ok: open.length === 0 && compared };
}

/**
 * Gives every failure its id and marks the ones an accepted difference covers, then the ones an automatic rule proves are no
 * user-visible regression (unless `off` names the rule). A route whose failures are all accepted is green. An accept whose
 * route was checked in this run but that matched nothing is returned as stale.
 */
export function applyAccepted(report: Report, accepted: readonly Accept[], off: readonly AutomaticRule[] = []): Report {
	const origins = { old: report.old, new: report.new };
	const used = new Set<Accept>();
	const mark = (f: Failure): Failure => {
		const id = failureId(f, origins);
		const hit = accepted.find((a) => matches(a, f, origins));
		if (hit) used.add(hit);
		return { ...f, id, ...(hit ? { accepted: { reason: hit.reason, by: hit.by, date: hit.date } } : {}) };
	};
	const date = report.startedAt.slice(0, 10);
	const routes = report.routes.map((route) => settle(route, grantAutomatic(route.failures.map(mark), off, date)));
	const logins = report.logins?.map((login) => {
		const failures = login.failures.map(mark);
		return { ...login, failures, ok: failures.every((f) => f.accepted) };
	});
	const coverage = report.coverage ? settleCoverage(report.coverage, report.coverage.failures.map(mark)) : undefined;
	const exercised = (a: Accept) => (a.dimension === 'coverage' ? Boolean(report.coverage) : report.routes.some((r) => routeMatches(a.route, r.route) && (!a.role || a.role === (r.role ?? 'anonymous'))));
	const stale = accepted.filter((a) => !used.has(a) && exercised(a));
	const all = [...routes.flatMap((r) => r.failures), ...(logins ?? []).flatMap((l) => l.failures), ...(coverage?.failures ?? [])];
	const checkedOk = routes.every((r) => r.ok) && (logins ?? []).every((l) => l.ok) && !coverage?.missing.length && !coverage?.servedByOld?.length && !coverage?.unreachable.length;
	return {
		...report,
		routes,
		...(logins ? { logins } : {}),
		...(coverage ? { coverage } : {}),
		checkedOk,
		ok: checkedOk && !report.partial,
		...(all.some((f) => f.accepted) ? { acceptedCount: all.filter((f) => f.accepted).length } : {}),
		...(all.some((f) => f.accepted?.automatic) ? { automaticCount: all.filter((f) => f.accepted?.automatic).length } : {}),
		...(stale.length ? { staleAccepts: stale } : {}),
	};
}

/** An accept entry for one failure exactly as it was seen: its route, role, dimension, check, viewport, expected and actual. */
export function acceptFailure(failure: Failure, origins: Origins, reason: string, by: string, date = new Date().toISOString().slice(0, 10)): Accept {
	const scrub = scrubber(origins);
	return {
		route: failure.route,
		...(failure.role && failure.role !== 'anonymous' ? { role: failure.role } : {}),
		dimension: failure.dimension,
		check: failure.check,
		...(failure.viewport ? { viewport: failure.viewport } : {}),
		match: { expected: scrub(failure.expected), actual: scrub(failure.actual) },
		reason,
		by,
		date,
		...(failure.id ? { id: failure.id } : {}),
	};
}
