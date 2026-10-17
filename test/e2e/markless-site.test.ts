import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { startCms, type Cms } from '../../fixtures/cms/server.ts';
import { runCheck, writeReport } from '../../src/check/run.ts';
import { summarize } from '../../src/check/summary.ts';
import { buildVite, ROOT, startStatic, type App } from './harness.ts';

const VITE = join(ROOT, 'fixtures/vite-site');

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

// A copy of the Markless port with one edit, built with the published @markless packages, served by its Nitro node server.
async function startMarkless(name: string, edit?: { file: string; find: string; replace: string }): Promise<App & { dir: string }> {
	const source = join(ROOT, 'fixtures/markless-site');
	const dir = join(ROOT, '.mutants', `markless-site-${name}`);
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	await cp(source, dir, { recursive: true, filter: (path) => !/\/(node_modules|\.output)(\/|$)/.test(path.slice(source.length)) });
	await symlink(join(source, 'node_modules'), join(dir, 'node_modules'));
	if (edit) {
		const text = await readFile(join(dir, edit.file), 'utf8');
		assert.ok(text.includes(edit.find), `${edit.find} not in ${edit.file}`);
		await writeFile(join(dir, edit.file), text.replace(edit.find, edit.replace));
	}
	await new Promise<void>((resolve, reject) => {
		const child = spawn(join(dir, 'node_modules/.bin/vp'), ['build'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vp build failed:\n${output}`))));
	});
	const at = await freePort();
	const child = spawn(process.execPath, [join(dir, '.output/server/index.mjs')], { cwd: dir, stdio: 'ignore', env: { ...process.env, PORT: String(at), HOST: '127.0.0.1' } });
	const origin = `http://127.0.0.1:${at}`;
	for (const deadline = Date.now() + 30_000; ; ) {
		const up = await fetch(origin).then((r) => r.body?.cancel().then(() => true), () => false);
		if (up) break;
		if (Date.now() > deadline || child.exitCode !== null) throw new Error(`the Markless server did not start (${child.exitCode})`);
		await new Promise((done) => setTimeout(done, 100));
	}
	return { origin, dir, stop: () => new Promise<void>((done) => (child.exitCode !== null ? done() : (child.once('exit', () => done()), child.kill()))) };
}

describe('markless port of the vite site', () => {
	let browser: Browser;
	let cms: Cms;
	let old: App;
	let port: App & { dir: string };

	before(async () => {
		browser = await chromium.launch();
		cms = await startCms();
		[old, port] = await Promise.all([buildVite('for-markless').then((dist) => startStatic(dist, cms.origin)), startMarkless('heading', { file: 'pages/about/index.tsrx', find: '<h1>About the guides</h1>', replace: '<h1>Meet the guides</h1>' })]);
	});

	after(async () => {
		await Promise.all([old?.stop(), port?.stop()]);
		await cms?.stop();
		await browser?.close();
	});

	test('each failing element names the old HTML line and the .tsrx line that renders it now, or the page file that lacks it', async () => {
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: port.origin, routes: ['/about/'], browser, sourceDirs: { old: VITE, new: port.dir } });
		const located = report.routes[0]!.failures.filter((f) => f.where);
		const all = located.map((f) => f.where).join('\n');
		const heading = located.find((f) => f.check === 'accessibility tree' && /heading "About the guides"/.test(f.expected));
		assert.equal(heading?.where, 'old about/index.html:29 renders heading "About the guides"; new pages/about/index.tsrx:3 renders heading "Meet the guides"', summarize(report));
		assert.equal(heading?.new?.how, 'source markup');
		assert.equal(heading?.new?.path, join(port.dir, 'pages/about/index.tsrx'));
		const footer = located.find((f) => f.check === 'visible text' && /^Page rendered at/.test(f.expected));
		assert.equal(footer?.where, `old about/index.html:${await lineOf(join(VITE, 'about/index.html'), '<p>Page rendered at')} renders paragraph "Page rendered at"; new pages/about/index.tsrx:2 doesn't`, all);
		assert.equal(footer?.new?.how, 'markless route', 'the page file comes from the route script Markless renders');
		const submit = located.find((f) => f.dimension === 'behaviour' && /button "Subscribe"/.test(f.check) && !f.check.startsWith('not exercised'));
		assert.match(submit?.where ?? '', /^old about\/index\.html:\d+ renders button "Subscribe"; new pages\/about\/index\.tsrx:9 renders it$/, all);

		assert.ok(report.routes[0]!.newFiles?.includes('pages/about/index.tsrx'), 'the files the route is rendered from, for check --changed');
		const weight = report.routes[0]!.weight.new;
		const preloaded = (await (await fetch(new URL('/about/', port.origin))).text()).match(/<link rel="modulepreload"/g)?.length ?? 0;
		assert.ok(preloaded > 10, 'the Markless page preloads its modules');
		assert.ok(weight.downloaded > 10_000, `modules preloaded but never run are downloaded all the same: ${JSON.stringify(weight)}`);
		assert.ok(weight.executed > 0 && weight.executed < weight.source, JSON.stringify(weight));

		const dir = join(ROOT, '.mutants', 'markless-report');
		await writeReport(report, dir);
		const html = await readFile(join(dir, 'report.html'), 'utf8');
		assert.match(html, new RegExp(`new <a href="vscode://file${join(port.dir, 'pages/about/index.tsrx')}:3:\\d+"[^>]*>pages/about/index\\.tsrx:3</a> renders heading`));
		assert.match(html, new RegExp(`old <a href="vscode://file${VITE}/about/index\\.html:29:\\d+"`));
	});
});

async function lineOf(file: string, text: string): Promise<number> {
	return (await readFile(file, 'utf8')).split('\n').findIndex((line) => line.includes(text)) + 1;
}
