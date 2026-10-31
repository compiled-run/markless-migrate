// Runs an upstream library's own Playwright suite against its test app twice: as the library renders it (the old side)
// and as markless-migrate converts it onto parts/ (the new side). A test counts only when it passes on the old side
// every time, so a test the adapter cannot run is never a red for the part.
//   node test/upstream/run.ts <library> [--work <dir>] [--markless-local <dir of packed @markless tarballs>] [--repeat <n>]
// Writes <work>/<library>/result.json and prints a summary (to $GITHUB_STEP_SUMMARY too). Exits 1 when an admitted test
// fails that test/upstream/known.json does not list for it, or a listed one passes.
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFile, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LIBRARIES, type Library } from './libraries.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const { values, positionals } = parseArgs({ allowPositionals: true, options: { work: { type: 'string' }, 'markless-local': { type: 'string' }, repeat: { type: 'string' } } });
const chosen = LIBRARIES[positionals[0] ?? ''];
if (!chosen) throw new Error(`usage: run.ts <${Object.keys(LIBRARIES).join('|')}>`);
const lib: Library = chosen;
const WORK = join(values.work ?? join(ROOT, '.upstream'), lib.name);
const REPEAT = Number(values.repeat ?? 2);
const SRC = join(WORK, 'src');
const APP = join(WORK, 'app');
const PNPM = join(WORK, 'pnpm');
const OLD_PORT = 3100;
const NEW_PORT = 3200;
const timings: Record<string, number> = {};

async function sh(command: string, cwd: string, env: Record<string, string> = {}): Promise<void> {
	process.stdout.write(`$ (${cwd}) ${command}\n`);
	const child = spawn('bash', ['-c', command], { cwd, stdio: 'inherit', env: { ...process.env, PATH: `${join(PNPM, 'bin')}:${process.env.PATH}`, ...env } });
	const code = await new Promise<number>((done) => child.on('exit', (c) => done(c ?? 1)));
	if (code !== 0) throw new Error(`${command} exited ${code}`);
}

async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
	const start = Date.now();
	try {
		return await work();
	} finally {
		timings[label] = Math.round((Date.now() - start) / 1000);
	}
}

async function serve(command: string, cwd: string, port: number, env: Record<string, string> = {}): Promise<ChildProcess> {
	const child = spawn('bash', ['-c', `exec ${command}`], { cwd, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, PATH: `${join(PNPM, 'bin')}:${process.env.PATH}`, PORT: String(port), ...env } });
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(`${command} exited ${child.exitCode} before answering`);
		const answered = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.status < 500, () => false);
		if (answered) return child;
		await new Promise((done) => setTimeout(done, 500));
	}
	child.kill();
	throw new Error(`${command} did not answer on :${port} within 120 s`);
}

interface Outcome {
	readonly id: string;
	readonly title: string;
	readonly runs: readonly string[];
	readonly error?: string;
}

interface JsonSpec {
	readonly title: string;
	readonly file: string;
	readonly tests: readonly { readonly projectName: string; readonly results: readonly { readonly status: string; readonly error?: { readonly message?: string } }[] }[];
}
interface JsonSuite {
	readonly title: string;
	readonly specs?: readonly JsonSpec[];
	readonly suites?: readonly JsonSuite[];
}

function outcomes(report: { readonly suites: readonly JsonSuite[] }): Map<string, Outcome> {
	const out = new Map<string, Outcome>();
	const walk = (suite: JsonSuite, path: readonly string[]) => {
		const here = suite.title && !suite.title.endsWith('.ts') ? [...path, suite.title] : path;
		for (const spec of suite.specs ?? []) {
			for (const t of spec.tests) {
				const title = [...here, spec.title].join(' > ');
				const id = `${spec.file} > ${t.projectName} > ${title}`;
				const prior = out.get(id);
				const runs = [...(prior?.runs ?? []), ...t.results.map((r) => r.status)];
				const error = prior?.error ?? t.results.find((r) => r.error?.message)?.error?.message?.split('\n').slice(0, 6).join('\n');
				out.set(id, { id, title: `${spec.file}: ${title} [${t.projectName}]`, runs, ...(error ? { error } : {}) });
			}
		}
		for (const child of suite.suites ?? []) walk(child, here);
	};
	for (const suite of report.suites) walk(suite, []);
	return out;
}

// The checkout's own config, with the origin under test, no web server of its own, no retries and a JSON report.
async function suite(side: 'old' | 'new', origin: string): Promise<Map<string, Outcome>> {
	const report = join(WORK, `${side}.json`);
	const config = join(SRC, 'upstream-run.config.ts');
	await writeFile(config, `import base from './${lib.config.replace(/\.ts$/, '')}';
export default { ...base, webServer: undefined, retries: 0, forbidOnly: false, workers: 1, reporter: [['list'], ['json', { outputFile: ${JSON.stringify(report)} }]], use: { ...base.use, baseURL: ${JSON.stringify(origin)} } };
`);
	await rm(report, { force: true });
	await sh(`npx playwright test -c upstream-run.config.ts --repeat-each ${REPEAT} || true`, SRC, { CI: '' });
	return outcomes(JSON.parse(await readFile(report, 'utf8')));
}

const MANIFEST = {
	name: `${lib.name}-tests-markless`,
	private: true,
	type: 'module',
	scripts: { build: 'vp build' },
	dependencies: { '@markless/core': '0.9.0', '@markless/router': '0.9.0', nitro: '3.0.260903-beta', 'vite-plus': '1.3.0' },
	devDependencies: { vite: 'npm:@voidzero-dev/vite-plus-core@1.3.0' },
	overrides: { vite: '$vite' },
};

async function convert(old: string): Promise<void> {
	await rm(APP, { recursive: true, force: true });
	await mkdir(APP, { recursive: true });
	await writeFile(join(APP, 'package.json'), `${JSON.stringify(MANIFEST, null, '\t')}\n`);
	const cli = `node ${join(ROOT, 'src', 'cli.ts')}`;
	const source = join(SRC, lib.app);
	await sh(`${cli} plan --old ${old} --source ${source}`, APP);
	await sh(`${cli} usage --old ${old} --source ${source}`, APP);
	await sh(`${cli} convert --old ${old} --source ${source} --concurrency 2`, APP);
}

async function linkAndBuild(): Promise<void> {
	const packed = values['markless-local'];
	if (packed) {
		const local = join(APP, '.markless-local');
		await mkdir(local, { recursive: true });
		for (const file of (await readdir(packed)).filter((f) => f.endsWith('.tgz'))) await copyFile(join(packed, file), join(local, file));
		await sh(`node ${join(ROOT, 'examples', 'shadcn-ui-markless', 'scripts', 'link-markless.mjs')} ${APP} ${local}`, APP);
	}
	await sh('npm install --no-audit --no-fund', APP);
	await sh('npx vp build', APP);
}

interface Known {
	readonly [library: string]: Readonly<Record<string, { readonly class: 'part' | 'convert' | 'adapter'; readonly why: string }>>;
}

async function main(): Promise<void> {
	await mkdir(WORK, { recursive: true });
	const servers: ChildProcess[] = [];
	try {
		await timed('fetch and build upstream', async () => {
			if (!(await stat(join(SRC, '.git')).then(() => true, () => false))) await sh(`git clone --quiet --depth 1 --branch ${lib.tag} ${lib.repo} ${SRC}`, WORK);
			await sh(`npm install --no-audit --no-fund --global --prefix ${PNPM} ${lib.pm}`, WORK);
			await sh('pnpm install --frozen-lockfile', SRC);
			for (const command of lib.build) await sh(command, SRC);
			await sh(lib.appBuild, join(SRC, lib.app));
			await sh(`npx playwright install --with-deps ${lib.browsers.join(' ')}`, SRC);
		});
		const oldOrigin = `http://localhost:${OLD_PORT}`;
		servers.push(await serve(lib.appStart(OLD_PORT), join(SRC, lib.app), OLD_PORT));
		const old = await timed('suite on the library', () => suite('old', oldOrigin));
		await timed('convert', () => convert(oldOrigin));
		await timed('build the port', linkAndBuild);
		servers.push(await serve(`node ${join(APP, '.output', 'server', 'index.mjs')}`, APP, NEW_PORT));
		const port = await timed('suite on the port', () => suite('new', `http://localhost:${NEW_PORT}`));
		await report(old, port);
	} finally {
		for (const server of servers) server.kill();
	}
}

async function report(old: Map<string, Outcome>, port: Map<string, Outcome>): Promise<void> {
	const known: Known = JSON.parse(await readFile(join(import.meta.dirname, 'known.json'), 'utf8'));
	const listed = known[lib.name] ?? {};
	const passed = (o: Outcome | undefined) => !!o && o.runs.length > 0 && o.runs.every((r) => r === 'passed');
	const admitted = [...old.values()].filter(passed);
	const refused = [...old.values()].filter((o) => !passed(o));
	const failing = admitted.filter((o) => !passed(port.get(o.id)));
	const unexpected = failing.filter((o) => !listed[o.id]);
	const fixed = admitted.filter((o) => listed[o.id] && passed(port.get(o.id)));
	const stale = Object.keys(listed).filter((id) => !admitted.some((o) => o.id === id));
	const result = {
		library: lib.name,
		tag: lib.tag,
		tests: old.size,
		admitted: admitted.length,
		refused: refused.map((o) => ({ id: o.id, runs: o.runs, error: o.error })),
		passed: admitted.length - failing.length,
		failed: failing.map((o) => ({ id: o.id, runs: port.get(o.id)?.runs ?? ['missing'], error: port.get(o.id)?.error, known: listed[o.id] })),
		unexpected: unexpected.map((o) => o.id),
		fixed: fixed.map((o) => o.id),
		stale,
		seconds: timings,
	};
	await writeFile(join(WORK, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
	const lines = [
		`## ${lib.name} ${lib.tag}: ${result.passed} of ${result.admitted} admitted tests pass on the port`,
		'',
		`${old.size} tests in the suite; ${result.admitted} pass on the library every one of ${REPEAT} runs and are admitted; ${refused.length} are not.`,
		`Seconds: ${Object.entries(timings).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
		'',
		...failing.map((o) => `- ${listed[o.id] ? `known (${listed[o.id]!.class})` : '**new**'}: ${o.title}${port.get(o.id)?.error ? `\n  \`${port.get(o.id)!.error!.split('\n')[0]!.slice(0, 200)}\`` : ''}`),
		...fixed.map((o) => `- **passes now, take it off known.json**: ${o.title}`),
		...stale.map((id) => `- **listed in known.json but not admitted**: ${id}`),
		'',
	];
	process.stdout.write(`${lines.join('\n')}\n`);
	if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
	if (unexpected.length || fixed.length || stale.length) process.exitCode = 1;
}

await main();
