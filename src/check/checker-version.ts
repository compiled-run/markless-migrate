// The checker's version in a `check --reuse` key: the code the check command runs, read from the module graph (yuku's
// analyzer over src/cli.ts, then the declaration closure of what its `check` branch references), the environment variables
// that code reads, and of parts/ only the selectors the widget probes read. Another command's code is not in it.
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from 'yuku/analyzer';
import { ClosureProject, type Span } from '../closure-reads.ts';
import { ROOT } from '../code-closure.ts';
import { declarationClosure, type DataDir } from '../declaration-closure.ts';
import type { N } from '../source/js.ts';
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

/** Variables the checker reads that hold a credential: keyed by whether one is set, as a new token every CI job checks alike. */
export const CREDENTIALS: Readonly<Record<string, string>> = {
	GH_TOKEN: 'a GitHub token',
	GITHUB_TOKEN: 'a GitHub token',
	MARKLESS_MIGRATE_TOKEN: "the token the checked app's requests send",
};

/** Variables that only change what the checker prints about itself, never a result: no part of the key, so a shard that profiles reuses what one that did not kept. */
export const DIAGNOSTICS: Readonly<Record<string, string>> = {
	MARKLESS_MIGRATE_PROFILE: 'prints where each route spent its time',
	MARKLESS_MIGRATE_STACK: "prints an error's stack in place of its message",
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
	readonly env: readonly string[];
	/** What could not be attributed: the version is then new on every call, and no result is reused. */
	readonly problems: readonly string[];
}

const ENDS = new Set(['ReturnStatement', 'ThrowStatement', 'BreakStatement']);
const ends = (statements: readonly N[]): boolean => {
	const last = statements[statements.length - 1];
	return !!last && (ENDS.has(last.type) || (last.type === 'BlockStatement' && ends(last.body as N[])));
};

/** The statements of cli.ts's `main` the check command runs: those before its command switch, and the `check` case. */
export async function checkCommand(file = CLI): Promise<{ readonly statements: readonly N[]; readonly names: readonly string[]; readonly runs: readonly N[]; readonly problems: readonly string[] }> {
	const source = await readFile(file, 'utf8');
	const m = analyze(source, { path: file } as Parameters<typeof analyze>[1]);
	const main = m.rootScope.find('main')?.declarations.map((d) => m.parentOf(d) as N | null).find((n) => n?.type === 'FunctionDeclaration');
	const body = (main?.body?.body ?? []) as N[];
	const at = body.findIndex((s) => s.type === 'SwitchStatement' && (s.cases as N[]).some((c) => c.test?.type === 'Literal' && c.test.value === 'check'));
	if (!main || at < 0) return { statements: [], names: [], runs: [], problems: [`${relative(ROOT, file)}: no main with a switch over the commands that has a check case`] };
	const cases = body[at]!.cases as N[];
	const first = cases.findIndex((c) => c.test?.value === 'check');
	const statements: N[] = [...body.slice(0, at), body[at]!.discriminant];
	// What runs main when cli.ts loads: kept, with main itself left to the slice of it the check command runs.
	const runs = (m.ast.body as unknown as N[]).filter((s) => {
		let calls = false;
		m.walk({ Identifier(_n, ctx) { if (ctx.reference?.binding?.declarations.includes(main.id)) calls = true; } }, s as never);
		return calls && s !== main;
	});
	statements.push(...runs);
	const problems: string[] = [];
	for (let i = first; i < cases.length; i++) {
		statements.push(...(cases[i]!.consequent as N[]));
		if (ends(cases[i]!.consequent as N[])) break;
		if (i === cases.length - 1) problems.push(`${relative(ROOT, file)}: the check case runs off the end of the switch`);
	}
	const names = new Set<string>();
	for (const s of statements)
		m.walk(
			{
				Identifier(_node, ctx) {
					const b = ctx.reference?.binding;
					if (!ctx.reference || ctx.reference.inTypePosition || !b || b.scope.id !== m.rootScope.id || b.declarations.includes(main.id)) return;
					names.add(b.name);
				},
			},
			s as never,
		);
	return { statements, names: [...names].sort(), runs, problems };
}

export async function checkerVersion(): Promise<CheckerVersion> {
	const command = await checkCommand();
	const closure = await declarationClosure([{ file: CLI, names: command.names }], { dataDirs: DATA_DIRS, skip: command.runs.map((s) => ({ file: CLI, start: s.start })), opaque: [fileURLToPath(import.meta.url), join(ROOT, 'src/closure-reads.ts')] });
	const spans: Span[] = [...closure.statements, ...command.statements.map((st) => ({ file: CLI, start: st.start, end: st.end }))];
	const found = new ClosureProject(new Set(spans.map((sp) => sp.file))).reads(spans, []);
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
	for (const name of [...found.env].sort()) if (!(name in DIAGNOSTICS)) part(`env ${name}`, name in CREDENTIALS ? (process.env[name] ? 'set' : '\0unset') : (process.env[name] ?? '\0unset'));
	// The one whole-environment read that can change a result: whether PageSpeed Insights runs.
	part('psi key', psiKey() ? 'found' : 'none');
	if (problems.length) part('problems', `${problems.join('\n')}\n${randomUUID()}`);
	return { version: hash.digest('base64url').slice(0, 32), units: closure.units, env: [...found.env].sort(), problems: [...new Set(problems)].sort() };
}
