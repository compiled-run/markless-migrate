import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';

const CI_SERVE = new URL('../deploy/shadcn-ui/ci-serve.sh', import.meta.url).pathname;
const run = promisify(execFile);

// A cloudflare-module build as Nitro writes it: the Worker beside wrangler.json, compatibility_date the build day (newer than
// the pinned local workerd supports), and more asset files than macOS lets one process hold open (10,240).
let dir: string;
let archive: string;
before(async () => {
	dir = mkdtempSync(join(tmpdir(), 'serve-cloudflare-'));
	const output = join(dir, 'build/.output');
	mkdirSync(join(output, 'server'), { recursive: true });
	mkdirSync(join(output, 'public/r'), { recursive: true });
	writeFileSync(join(output, 'server/index.mjs'), "export default { fetch: (r) => new Response('worker ' + new URL(r.url).pathname) };\n");
	writeFileSync(
		join(output, 'server/wrangler.json'),
		JSON.stringify({ compatibility_date: new Date().toISOString().slice(0, 10), main: 'index.mjs', assets: { binding: 'ASSETS', directory: '../public' }, name: 'serve-cloudflare-test', compatibility_flags: ['nodejs_compat'], no_bundle: true, rules: [{ type: 'ESModule', globs: ['**/*.mjs', '**/*.js'] }] }),
	);
	writeFileSync(join(output, 'public/index.html'), '<!doctype html><p>home</p>');
	writeFileSync(join(output, 'public/_headers'), '/r/*\n  x-test-rule: from-headers\n');
	for (let i = 0; i < 10_400; i++) writeFileSync(join(output, `public/r/${i}.json`), `{"i":${i}}`);
	archive = join(dir, 'output.tar.gz');
	await run('tar', ['-czf', archive, '-C', join(dir, 'build'), '.output']);
});
after(() => rmSync(dir, { recursive: true, force: true }));

const freePort = () =>
	new Promise<number>((done) => {
		const s = createServer().listen(0, '127.0.0.1', () => {
			const { port } = s.address() as { port: number };
			s.close(() => done(port));
		});
	});

const serve = async (preset: string) => {
	const temp = mkdtempSync(join(dir, 'runner-'));
	const port = await freePort();
	const started = Date.now();
	const result = await run('bash', [CI_SERVE, 'new', `file://${archive}`], { env: { ...process.env, RUNNER_TEMP: temp, PORT: String(port), PRESET: preset }, timeout: 180_000 }).then(
		(r) => ({ code: 0, out: r.stdout + r.stderr }),
		(e) => ({ code: e.code as number, out: String(e.stdout) + String(e.stderr) }),
	);
	const stop = () => {
		try {
			process.kill(Number(readFileSync(join(temp, 'new-serve.pid'), 'utf8')), 'SIGTERM');
		} catch {}
	};
	return { ...result, origin: `http://127.0.0.1:${port}`, seconds: (Date.now() - started) / 1000, stop };
};

test('a cloudflare-module build with more assets than macOS lets a process hold open, built today, answers on the port asked for', async () => {
	const served = await serve('cloudflare-module');
	try {
		assert.equal(served.code, 0, served.out);
		assert.ok(served.seconds < 60, `ready in ${served.seconds} s`);
		const home = await fetch(`${served.origin}/`);
		assert.equal(await home.text(), '<!doctype html><p>home</p>', 'an asset is served by the ASSETS binding before the Worker');
		const asset = await fetch(`${served.origin}/r/10399.json`);
		assert.equal(await asset.text(), '{"i":10399}');
		assert.equal(asset.headers.get('x-test-rule'), 'from-headers', '_headers applies as on Workers');
		assert.equal(await (await fetch(`${served.origin}/not-a-file`)).text(), 'worker /not-a-file', 'what is not a file runs the Worker');
	} finally {
		served.stop();
	}
});

test('PRESET names the build the check must serve: an archive holding another preset is refused, not served', async () => {
	const served = await serve('vercel');
	served.stop();
	assert.notEqual(served.code, 0);
	assert.match(served.out, /PRESET=vercel, but the archive holds a cloudflare-module build/);
});
