import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../../src/check/run.ts';
import { summarize } from '../../src/check/summary.ts';
import { ROOT, type App } from './harness.ts';

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
		});
	});
}

/** A copy of a dev fixture, optionally with one edit, served by Vite's dev server. */
async function startDev(fixture: string, name: string, edit?: { file: string; find: string; replace: string }): Promise<App & { dir: string }> {
	const source = join(ROOT, 'fixtures', fixture);
	const dir = join(ROOT, '.mutants', `${fixture}-${name}`);
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	await cp(source, dir, { recursive: true, filter: (path) => !/\/node_modules(\/|$)/.test(path.slice(source.length)) });
	await symlink(join(source, 'node_modules'), join(dir, 'node_modules'));
	if (edit) {
		const text = await readFile(join(dir, edit.file), 'utf8');
		assert.ok(text.includes(edit.find), `${edit.find} not in ${edit.file}`);
		await writeFile(join(dir, edit.file), text.replace(edit.find, edit.replace));
	}
	const port = await freePort();
	const child = spawn(join(dir, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(port), '--strictPort', '--clearScreen', 'false'], { cwd: dir, stdio: 'ignore' });
	const origin = `http://127.0.0.1:${port}`;
	for (const deadline = Date.now() + 30_000; ; ) {
		if (await fetch(origin).then((r) => r.body?.cancel().then(() => r.ok), () => false)) break;
		if (Date.now() > deadline || child.exitCode !== null) throw new Error(`vite dev did not start for ${fixture} (${child.exitCode})`);
		await new Promise((done) => setTimeout(done, 100));
	}
	return { origin, dir, stop: () => new Promise<void>((done) => (child.exitCode !== null ? done() : (child.once('exit', () => done()), child.kill()))) };
}

const HEADING = { find: '<h1>Harbour tours</h1>', replace: '<h1>Boat trips</h1>' };

const CASES = [
	{ fixture: 'react-dev', file: 'src/App.tsx', line: 4, how: /^react owner stack \+ source map$/ },
	{ fixture: 'vue-dev', file: 'src/App.vue', line: 3, how: /^vue$/ },
	{ fixture: 'svelte-dev', file: 'src/App.svelte', line: 2, how: /^svelte$/ },
];

describe('development builds name the old file and line from the framework itself', { concurrency: 3 }, () => {
	let browser: Browser;
	const apps = new Map<string, { old: App & { dir: string }; next: App & { dir: string } }>();

	before(async () => {
		browser = await chromium.launch();
		await Promise.all(
			CASES.map(async (c) => {
				const [old, next] = await Promise.all([startDev(c.fixture, 'old'), startDev(c.fixture, 'heading', { file: c.file, ...HEADING })]);
				apps.set(c.fixture, { old, next });
			}),
		);
	});

	after(async () => {
		await Promise.all([...apps.values()].flatMap((a) => [a.old.stop(), a.next.stop()]));
		await browser?.close();
	});

	for (const c of CASES) {
		test(`${c.fixture}: the changed heading is traced to ${c.file}:${c.line} through the framework's dev hook`, async () => {
			const { old, next } = apps.get(c.fixture)!;
			const report = await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], browser, viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], sourceDirs: { old: old.dir } });
			const heading = report.routes[0]!.failures.find((f) => f.check === 'accessibility tree' && /heading "Harbour tours"/.test(f.expected));
			assert.ok(heading, summarize(report));
			assert.deepEqual([heading.old?.file, heading.old?.line], [c.file, c.line], summarize(report));
			assert.match(heading.old!.how, c.how);
			assert.equal(heading.old?.path, join(old.dir, c.file));
		});
	}
});
