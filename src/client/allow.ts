import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PageFinding } from './page.ts';

export const ALLOW_FILE = 'guard-allow.json';

/**
 * An intended addition or change the page guard should not report as red, with why:
 * `{ "allow": [{ "subject": "div.port-attribution*", "kind": "inline style differs", "route": "**", "reason": "licence badge for this demo copy" }] }`.
 * `subject` and `route` take `*` (any run of characters; in `route`, `*` stays within a path segment and `**` crosses them).
 */
export interface Allowance {
	readonly subject: string;
	readonly reason: string;
	readonly kind?: PageFinding['kind'];
	readonly route?: string;
}

export async function readAllowances(stateDir: string): Promise<Allowance[]> {
	const path = join(stateDir, ALLOW_FILE);
	const text = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? undefined : Promise.reject(error)));
	if (text === undefined) return [];
	const parsed = JSON.parse(text) as { allow?: unknown };
	if (!Array.isArray(parsed.allow)) throw new Error(`${path}: needs "allow": a list of { "subject", "reason" }`);
	return parsed.allow.map((entry, i) => {
		const e = entry as Partial<Allowance>;
		if (typeof e.subject !== 'string' || !e.subject.trim()) throw new Error(`${path}: allow[${i}] needs "subject", the element or asset it covers`);
		if (typeof e.reason !== 'string' || e.reason.trim().split(/\s+/).length < 3) throw new Error(`${path}: allow[${i}] (${e.subject}) needs "reason": why the difference is intended, in a few words`);
		return { subject: e.subject, reason: e.reason, ...(e.kind ? { kind: e.kind } : {}), ...(e.route ? { route: e.route } : {}) };
	});
}

const glob = (pattern: string, path: boolean) => new RegExp(`^${pattern.split(/(\*\*|\*)/).map((p) => (p === '**' ? '.*' : p === '*' ? (path ? '[^/]*' : '.*') : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`);

/** Marks each finding an allowance covers: listed with the allowance's reason, never red. */
export function applyAllowances(findings: readonly PageFinding[], allowances: readonly Allowance[]): PageFinding[] {
	const tests = allowances.map((a) => ({ a, subject: glob(a.subject, false), route: glob(a.route ?? '**', true) }));
	return findings.map((f) => {
		const hit = tests.find((t) => t.subject.test(f.subject) && t.route.test(f.route) && (!t.a.kind || t.a.kind === f.kind));
		return hit && f.kind !== 'foreign runtime' ? { ...f, red: false, allowed: hit.a.reason } : f;
	});
}
