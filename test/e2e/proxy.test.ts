import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { startCms, type Cms } from '../../fixtures/cms/server.ts';
import { buildVite, ROOT, startStatic, type App, type Edit } from './harness.ts';

const SHOP: Edit = {
	file: 'public/serve.json',
	find: '"notFoundStatus": 404',
	replace: '"notFoundStatus": 404, "absoluteRedirects": true, "echoCookies": "/api/cookies", "cookies": { "/api/consent": "consent=granted; Domain={{host}}; Path=/; SameSite=Lax", "/api/cart": "cart=c-42; Domain={{host}}; Path=/; HttpOnly; SameSite=Lax" }',
};

const NEW: Edit[] = [
	SHOP,
	{ file: 'about/index.html', find: '<h1>About the guides</h1>', replace: '<h1>About the guides (Markless)</h1><img src="/new-only.svg" alt="" width="16" height="16" />' },
	{ file: 'members/index.html', find: '<h1>Members</h1>', replace: '<h1>Members (Markless)</h1>' },
	{ file: 'public/new-only.svg', write: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>\n' },
	{ file: 'public/logo-2024.png', remove: true },
];

const CLI = join(ROOT, 'src/cli.ts');

function startCli(args: string[], cwd: string): Promise<{ origin: string; child: ChildProcess }> {
	const child = spawn(process.execPath, [CLI, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
	return new Promise((resolve, reject) => {
		let output = '';
		child.stdout!.on('data', (chunk) => {
			output += chunk;
			if (output.includes('\n')) resolve({ origin: output.split('\n')[0]!.trim(), child });
		});
		child.stderr!.on('data', (chunk) => (output += chunk));
		child.once('exit', (code) => reject(new Error(`proxy exited with ${code}: ${output}`)));
	});
}

function cli(args: string[], cwd: string): Promise<{ status: number; stdout: string; stderr: string }> {
	const child = spawn(process.execPath, [CLI, ...args], { cwd });
	const result = { status: -1, stdout: '', stderr: '' };
	child.stdout.on('data', (chunk) => (result.stdout += chunk));
	child.stderr.on('data', (chunk) => (result.stderr += chunk));
	return new Promise((resolve) => child.on('exit', (code) => resolve({ ...result, status: code ?? -1 })));
}

/** Which app answered each request the page made, by path. */
function sides(page: Page): Map<string, string> {
	const seen = new Map<string, string>();
	page.on('response', (response) => seen.set(`${response.request().method()} ${new URL(response.url()).pathname}`, `${response.headers()['x-markless-migrate-side']} ${response.status()}`));
	return seen;
}

describe('switch and the pass-through proxy', { concurrency: 1 }, () => {
	let browser: Browser;
	let cms: Cms;
	let old: App;
	let next: App;
	let cwd: string;
	let proxy: { origin: string; child: ChildProcess };

	before(async () => {
		browser = await chromium.launch();
		cms = await startCms();
		const [oldDist, newDist] = await Promise.all([buildVite('proxy-old', [SHOP]), buildVite('proxy-new', NEW)]);
		[old, next] = await Promise.all([startStatic(oldDist, cms.origin), startStatic(newDist, cms.origin)]);
		cwd = await realpath(await mkdtemp(join(tmpdir(), 'mm-proxy-')));
		await mkdir(join(cwd, '.migrate'));
		const green = (route: string) => ({ route, ok: true, checkedAt: '2026-10-16T00:00:00.000Z', old: old.origin, new: next.origin, red: [], failures: [] });
		await writeFile(join(cwd, '.migrate', 'results.json'), JSON.stringify({ '/about/': green('/about/'), '/members/': green('/members/'), '/members/ as member': green('/members/') }));
		for (const route of ['/about/', '/members/']) assert.equal((await cli(['switch', route], cwd)).status, 0);
		proxy = await startCli(['proxy', '--old', old.origin, '--new', next.origin, '--port', '0', '--quiet'], cwd);
		proxy.origin = proxy.origin.replace('127.0.0.1', 'localhost');
	});

	after(async () => {
		proxy?.child.kill();
		await Promise.all([old?.stop(), next?.stop()]);
		await cms?.stop();
		await browser?.close();
	});

	test('switched pages come from NEW, the rest from OLD, and each page takes its assets from its own app, falling back to the other', async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const seen = sides(page);
		await page.goto(`${proxy.origin}/`);
		assert.equal(await page.locator('h1').textContent(), 'Walk the coast between the lighthouses');
		assert.equal(seen.get('GET /'), 'old 200');
		assert.equal(seen.get('GET /hero.png'), 'old 200');
		await page.goto(`${proxy.origin}/about/`);
		assert.equal(await page.locator('h1').textContent(), 'About the guides (Markless)');
		assert.equal(seen.get('GET /about/'), 'new 200');
		assert.equal(seen.get('GET /new-only.svg'), 'new 200', 'an asset only NEW has');
		assert.equal(seen.get('GET /logo-2024.png'), 'old 200', 'NEW lacks the logo, so the proxy falls back to OLD');
		assert.ok([...seen].some(([key, side]) => /^GET \/assets\/.+\.js$/.test(key) && side === 'new 200'), [...seen].join('\n'));
		await context.close();
	});

	test("a redirect to OLD's own absolute URL is pointed back at the proxy, landing on a switched page", async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const response = await page.goto(`${proxy.origin}/old-about`);
		assert.equal(page.url(), `${proxy.origin}/about/`);
		assert.equal(response?.headers()['x-markless-migrate-side'], 'new');
		const raw = await fetch(`${proxy.origin}/old-about`, { redirect: 'manual' });
		assert.equal(raw.status, 301);
		assert.equal(raw.headers.get('location'), `${proxy.origin}/about/`);
		await context.close();
	});

	test('a form posted on a switched page goes to NEW; signing in on OLD carries the session cookie to a switched page', async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${proxy.origin}/about/`);
		await page.getByLabel('Email').fill('walker@example.com');
		const [posted] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'Subscribe' }).click()]);
		assert.equal(new URL(posted.url()).pathname, '/api/subscribe');
		assert.equal(posted.headers()['x-markless-migrate-side'], 'new');
		await page.waitForURL(`${proxy.origin}/about/?subscribed=1`);

		await page.goto(`${proxy.origin}/login/`);
		await page.getByLabel('Email').fill('sam@lighthouse.example');
		await page.getByLabel('Password').fill('night-route');
		const [login] = await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'Sign in' }).click()]);
		assert.equal(login.headers()['x-markless-migrate-side'], 'old');
		await page.waitForURL(`${proxy.origin}/members/`);
		assert.equal(await page.locator('h1').textContent(), 'Members (Markless)');
		assert.equal(await page.getByText(/Welcome back/).textContent(), 'Welcome back, Sam.');
		await context.close();
	});

	test('Hydrogen-style cookies: a consent cookie OLD pins to its own domain and a cart cookie NEW sets are both seen by the other app', async () => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const cookies = () => page.evaluate(async () => ((await (await fetch('/api/cookies')).json()) as { cookie: string }).cookie);
		await page.goto(`${proxy.origin}/`);
		await page.evaluate(() => fetch('/api/consent', { method: 'POST' }));
		assert.deepEqual((await context.cookies()).map((c) => [c.name, c.domain]), [['consent', 'localhost']], 'the Domain=127.0.0.1 the app set would make the browser drop it on the proxy host');
		await page.goto(`${proxy.origin}/about/`);
		assert.match(await cookies(), /consent=granted/, 'NEW sees the consent OLD recorded');
		await page.evaluate(() => fetch('/api/cart', { method: 'POST' }));
		await page.goto(`${proxy.origin}/`);
		assert.match(await cookies(), /cart=c-42/, 'OLD sees the cart NEW started');
		await context.close();
	});

	test('switch refuses a route that is not green, --force records why, and config writes vercel.json and Nitro routeRules', async () => {
		const refused = await cli(['switch', '/'], cwd);
		assert.equal(refused.status, 1);
		assert.match(refused.stderr, /not switching \/: it has not been checked yet/);
		const forced = await cli(['switch', '/', '--force', '--by', 'Jo', '--reason', 'launch day'], cwd);
		assert.equal(forced.status, 0, forced.stderr);
		const entry = (JSON.parse(await readFile(join(cwd, '.migrate', 'switched.json'), 'utf8')) as { routes: { route: string; forced?: { reason: string } }[] }).routes.find((r) => r.route === '/');
		assert.deepEqual(entry?.forced, { reason: 'launch day', by: 'Jo' });
		assert.equal((await fetch(`${proxy.origin}/`)).headers.get('x-markless-migrate-side'), 'new', 'the running proxy picks up the switch');
		assert.match((await cli(['unswitch', '/'], cwd)).stdout, /goes to the old app again/);
		assert.equal((await fetch(`${proxy.origin}/`)).headers.get('x-markless-migrate-side'), 'old');
		await writeFile(join(cwd, '.migrate', 'inventory.json'), JSON.stringify({ version: 1, origin: old.origin, routes: [{ route: '/', assets: [{ url: '/hero.png' }, { url: '/logo-2024.png' }] }, { route: '/about/', assets: [] }], locales: [] }));
		const written = await cli(['config', '--old', old.origin, '--new', next.origin, '--vercel', join(cwd, 'vercel.json'), '--nitro', join(cwd, 'nitro.ts')], cwd);
		assert.equal(written.status, 0, written.stderr);
		const vercel = JSON.parse(await readFile(join(cwd, 'vercel.json'), 'utf8')) as { rewrites: { source: string; destination: string }[] };
		assert.deepEqual(vercel.rewrites, [
			{ source: '/about/', destination: `${next.origin}/about/` },
			{ source: '/about', destination: `${next.origin}/about` },
			{ source: '/members/', destination: `${next.origin}/members/` },
			{ source: '/members', destination: `${next.origin}/members` },
			{ source: '/new-only.svg', destination: `${next.origin}/new-only.svg` },
			{ source: '/', destination: `${old.origin}/` },
			{ source: '/:path*/', destination: `${old.origin}/:path*/` },
			{ source: '/:path*', destination: `${old.origin}/:path*` },
		]);
		const nitro = await readFile(join(cwd, 'nitro.ts'), 'utf8');
		assert.match(nitro, new RegExp(`"/": \\{ proxy: "${old.origin}/" \\}`));
		assert.match(nitro, new RegExp(`"/logo-2024.png": \\{ proxy: "${old.origin}/logo-2024.png" \\}`), 'an asset only OLD serves');
		assert.doesNotMatch(nitro, /"\/about\/"|"\/hero.png"/, 'switched routes and assets NEW serves itself stay on NEW');
	});
});
