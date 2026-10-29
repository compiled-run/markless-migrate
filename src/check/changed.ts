import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RouteState } from '../status.ts';

const run = promisify(execFile);

export async function git(dir: string, args: string[]): Promise<string | undefined> {
	try {
		return (await run('git', ['-C', dir, ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout;
	} catch {
		return undefined;
	}
}

export async function gitHead(dir: string): Promise<string | undefined> {
	return (await git(dir, ['rev-parse', 'HEAD']))?.trim() || undefined;
}

/** Files under `dir` (relative to it) that differ from `commit`: committed since, staged, unstaged or new. Undefined when git cannot tell. */
export async function changedSince(dir: string, commit: string): Promise<string[] | undefined> {
	const [diff, untracked] = await Promise.all([git(dir, ['diff', '--name-only', '--relative', commit, '--']), git(dir, ['ls-files', '--others', '--exclude-standard'])]);
	if (diff === undefined || untracked === undefined) return undefined;
	return [...new Set([...diff.split('\n'), ...untracked.split('\n')].map((l) => l.trim()).filter((l) => l && !l.startsWith('.migrate/')))].sort();
}

export interface ChangedSelection {
	readonly check: string[];
	/** Routes left out: green last time, and none of their new-side files changed since. */
	readonly skipped: string[];
}

/**
 * Which routes `--changed` re-checks: any never checked, red or blocked last time, checked without a recorded commit, or
 * whose new-side files changed since that commit. A changed file no route lists (a config, a shared stylesheet the scan did
 * not tie to a page) re-checks everything.
 */
export async function selectChanged(routes: readonly string[], results: Readonly<Record<string, RouteState>>, changed: (commit: string) => Promise<string[] | undefined>): Promise<ChangedSelection> {
	const known = new Set(Object.values(results).flatMap((r) => r.files ?? []));
	const cache = new Map<string, Promise<string[] | undefined>>();
	const since = (commit: string) => {
		if (!cache.has(commit)) cache.set(commit, changed(commit));
		return cache.get(commit)!;
	};
	const check: string[] = [];
	const skipped: string[] = [];
	for (const route of routes) {
		const entries = Object.values(results).filter((r) => r.route === route);
		let again = !entries.length || entries.some((r) => !r.ok || r.blocked || !r.commit);
		for (const r of again ? [] : entries) {
			const files = await since(r.commit!);
			if (!files || files.some((f) => !known.has(f) || r.files?.includes(f))) again = true;
			if (again) break;
		}
		(again ? check : skipped).push(route);
	}
	return { check, skipped };
}
