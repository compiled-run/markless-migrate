// Runs an upstream library's own browser suite against its test app twice: as the library renders it (the old side)
// and as markless-migrate converts it onto parts/ (the new side). A test counts only when it passes on the old side
// every time, so a test the adapter cannot run is never a red for the part.
//   node test/upstream/run.ts <library> [--work <dir>] [--markless-local <dir of packed @markless tarballs>] [--repeat <n>]
// Writes <work>/<library>/result.json and prints a summary (to $GITHUB_STEP_SUMMARY too). Exits 1 when an admitted test
// fails that test/upstream/known.json does not list, or a listed one passes (unless its entry says why a pass is a race).
// known.json classes: part (a bug in parts/), convert (the converter), shape (the port's DOM differs where nothing
// visible does), adapter (this harness).
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFile, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { readSource } from '../../src/plan/inventory.ts';
import { LIBRARIES, type Library } from './libraries.ts';
import { addSlots } from './slots.ts';

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
const STORIES_PORT = 9009;
const timings: Record<string, number> = {};

async function sh(command: string, cwd: string, env: Record<string, string> = {}): Promise<void> {
	process.stdout.write(`$ (${cwd}) ${command}\n`);
	const child = spawn('bash', ['-c', command], { cwd, stdio: 'inherit', env: { ...process.env, MARKLESS_MIGRATE_STACK: '1', PATH: `${join(PNPM, 'bin')}:${process.env.PATH}`, ...env } });
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
				const error = prior?.error ?? t.results.find((r) => r.error?.message)?.error?.message?.split('\n').slice(0, 12).join('\n');
				out.set(id, { id, title: `${spec.file}: ${title} [${t.projectName}]`, runs, ...(error ? { error } : {}) });
			}
		}
		for (const child of suite.suites ?? []) walk(child, here);
	};
	for (const suite of report.suites) walk(suite, []);
	return out;
}

// The checkout's own config, with the origin under test, no web server of its own, no retries and a JSON report.
async function suite(side: 'old' | 'new', origin: string, repeat: number): Promise<Map<string, Outcome>> {
	const report = join(WORK, `${side}.json`);
	await rm(report, { force: true });
	const runner = lib.runner;
	if (runner.kind === 'playwright') {
		await writeFile(join(SRC, 'upstream-run.config.ts'), `import base from './${runner.config.replace(/\.ts$/, '')}';
export default { ...base, webServer: undefined, retries: 0, forbidOnly: false, workers: 1, reporter: [['list'], ['json', { outputFile: ${JSON.stringify(report)} }]], use: { ...base.use, baseURL: ${JSON.stringify(origin)} } };
`);
		await sh(`npx playwright test -c upstream-run.config.ts --repeat-each ${repeat} || true`, SRC, { CI: '' });
		return outcomes(JSON.parse(await readFile(report, 'utf8')));
	}
	if (runner.kind === 'shim') await sh(`node ${join(import.meta.dirname, runner.script)} ${SRC} ${origin} ${report} ${repeat}`, SRC);
	else await cypress(runner.specs, origin, report, repeat);
	const out = new Map<string, Outcome>();
	const browser = runner.kind === 'shim' ? 'chromium' : 'electron';
	for (const t of JSON.parse(await readFile(report, 'utf8')) as { file: string; title: string[]; state: string; error?: string }[]) {
		const title = t.title.join(' > ');
		const id = `${t.file} > ${browser} > ${title}`;
		const prior = out.get(id);
		const error = prior?.error ?? t.error?.split('\n').slice(0, 12).join('\n');
		out.set(id, { id, title: `${t.file}: ${title} [${browser}]`, runs: [...(prior?.runs ?? []), t.state], ...(error ? { error } : {}) });
	}
	return out;
}

// Cypress has no repeat: the specs run again, and each run's results are added to the test's.
async function cypress(specs: readonly string[], origin: string, report: string, repeat: number): Promise<void> {
	const spec = specs.map((name) => `cypress/e2e/${name}.cy.ts`).join(',');
	await writeFile(join(SRC, 'upstream-run.cypress.mjs'), `import cypress from 'cypress';
import { writeFileSync } from 'node:fs';
const tests = [];
for (let i = 0; i < ${repeat}; i++) {
	const result = await cypress.run({ spec: ${JSON.stringify(spec)}, config: { baseUrl: ${JSON.stringify(origin)}, retries: 0, video: false, screenshotOnRunFailure: false } });
	if (result.status === 'failed') throw new Error(result.message);
	for (const run of result.runs) for (const t of run.tests) tests.push({ file: run.spec.relative, title: t.title, state: t.state, error: t.displayError ?? undefined });
}
writeFileSync(${JSON.stringify(report)}, JSON.stringify(tests));
`);
	await sh('node upstream-run.cypress.mjs', SRC);
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
	const source = join(SRC, lib.source);
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
	readonly [library: string]: Readonly<Record<string, { readonly class: 'part' | 'convert' | 'shape' | 'adapter'; readonly why: string; readonly racy?: string }>>;
}

// What each converted page logs as it loads: an error here explains a suite that finds nothing working.
async function consoleOf(origin: string): Promise<void> {
	const inventory = JSON.parse(await readFile(join(APP, '.migrate', 'inventory.json'), 'utf8')) as { routes: { route: string }[] };
	const browser = await chromium.launch();
	const out: Record<string, string[]> = {};
	try {
		for (const { route } of inventory.routes.slice(0, 20)) {
			const page = await browser.newPage();
			const lines: string[] = (out[route] = []);
			page.on('console', (m) => m.type() === 'error' && lines.push(m.text()));
			page.on('pageerror', (e) => lines.push(String(e)));
			await page.goto(new URL(route, origin).href, { waitUntil: 'networkidle' }).catch((e: unknown) => lines.push(String(e)));
			lines.push(...(await page.evaluate(() =>
				[...document.querySelectorAll<HTMLElement>('button, [role="combobox"], input, a[href]')].flatMap((el) => {
					const r = el.getBoundingClientRect();
					if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return [];
					const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
					return !top || el.contains(top) || top.contains(el) ? [] : [`covered at load: <${el.tagName.toLowerCase()}> "${el.textContent?.trim().slice(0, 30)}" under ${top.outerHTML.slice(0, 200)}`];
				}),
			)));
			// Texts the page shows twice once its first menu or context menu opens: a query by text then finds both.
			const opener = page.locator('[data-slot="context-menu-trigger"], [aria-haspopup]').first();
			if (await opener.count()) {
				const context = (await opener.getAttribute('data-slot')) === 'context-menu-trigger';
				await opener.click({ button: context ? 'right' : 'left', timeout: 2000 }).catch(() => {});
				await page.waitForTimeout(500);
				lines.push(...(await page.evaluate(() => {
					const seen = new Map<string, Element[]>();
					for (const el of document.body.querySelectorAll('*')) {
						const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent?.trim()).join('');
						if (own) seen.set(own, [...(seen.get(own) ?? []), el]);
					}
					return [...seen].filter(([, els]) => els.length > 1).slice(0, 5).map(([text, els]) => `twice after opening: "${text}" in ${els.map((e) => `${e.closest('[data-mm-layer]')?.getAttribute('data-mm-layer') ?? 'page'}${e.closest('[hidden]') ? ' (hidden)' : ''}`).join(', ')}`);
				})));
			}
			await page.close();
		}
	} finally {
		await browser.close();
	}
	await writeFile(join(WORK, 'console.json'), `${JSON.stringify(out, null, 2)}\n`);
}

async function writeSitemap(origin: string): Promise<void> {
	const source = await readSource(join(SRC, lib.source));
	const pages = source.routes.filter((r) => r.kind === 'page' && !/[[:*]/.test(r.path)).map((r) => r.path);
	await mkdir(join(SRC, lib.sitemap!), { recursive: true });
	await writeFile(join(SRC, lib.sitemap!, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>${new URL(p, origin).href}</loc></url>`).join('')}</urlset>\n`);
}

// The suite's adapter: the stories proxy in front of either side, else the side itself.
async function front(servers: ChildProcess[], origin: string): Promise<string> {
	if (!lib.stories) return origin;
	servers.push(await serve(`node ${join(import.meta.dirname, 'serve.ts')} stories ${origin} ${STORIES_PORT}`, WORK, STORIES_PORT));
	return `http://localhost:${STORIES_PORT}`;
}

async function main(): Promise<void> {
	await mkdir(WORK, { recursive: true });
	const servers: ChildProcess[] = [];
	try {
		await timed('fetch and build upstream', async () => {
			if (!(await stat(join(SRC, '.git')).then(() => true, () => false))) {
				await sh(`git init --quiet ${SRC} && git -C ${SRC} remote add origin ${lib.repo}`, WORK);
				await sh(`git fetch --quiet --depth 1 origin ${lib.ref} && git checkout --quiet FETCH_HEAD`, SRC);
			}
			if (lib.slots) process.stdout.write(`data-slot written in ${await addSlots(join(SRC, lib.slots.dir), lib.slots.roots)} files\n`);
			await sh(`npm install --no-audit --no-fund --global --prefix ${PNPM} ${lib.pm}`, WORK);
			await sh('pnpm install --frozen-lockfile', SRC);
			if (lib.playwright) await sh(`pnpm add --save-dev --workspace-root @playwright/test@${lib.playwright}`, SRC);
			for (const command of lib.build) await sh(command, SRC);
			if (lib.runner.kind === 'playwright') await sh(`npx playwright install --with-deps ${lib.runner.browsers.join(' ')}`, SRC);
		});
		const oldOrigin = `http://localhost:${OLD_PORT}`;
		if (lib.sitemap) await writeSitemap(oldOrigin);
		const library = await serve(lib.serve(OLD_PORT), join(SRC, lib.serveIn), OLD_PORT);
		servers.push(library);
		const old = await timed('suite on the library', async () => suite('old', await front(servers, oldOrigin), REPEAT));
		if (lib.stories) servers.pop()!.kill();
		await timed('convert', () => convert(oldOrigin));
		// Nothing the port asks of the old origin may answer while the suite runs on the port.
		library.kill();
		await timed('build the port', linkAndBuild);
		servers.push(await serve(`node ${join(APP, '.output', 'server', 'index.mjs')}`, APP, NEW_PORT));
		await consoleOf(`http://localhost:${NEW_PORT}`);
		const port = await timed('suite on the port', async () => suite('new', await front(servers, `http://localhost:${NEW_PORT}`), 1));
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
	const fixed = admitted.filter((o) => listed[o.id] && !listed[o.id]!.racy && passed(port.get(o.id)));
	const stale = Object.keys(listed).filter((id) => !admitted.some((o) => o.id === id));
	const result = {
		library: lib.name,
		ref: lib.ref,
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
		`## ${lib.name} ${lib.ref.slice(0, 12)}: ${result.passed} of ${result.admitted} admitted tests pass on the port`,
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
