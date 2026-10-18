import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { diffLines, lineTemplates } from '../noise.ts';

export const CLI_CONFIG = 'cli.json';
export const CLI_REPORT = 'cli-report.json';
const PRELOAD = new URL('./network.mjs', import.meta.url);

/** One side's tool: the argv every case's `args` are appended to. Relative paths in it are against the config file. */
export interface CliSide {
	readonly command: readonly string[];
	/** Environment for this side only, over each case's. */
	readonly env?: Readonly<Record<string, string>>;
}

/** An answer to a prompt: sent once `expect` (a regular expression) shows in the output since the last answer, or straight away without one. */
export interface CliAnswer {
	readonly expect?: string;
	readonly send: string;
}

export interface CliCase {
	readonly name: string;
	readonly args: readonly string[];
	/** Added to a clean environment (PATH, a temporary HOME, TZ=UTC, LANG=en_US.UTF-8, NO_COLOR=1). */
	readonly env?: Readonly<Record<string, string>>;
	/** Text written to stdin, or answers to prompts in order; stdin closes after the last. */
	readonly stdin?: string | readonly CliAnswer[];
	/** Files in the working directory before the run, by relative path. */
	readonly files?: Readonly<Record<string, string>>;
	readonly timeoutMs?: number;
}

export interface CliConfig {
	readonly old: CliSide;
	readonly new: CliSide;
	readonly cases: readonly CliCase[];
	/** Paths left out of the files compared, as prefixes (`node_modules/`) or exact names. */
	readonly ignore?: readonly string[];
	/** Extra normalisations applied to output and file contents, after the built-in ones. */
	readonly replace?: readonly { readonly pattern: string; readonly with: string }[];
	/** `replay` (default) serves recorded responses to fetch and refuses other requests; `live` lets every request through. */
	readonly network?: 'replay' | 'live';
	readonly timeoutMs?: number;
}

export interface CliRun {
	readonly exit: number | null;
	readonly signal?: string;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
	/** Every file in the working directory (and `~/` for the temporary HOME) after the run: normalised text, or a hash for binary and large files. */
	readonly files: Readonly<Record<string, string>>;
	/** `METHOD url` of each request, in the order made, normalised like output. */
	readonly network: readonly string[];
	/** A prompt the run waited for and never saw. */
	readonly stuck?: string;
	readonly timedOut?: boolean;
	readonly ms: number;
}

export interface CliFailure {
	readonly case: string;
	readonly check: 'exit code' | 'stdout' | 'stderr' | 'files' | 'network' | 'prompt';
	readonly expected: string;
	readonly actual: string;
	readonly hint: string;
}

export interface CliCaseResult {
	readonly name: string;
	readonly ok: boolean;
	readonly failures: readonly CliFailure[];
	readonly old: readonly CliRun[];
	readonly new: CliRun;
}

export interface CliReport {
	readonly version: 1;
	readonly generatedAt: string;
	readonly ok: boolean;
	readonly cases: readonly CliCaseResult[];
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)/g;
const DURATION = /\b\d+(?:\.\d+)?\s?(?:ms|s|sec|secs|seconds?|m|min|minutes?)\b/g;
const VERSION = /(?<![\d.])v?\d+\.\d+\.\d+(?!\.\d)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\b/g;
const ISO_TIME = /\b\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:?\d\d)?\b/g;
const MAX_TEXT_FILE = 512 * 1024;

export interface Normaliser {
	readonly text: (value: string) => string;
	/** Requests keep their versions and durations: a different package version asked for is a different request. */
	readonly request: (value: string) => string;
}

/** Output and file contents with what differs between any two runs taken out: the run's directories, colours, durations, versions and timestamps. */
export function normaliser(dirs: { readonly cwd: string; readonly home: string; readonly tmp: string }, replace: CliConfig['replace'] = []): Normaliser {
	const paths = [
		[dirs.cwd, '<cwd>'],
		[dirs.home, '<home>'],
		[dirs.tmp, '<tmp>'],
	].sort((a, b) => b[0]!.length - a[0]!.length) as [string, string][];
	const extra = replace.map((r) => [new RegExp(r.pattern, 'g'), r.with] as const);
	const dirsOut = (value: string) => {
		let out = value;
		for (const [path, name] of paths) out = out.split(path).join(name).split(path.split(sep).join('/')).join(name);
		return out;
	};
	const custom = (value: string) => extra.reduce((out, [re, to]) => out.replace(re, to), value);
	return {
		text: (value) => custom(dirsOut(value.replace(/\r\n?/g, '\n').replace(ANSI, '')).replace(ISO_TIME, '<time>').replace(VERSION, '<version>').replace(DURATION, '<duration>')),
		request: (value) => custom(dirsOut(value).replace(ISO_TIME, '<time>')),
	};
}

const lines = (text: string) => {
	const out = text.split('\n').map((l) => l.replace(/\s+$/, ''));
	while (out.length && !out.at(-1)) out.pop();
	return out;
};

function resolveCommand(side: CliSide, base: string): string[] {
	return side.command.map((part, i) => (/^\.\.?[/\\]/.test(part) || (i > 0 && !isAbsolute(part) && /[/\\]/.test(part) && !part.startsWith('-')) ? resolve(base, part) : part));
}

async function tree(root: string, ignore: readonly string[], prefix: string, norm: Normaliser): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const visit = async (dir: string) => {
		for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const path = join(dir, entry.name);
			const rel = relative(root, path).split(sep).join('/');
			if (ignore.some((i) => rel === i.replace(/\/$/, '') || (i.endsWith('/') && rel.startsWith(i)))) continue;
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile()) {
				const bytes = await readFile(path);
				const text = bytes.length <= MAX_TEXT_FILE ? bytes.toString('utf8') : undefined;
				out[`${prefix}${rel}`] = text !== undefined && !text.includes('\uFFFD') && !text.includes('\u0000') ? norm.text(text) : `sha256:${createHash('sha256').update(bytes).digest('hex')} (${bytes.length} bytes)`;
			}
		}
	};
	await visit(root);
	return out;
}

export interface RunOptions {
	/** Directory relative command paths are resolved against: the config file's. */
	readonly base: string;
	readonly fixtures?: string;
	readonly network?: 'replay' | 'live' | 'record';
	readonly ignore?: readonly string[];
	readonly replace?: CliConfig['replace'];
	readonly timeoutMs?: number;
}

const DEFAULT_IGNORE = ['node_modules/', '.git/', '.npm/', '.cache/', '.markless-migrate-network.jsonl'];

/** Runs one case on one side in fresh temporary directories and collects what the tool did. */
export async function runCase(side: CliSide, c: CliCase, options: RunOptions): Promise<CliRun> {
	const tmp = await realpath(await mkdtemp(join(tmpdir(), 'mm-cli-')));
	const cwd = join(tmp, 'work');
	const home = join(tmp, 'home');
	await mkdir(cwd, { recursive: true });
	await mkdir(home, { recursive: true });
	const log = join(tmp, 'network.jsonl');
	for (const [path, text] of Object.entries(c.files ?? {})) {
		await mkdir(dirname(join(cwd, path)), { recursive: true });
		await writeFile(join(cwd, path), text);
	}
	const norm = normaliser({ cwd, home, tmp }, options.replace);
	const [command, ...args] = [...resolveCommand(side, options.base), ...c.args];
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? '',
		HOME: home,
		USERPROFILE: home,
		TMPDIR: join(tmp, 'tmp'),
		TZ: 'UTC',
		LANG: 'en_US.UTF-8',
		NO_COLOR: '1',
		FORCE_COLOR: '0',
		MARKLESS_MIGRATE_CLI_LOG: log,
		MARKLESS_MIGRATE_CLI_NETWORK: options.network ?? 'replay',
		...(options.fixtures ? { MARKLESS_MIGRATE_CLI_FIXTURES: options.fixtures } : {}),
		...c.env,
		...side.env,
	};
	await mkdir(env.TMPDIR!, { recursive: true });
	env.NODE_OPTIONS = `--import=${PRELOAD.href}${c.env?.NODE_OPTIONS ? ` ${c.env.NODE_OPTIONS}` : ''}`;
	const started = Date.now();
	const child = spawn(command!, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
	let stdout = '';
	let stderr = '';
	let seen = '';
	let stuck: string | undefined;
	const answers = typeof c.stdin === 'string' ? [{ send: c.stdin }] : [...(c.stdin ?? [])];
	let waiting: (() => void) | undefined;
	const onOutput = (chunk: Buffer, into: 'out' | 'err') => {
		const text = chunk.toString('utf8');
		if (into === 'out') stdout += text;
		else stderr += text;
		seen += text.replace(ANSI, '');
		waiting?.();
	};
	child.stdout.on('data', (chunk: Buffer) => onOutput(chunk, 'out'));
	child.stderr.on('data', (chunk: Buffer) => onOutput(chunk, 'err'));
	child.stdin.on('error', () => {});
	const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => child.on('close', (code, signal) => done({ code, signal })));
	let ended = false;
	exited.then(() => {
		ended = true;
		waiting?.();
	});
	const timeoutMs = c.timeoutMs ?? options.timeoutMs ?? 30_000;
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill('SIGKILL');
	}, timeoutMs);
	for (const answer of answers) {
		if (answer.expect) {
			const re = new RegExp(answer.expect);
			while (!re.test(seen) && !ended) await new Promise<void>((done) => (waiting = done));
			waiting = undefined;
			if (!re.test(seen)) {
				stuck = answer.expect;
				break;
			}
		}
		seen = '';
		if (!ended) child.stdin.write(answer.send);
	}
	if (!ended) child.stdin.end();
	const { code, signal } = await exited;
	clearTimeout(timer);
	const ms = Date.now() - started;
	const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];
	const files = { ...(await tree(cwd, ignore, '', norm)), ...(await tree(home, ignore, '~/', norm)) };
	const network = (await readFile(log, 'utf8').catch(() => ''))
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const entry = JSON.parse(line) as { method: string; url: string; body?: string };
			return norm.request(`${entry.method} ${entry.url}${entry.body ? ` ${entry.body}` : ''}`);
		});
	await rm(tmp, { recursive: true, force: true });
	return { exit: code, ...(signal ? { signal } : {}), stdout: lines(norm.text(stdout)), stderr: lines(norm.text(stderr)), files, network, ...(stuck ? { stuck } : {}), ...(timedOut ? { timedOut } : {}), ms };
}

const HINTS = {
	exit: 'Exit with the same code in the same situation: scripts and CI branch on it.',
	stream: 'Print the same text to the same stream. Paths, durations, versions and timestamps are already normalised; anything else that differs is visible to a user or a script parsing it.',
	files: 'Write the same files with the same contents: a project the old tool set up must come out the same from the new one.',
	network: 'Make the same requests (method, URL, body) to the same hosts: a registry, an API or telemetry the old tool calls is part of its behaviour.',
	prompt: 'Ask the same questions in the same order: a recorded answer is sent once its prompt shows.',
};

const show = (list: readonly string[], max = 12) => (list.length ? `${list.slice(0, max).join(' | ')}${list.length > max ? ` (+${list.length - max})` : ''}` : '(nothing)');

function compareLines(name: string, check: 'stdout' | 'stderr' | 'network', olds: readonly (readonly string[])[], next: readonly string[], hint: string): CliFailure | undefined {
	const prep = (l: readonly string[]) => (check === 'network' ? [...l].sort() : l);
	const [first, ...rest] = olds.map(prep);
	const diff = diffLines(lineTemplates(first!, ...rest), prep(next));
	if (!diff.missing.length && !diff.unexpected.length && !diff.changed.length) return undefined;
	const expected = [...diff.changed.map((c) => c.expected), ...diff.missing];
	const actual = [...diff.changed.map((c) => c.actual), ...diff.unexpected];
	return { case: name, check, expected: show(expected), actual: show(actual), hint };
}

/** What differs between the new run and the old runs, where the old runs agree. */
export function compareRuns(name: string, olds: readonly CliRun[], next: CliRun): CliFailure[] {
	const failures: CliFailure[] = [];
	const old = olds[0]!;
	if (next.stuck && !olds.some((o) => o.stuck)) failures.push({ case: name, check: 'prompt', expected: `a prompt matching /${next.stuck}/`, actual: `not shown; the output ended with: ${show(next.stdout.slice(-3))}`, hint: HINTS.prompt });
	if (olds.every((o) => o.exit === old.exit) && next.exit !== old.exit) failures.push({ case: name, check: 'exit code', expected: String(old.exit), actual: `${next.exit}${next.timedOut ? ' (timed out)' : next.signal ? ` (${next.signal})` : ''}`, hint: HINTS.exit });
	for (const stream of ['stdout', 'stderr'] as const) {
		const f = compareLines(name, stream, olds.map((o) => o[stream]), next[stream], HINTS.stream);
		if (f) failures.push(f);
	}
	const paths = (r: CliRun) => Object.keys(r.files).sort();
	const always = paths(old).filter((p) => olds.every((o) => p in o.files));
	const sometimes = new Set(olds.flatMap(paths));
	const missing = always.filter((p) => !(p in next.files));
	const unexpected = paths(next).filter((p) => !sometimes.has(p));
	if (missing.length || unexpected.length) failures.push({ case: name, check: 'files', expected: missing.length ? `also ${show(missing)}` : 'no other files', actual: unexpected.length ? `also ${show(unexpected)}` : `without ${show(missing)}`, hint: HINTS.files });
	for (const path of always.filter((p) => p in next.files)) {
		const diff = diffLines(lineTemplates(lines(old.files[path]!), ...olds.slice(1).map((o) => lines(o.files[path]!))), lines(next.files[path]!));
		if (diff.missing.length || diff.unexpected.length || diff.changed.length) failures.push({ case: name, check: 'files', expected: `${path}: ${show([...diff.changed.map((c) => c.expected), ...diff.missing], 6)}`, actual: `${path}: ${show([...diff.changed.map((c) => c.actual), ...diff.unexpected], 6)}`, hint: HINTS.files });
	}
	const network = compareLines(name, 'network', olds.map((o) => o.network), next.network, HINTS.network);
	if (network) failures.push(network);
	return failures;
}

export interface CliCheckOptions {
	readonly config: CliConfig;
	readonly base: string;
	/** Where each case's recorded responses live: `<dir>/<case>.json`. */
	readonly fixturesDir: string;
	readonly only?: readonly string[];
	/** Run the old tool once against the network first and record what fetch gets, then compare under replay. */
	readonly record?: boolean;
}

export const caseSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'case';

/** Runs every case on the old tool twice and the new tool once, each in fresh directories, and compares them. */
export async function runCliCheck(options: CliCheckOptions): Promise<CliReport> {
	const { config } = options;
	const cases: CliCaseResult[] = [];
	await mkdir(options.fixturesDir, { recursive: true });
	for (const c of config.cases.filter((x) => !options.only?.length || options.only.includes(x.name))) {
		const fixtures = join(options.fixturesDir, `${caseSlug(c.name)}.json`);
		const shared = { base: options.base, fixtures, ignore: config.ignore, replace: config.replace, timeoutMs: config.timeoutMs };
		if (options.record) {
			await rm(fixtures, { force: true });
			await runCase(config.old, c, { ...shared, network: 'record' });
		}
		const network = config.network ?? 'replay';
		const olds = [await runCase(config.old, c, { ...shared, network }), await runCase(config.old, c, { ...shared, network })];
		const next = await runCase(config.new, c, { ...shared, network });
		const failures = compareRuns(c.name, olds, next);
		cases.push({ name: c.name, ok: !failures.length, failures, old: olds, new: next });
	}
	return { version: 1, generatedAt: new Date().toISOString(), ok: cases.every((c) => c.ok), cases };
}

export async function readCliConfig(path: string): Promise<CliConfig> {
	const config = JSON.parse(await readFile(path, 'utf8')) as CliConfig;
	const bad = (why: string): never => {
		throw new Error(`${path}: ${why}`);
	};
	for (const side of ['old', 'new'] as const) if (!Array.isArray(config[side]?.command) || !config[side].command.length) bad(`"${side}.command" must be the tool's argv, for example ["node", "./bin/cli.js"]`);
	if (!Array.isArray(config.cases) || !config.cases.length) bad('"cases" must list at least one case');
	const names = new Set<string>();
	for (const c of config.cases) {
		if (!c.name || !Array.isArray(c.args)) bad('every case needs a "name" and "args"');
		if (names.has(c.name)) bad(`two cases are named "${c.name}"`);
		names.add(c.name);
	}
	return config;
}

export function summarizeCli(report: CliReport): string {
	const lines = [`CLI conformance: ${report.cases.filter((c) => c.ok).length} of ${report.cases.length} cases the same`];
	for (const c of report.cases) {
		lines.push(`  ${c.ok ? 'same' : 'DIFFERS'}  ${c.name}  (exit ${c.old[0]!.exit} -> ${c.new.exit}, ${Object.keys(c.new.files).length} files, ${c.new.network.length} requests)`);
		for (const f of c.failures) lines.push(`    ${f.check}: expected ${f.expected}`, `      actual ${f.actual}`, `      fix: ${f.hint}`);
	}
	return `${lines.join('\n')}\n`;
}
