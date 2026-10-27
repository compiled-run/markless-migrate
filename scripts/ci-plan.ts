// Which unit files and e2e suites a CI run runs. A pull request runs those whose inputs it changed; the merge queue,
// main and a dispatch run all of them, so a dependency this misses still runs before anything merges.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

export type E2eJob = { suite: string; shard?: string; browsers?: string };

/** Firefox stays on every pull request (a port must never be slower in Firefox): these measure all three browsers on small fixed pages. */
export const EVERY_PULL_REQUEST = new Set(['slow-network', 'late-fonts']);

export const E2E: readonly E2eJob[] = [
	{ suite: 'convert-compiles' },
	{ suite: 'dev-builds' },
	{ suite: 'embeds' },
	{ suite: 'markless-site' },
	{ suite: 'motion' },
	{ suite: 'nav-parity' },
	{ suite: 'page-load' },
	{ suite: 'proxy' },
	{ suite: 'radix-dialog-port' },
	{ suite: 'responsiveness' },
	{ suite: 'waste' },
	{ suite: 'slow-network', browsers: 'chromium firefox webkit' },
	{ suite: 'late-fonts', browsers: 'chromium firefox webkit' },
	...['1/6', '2/6', '3/6', '4/6', '5/6', '6/6'].map((shard) => ({ suite: 'next-app', shard })),
	...['1/4', '2/4', '3/4', '4/4'].map((shard) => ({ suite: 'vite-site', shard })),
];

export const UNIT_SHARDS = 4;

// A change here can reach every test: dependencies, the toolchain, or how CI runs them.
const EVERYTHING = [/^package\.json$/, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^tsconfig\.json$/, /^\.github\/workflows\/ci\.yml$/, /^\.github\/actions\//, /^scripts\/ci-/];

const SPECIFIER = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const LITERAL = /['"`]([\w@.+-]+(?:\/[\w@.+-]+)*\/?)['"`]/g;
const JOIN = /\b(?:join|resolve)\(([^()]*)\)/g;
const SEGMENT = /^\s*['"]([\w@.+-]+)['"]\s*$/;

const listings = new Map<string, Set<string>>();

/** Exact-case existence: macOS's filesystem would otherwise match a literal 'license' to LICENSE. */
function exists(root: string, path: string): boolean {
	let dir = root;
	for (const segment of path.split('/')) {
		if (!listings.has(dir)) listings.set(dir, new Set(existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir) : []));
		if (!listings.get(dir)!.has(segment)) return false;
		dir = join(dir, segment);
	}
	return true;
}

/**
 * Every repository file and directory a test file can read: its static imports, followed, and the paths named by
 * string literals in test-side files (a literal with a `/` or a file extension). The tool's own source is left out of
 * the literal scan: its literals name paths in the apps it converts, not in this repository. A directory ends in `/`.
 */
export function inputsOf(root: string, file: string, packages: ReadonlyMap<string, string>): Set<string> {
	const found = new Set<string>();
	const pending = [file];
	const add = (path: string) => {
		if (path.startsWith('..') || path.includes('node_modules') || path === '' || path === '.') return;
		if (!exists(root, path)) return;
		const full = join(root, path);
		if (statSync(full).isDirectory()) {
			const index = join(path, 'index.ts');
			if (existsSync(join(root, index)) && !found.has(index)) pending.push(index);
			found.add(`${path}/`);
		} else if (!found.has(path)) {
			if (/\.[cm]?[jt]sx?$/.test(path)) pending.push(path);
			else found.add(path);
		}
	};
	while (pending.length > 0) {
		const current = pending.pop()!;
		if (found.has(current)) continue;
		found.add(current);
		const source = readFileSync(join(root, current), 'utf8');
		for (const match of source.matchAll(SPECIFIER)) {
			const specifier = (match[1] ?? match[2] ?? match[3])!;
			if (specifier.startsWith('.')) {
				const path = normalize(join(dirname(current), specifier));
				add(existsSync(join(root, path)) || !existsSync(join(root, `${path}.ts`)) ? path : `${path}.ts`);
			} else {
				const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!;
				const dir = packages.get(name);
				if (dir) add(dir);
			}
		}
		if (/^(src|parts)\//.test(current)) continue;
		for (const match of source.matchAll(JOIN)) {
			const segments: string[] = [];
			for (const arg of match[1]!.split(',')) {
				const literal = SEGMENT.exec(arg)?.[1];
				if (literal !== undefined) segments.push(literal);
				else if (segments.length > 0) break;
			}
			if (segments.length === 0) continue;
			add(normalize(join(dirname(current), ...segments)));
			if (segments[0] !== '..') add(normalize(join(...segments)));
		}
		for (const match of source.matchAll(LITERAL)) {
			const literal = match[1]!.replace(/\/$/, '');
			if (!literal.includes('/') && !/\.\w+$/.test(literal)) continue;
			add(normalize(literal));
			add(normalize(join(dirname(current), literal)));
		}
	}
	return found;
}

export function reaches(inputs: ReadonlySet<string>, changed: string): boolean {
	if (inputs.has(changed)) return true;
	for (const input of inputs) if (input.endsWith('/') && changed.startsWith(input)) return true;
	return false;
}

export function reachesEverything(changed: readonly string[]): boolean {
	return changed.some((path) => EVERYTHING.some((pattern) => pattern.test(path)));
}

function workspacePackages(root: string): Map<string, string> {
	const packages = new Map<string, string>();
	for (const dir of readdirSync(join(root, 'fixtures'))) {
		const manifest = join(root, 'fixtures', dir, 'package.json');
		if (existsSync(manifest)) packages.set(JSON.parse(readFileSync(manifest, 'utf8')).name, `fixtures/${dir}`);
	}
	return packages;
}

const known = new Map<string, Set<string>>();

export type Plan = { unitFiles: string[]; e2e: E2eJob[]; reason: string };

/** `changed` is undefined when every test runs. */
export function plan(root: string, changed: readonly string[] | undefined): Plan {
	const unit = readdirSync(join(root, 'test')).filter((name) => name.endsWith('.test.ts')).sort().map((name) => `test/${name}`);
	if (changed === undefined) return { unitFiles: unit, e2e: [...E2E], reason: 'every test runs on this event' };
	if (reachesEverything(changed)) return { unitFiles: unit, e2e: [...E2E], reason: 'the change reaches every test' };
	const packages = workspacePackages(root);
	const selected = (file: string) => {
		const key = `${root}\0${file}`;
		if (!known.has(key)) known.set(key, inputsOf(root, file, packages));
		const inputs = known.get(key)!;
		return changed.some((path) => reaches(inputs, path));
	};
	const suites = new Set(E2E.map((job) => job.suite).filter((suite) => EVERY_PULL_REQUEST.has(suite) || selected(`test/e2e/${suite}.test.ts`)));
	return { unitFiles: unit.filter(selected), e2e: E2E.filter((job) => suites.has(job.suite)), reason: `${changed.length} changed files` };
}

if (import.meta.main) {
	const root = process.cwd();
	const base = process.env.BASE_SHA;
	const changed = base ? execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean) : undefined;
	const result: Plan = process.env.QUEUE_TESTED === 'true' ? { unitFiles: [], e2e: [], reason: "the merge queue's green run already tested this commit" } : plan(root, changed);
	const shards = Math.min(UNIT_SHARDS, Math.ceil(result.unitFiles.length / 20));
	const outputs = {
		unit_files: result.unitFiles.join(' '),
		unit_shards: JSON.stringify(Array.from({ length: shards }, (_, i) => `${i + 1}/${shards}`)),
		e2e: JSON.stringify(result.e2e),
	};
	console.log(`${result.reason}: ${result.unitFiles.length} unit files in ${shards} shards, e2e ${[...new Set(result.e2e.map((job) => job.suite))].join(' ') || 'none'}`);
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
	if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.reason}\n\nUnit files (${result.unitFiles.length}): ${result.unitFiles.map((file) => relative('test', file)).join(', ') || 'none'}\n\nE2E: ${result.e2e.map((job) => job.suite + (job.shard ? ` ${job.shard}` : '')).join(', ') || 'none'}\n`);
}
