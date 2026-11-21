// The checker's part of a `check --reuse` key: the code the check command runs, from yuku's analyzer over src/cli.ts and its declaration closure.
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from 'yuku/analyzer';
import { ClosureProject, SpanIndex, type Span } from '../closure-reads.ts';
import { ROOT } from '../code-closure.ts';
import { declarationClosure, type ClosureStatement, type DataDir } from '../declaration-closure.ts';
import type { Node, SwitchCase } from 'yuku';
import { partSelectors } from './probe-parts.ts';
import { psiKey } from './psi.ts';

export const CLI = join(ROOT, 'src/cli.ts');
const CHECK = join(ROOT, 'src/check');

/** The bytes of the checker's own top-level files, which its caches read to version themselves. */
async function checkSources(): Promise<string> {
	const hash = createHash('sha256');
	for (const f of (await readdir(CHECK)).filter((f) => /\.(ts|mjs)$/.test(f)).sort()) hash.update(`${f}\0`).update(await readFile(join(CHECK, f)));
	return hash.digest('base64url');
}

/** Code that reads the whole environment (a variable named at run time), and why that changes no reused result. */
export const WHOLE_ENV: Readonly<Record<string, string>> = {
	'src/check/auth.ts interpolate': '--reuse refuses --auth, so no reused result was checked with an auth file',
	'src/check/open.ts openCommand': 'opens the report for a person: no result reads it',
	'src/check/slow-network.ts missingBrowsersError': 'reads CI only to refuse a run missing a browser, and a refused run keeps nothing',
	'src/check/psi.ts psiKey': "whether a PageSpeed key is found: in the key ('psi key')",
};

/** Variables the checker reads that hold a credential CI makes anew for every job: keyed by whether one is set, as every job's checks alike. */
export const CREDENTIALS: Readonly<Record<string, string>> = {
	GH_TOKEN: 'a GitHub token',
	GITHUB_TOKEN: 'a GitHub token',
};

/** Fixed secrets the checker reads: keyed by a hash of the value, as another one can be served other content, and never written out. */
export const SECRETS: Readonly<Record<string, string>> = {
	MARKLESS_MIGRATE_TOKEN: "the token the checked app's requests send",
};

/** Variables that only change what the checker says about itself (what it prints, the provenance it writes), never a result: no part of the key, so a shard that profiles, or runs on another runner, reuses what another kept. */
export const DIAGNOSTICS: Readonly<Record<string, string>> = {
	MARKLESS_MIGRATE_PROFILE: 'prints where each route spent its time',
	MARKLESS_MIGRATE_STACK: "prints an error's stack in place of its message",
	RUNNER_NAME: "names the machine in an original dataset's provenance (src/data/original/run-produce.ts); every CI job runs on another",
};

/** Folders the checker reads as data, not code, and what it reads of each. */
const DATA_DIRS: readonly DataDir[] = [
	{ dir: ROOT, by: join(CHECK, 'probe-parts.ts'), read: async () => JSON.stringify(await partSelectors(ROOT)) },
	{ dir: CHECK, by: join(CHECK, 'cache.ts'), read: checkSources },
	{ dir: CHECK, by: join(CHECK, 'slow-network-cache.ts'), read: checkSources },
];

export interface CheckerVersion {
	readonly version: string;
	readonly units: readonly string[];
	readonly statements: readonly ClosureStatement[];
	readonly env: readonly string[];
	/** What could not be attributed: the version is then new on every call, and no result is reused. */
	readonly problems: readonly string[];
}

const ENDS = new Set(['ReturnStatement', 'ThrowStatement', 'BreakStatement']);
const ends = (statements: readonly Node[]): boolean => {
	const last = statements[statements.length - 1];
	return !!last && (ENDS.has(last.type) || (last.type === 'BlockStatement' && ends(last.body)));
};

/** The statements of cli.ts's `main` the check command runs: those before its command switch, and the `check` case. */
export async function checkCommand(file = CLI): Promise<{ readonly statements: readonly Node[]; readonly names: readonly string[]; readonly runs: readonly Node[]; readonly problems: readonly string[] }> {
	const m = analyze(await readFile(file, 'utf8'), { path: file });
	const declared = m.rootScope.find('main')?.declarations[0];
	const main = declared ? m.parentOf(declared) : null;
	const body = main?.type === 'FunctionDeclaration' ? (main.body?.body ?? []) : [];
	const isCheck = (c: SwitchCase) => c.test?.type === 'Literal' && c.test.value === 'check';
	const at = body.findIndex((st) => st.type === 'SwitchStatement' && st.cases.some(isCheck));
	const command = body[at];
	if (main?.type !== 'FunctionDeclaration' || command?.type !== 'SwitchStatement') return { statements: [], names: [], runs: [], problems: [`${relative(ROOT, file)}: no main with a switch over the commands that has a check case`] };
	const calls = (root: Node, binding: { readonly id: number }) => m.references.some((r) => r.binding?.id === binding.id && r.node.start >= root.start && r.node.end <= root.end);
	const mainBinding = main.id ? m.bindingOf(main.id) : null;
	const statements: Node[] = [...body.slice(0, at), command.discriminant];
	// What runs main when cli.ts loads: kept, with main itself left to the slice of it the check command runs.
	const runs = mainBinding ? m.ast.body.filter((st) => st !== main && calls(st, mainBinding)) : [];
	statements.push(...runs);
	const problems: string[] = [];
	const cases = command.cases;
	for (let i = cases.findIndex(isCheck); i < cases.length; i++) {
		const consequent = cases[i]?.consequent ?? [];
		statements.push(...consequent);
		if (ends(consequent)) break;
		if (i === cases.length - 1) problems.push(`${relative(ROOT, file)}: the check case runs off the end of the switch`);
	}
	const names = new Set<string>();
	for (const ref of m.references) {
		const b = ref.binding;
		if (ref.inTypePosition || !b || b.scope.id !== m.rootScope.id || b.id === mainBinding?.id || !statements.some((st) => ref.node.start >= st.start && ref.node.end <= st.end)) continue;
		names.add(b.name);
	}
	return { statements, names: [...names].sort(), runs, problems };
}

export async function checkerVersion(): Promise<CheckerVersion> {
	const command = await checkCommand();
	const closure = await declarationClosure([{ file: CLI, names: command.names }], { dataDirs: DATA_DIRS, skip: command.runs.map((s) => ({ file: CLI, start: s.start })), opaque: [fileURLToPath(import.meta.url), join(ROOT, 'src/closure-reads.ts')] });
	const spans: Span[] = [...closure.statements, ...command.statements.map((st) => ({ file: CLI, start: st.start, end: st.end }))];
	const found = new ClosureProject(new Set(spans.map((sp) => sp.file))).reads(new SpanIndex(spans), new SpanIndex([]));
	// A whole-environment read is allowed only inside a declaration WHOLE_ENV names, with its reason.
	const allowed = closure.statements.filter((st) => `${relative(ROOT, st.file)} ${st.name}` in WHOLE_ENV);
	const unplaced = found.sites.filter((site) => !allowed.some((st) => st.file === site.file && site.at >= st.start && site.at < st.end)).map((site) => `${relative(ROOT, site.file)}:${site.at} ${site.why}`);
	const problems = [...command.problems, ...closure.unresolved, ...unplaced];
	const hash = createHash('sha256');
	const part = (name: string, value: string | Uint8Array) => {
		const bytes = typeof value === 'string' ? Buffer.from(value) : value;
		hash.update(`${name}\0${bytes.length}\0`).update(bytes);
	};
	const text = await readFile(CLI, 'utf8');
	for (const s of command.statements) part('check command', text.slice(s.start, s.end));
	for (const [name, value] of closure.parts) part(name, value);
	const valueOf = (name: string, value: string | undefined) => (name in CREDENTIALS ? (value ? 'set' : '\0unset') : value === undefined ? '\0unset' : name in SECRETS ? createHash('sha256').update(value).digest('base64url') : value);
	for (const name of [...found.env].sort()) if (!(name in DIAGNOSTICS)) part(`env ${name}`, valueOf(name, process.env[name]));
	// The one whole-environment read that can change a result: whether PageSpeed Insights runs.
	part('psi key', psiKey() ? 'found' : 'none');
	if (problems.length) part('problems', `${problems.join('\n')}\n${randomUUID()}`);
	return { version: hash.digest('base64url').slice(0, 32), units: closure.units, statements: closure.statements, env: [...found.env].sort(), problems: [...new Set(problems)].sort() };
}
