// Runs every repro in a scratch Markless app (the published packages this port uses), in dev and as a production build.
// node repros/run.mjs [--dev-only] [name...]
import { spawn, spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = fileURLToPath(new URL('.', import.meta.url));
const app = join(here, '..');
const scratch = join(tmpdir(), 'react-hn-markless-repros');
const args = process.argv.slice(2);
const devOnly = args.includes('--dev-only');
const only = args.filter((a) => !a.startsWith('--'));
const repros = readdirSync(here).filter(
	(d) => /^\d\d-/.test(d) && (!only.length || only.some((o) => d.startsWith(o))),
);

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const freePort = () =>
	new Promise((done) => {
		const server = createServer().listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => done(port));
		});
	});
const text = (page, selector) =>
	page
		.locator(selector)
		.first()
		.textContent({ timeout: 2000 })
		.catch(() => null);

/** Each repro: what to do on its page, and what a working framework shows. */
const CHECKS = {
	'01-literal-prop': async (page) => ({
		expected: 'apples 3',
		actual: (await wait(600), (await text(page, '.probe'))?.trim()),
	}),
	'02-component-async-twice': async (page, log) => {
		await wait(800);
		const served = log.served.includes('value /02-component-async-twice');
		return {
			expected: 'value in the served HTML, slowValue ran on: server',
			actual: `value ${served ? 'in' : 'not in'} the served HTML, slowValue ran on: ${log.calls.join('+')}`,
		};
	},
	'03-async-prop-graph-node': async (page, log) => ({
		expected: 'no page error',
		actual: (await wait(800), log.errors.join(' | ') || 'no page error'),
	}),
	'04-mutual-recursion': async (page) => {
		await wait(500);
		await page
			.locator('.flip')
			.first()
			.click({ timeout: 2000 })
			.catch(() => {});
		await wait(1500);
		return {
			expected: '3 .inner, first button reads closed',
			actual: `${await page.locator('.inner').count()} .inner, first button reads ${(await text(page, '.flip')) ?? 'missing'}`,
		};
	},
	'05-recursive-async': async (page, log) => {
		await wait(1000);
		await page
			.locator('.toggle')
			.first()
			.click({ timeout: 2000 })
			.catch(() => {});
		await wait(300);
		return {
			expected: '4 .body, first toggle shows [+], no page error',
			actual: `${await page.locator('.body').count()} .body, toggle ${(await text(page, '.toggle')) ?? 'missing'}, errors: ${log.errors.join(' | ') || 'none'}`,
		};
	},
	'06-attach-prop': async (page) => ({
		expected: 'attach read id /06-attach-prop',
		actual: (await wait(600), (await text(page, '.probe'))?.trim()),
	}),
	'07-arm-attach': async (page, log) => {
		await page.click('.toggle');
		await wait(600);
		const focused = await page.evaluate(() => document.activeElement?.className ?? '');
		return {
			expected: '.panel shown and focused',
			actual: `${(await page.locator('.panel').count()) ? '.panel shown' : 'no .panel'}${focused === 'panel' ? ' and focused' : `, focus on "${focused}"`}${log.errors.length ? `, errors: ${log.errors.join(' | ')}` : ''}`,
		};
	},
	'08-async-in-browser-computed': async (page, log) => {
		await wait(500);
		await page.click('.more');
		await wait(500);
		return {
			expected: '3',
			actual: `${(await text(page, '.probe'))?.trim()}${log.errors.length ? `, errors: ${log.errors.join(' | ')}` : ''}`,
		};
	},
	'09-row-branch': async (page) => {
		await page.click('.fill');
		await wait(600);
		return {
			expected: 'row 1 open, row 2 done, row 3 open',
			actual: (await page.locator('.rows li').allTextContents()).join(', ') || 'no rows',
		};
	},
	'10-first-click-propagation': async (page) => {
		await page.click('.inner');
		await wait(600);
		return { expected: 'inner 1 outer 0', actual: (await text(page, '.probe'))?.trim() };
	},
	'12-navigation-leak': async (page) => {
		const cdp = await page.context().newCDPSession(page);
		const loads = async () => {
			const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' });
			const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
				objectId: result.objectId,
			});
			return listeners.filter((l) => l.type === 'load').length;
		};
		await wait(800);
		const before = await loads();
		for (let i = 0; i < 5; i++) {
			await page.click('.next');
			await page.waitForURL(new RegExp(`n=${i + 1}`)).catch(() => {});
			await wait(400);
		}
		return {
			expected: 'window load listeners after 5 in-place navigations: as before',
			actual: `window load listeners after 5 in-place navigations: ${(await loads()) === before ? 'as before' : `${before} -> ${await loads()}`}`,
		};
	},
	'11-row-attach': async (page) => {
		await page.click('.fill');
		await wait(600);
		return {
			expected: '<b>bold</b> | <i>italic</i>',
			actual:
				(
					await page.locator('.row').evaluateAll((rows) => rows.map((r) => r.innerHTML))
				).join(' | ') || 'no rows',
		};
	},
};

function install() {
	if (existsSync(join(scratch, 'node_modules'))) return;
	mkdirSync(scratch, { recursive: true });
	for (const file of ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'markless-router-env.d.ts']) cpSync(join(app, file), join(scratch, file));
	const ci = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: scratch, stdio: 'inherit' });
	if (ci.status) throw new Error('npm ci failed in the scratch app');
}

/** The scratch app holds one repro at a time, so a repro that hangs or crashes its server cannot take the others down. */
function scaffold(name) {
	rmSync(join(scratch, 'pages'), { recursive: true, force: true });
	rmSync(join(scratch, 'repros'), { recursive: true, force: true });
	rmSync(join(scratch, '.output'), { recursive: true, force: true });
	mkdirSync(join(scratch, 'pages'), { recursive: true });
	writeFileSync(join(scratch, 'document.tsrx'), "import type { Children } from '@markless/core';\nimport { Html } from '@markless/router';\n\nexport default function Document({ children }: { readonly children?: Children }) @{\n\t<Html>\n\t\t<head>\n\t\t\t<meta charset=\"utf-8\" />\n\t\t\t<title>repro</title>\n\t\t</head>\n\t\t<body>{children}</body>\n\t</Html>\n}\n");
	cpSync(join(here, name), join(scratch, 'repros', name), { recursive: true });
	rmSync(join(scratch, 'repros', name, 'page.tsrx'));
	const page = readFileSync(join(here, name, 'page.tsrx'), 'utf8').replace(/from '\.\/([^']+)'/g, `from '../repros/${name}/$1'`);
	writeFileSync(join(scratch, 'pages', `${name}.tsrx`), page);
}

function run(command, cmdArgs, timeoutMs) {
	return new Promise((done) => {
		const child = spawn(command, cmdArgs, { cwd: scratch, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		let timedOut = false;
		child.stdout.on('data', (d) => (output += d));
		child.stderr.on('data', (d) => (output += d));
		const timer = setTimeout(() => {
			timedOut = true;
			try {
				process.kill(-child.pid, 'SIGKILL');
			} catch {}
		}, timeoutMs);
		child.on('close', (status) => {
			clearTimeout(timer);
			done({ status: timedOut ? null : status, output, timedOut });
		});
	});
}

async function serve(command, cmdArgs, port) {
	const child = spawn(command, cmdArgs, {
		cwd: scratch,
		detached: true,
		env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const lines = [];
	child.stdout.on('data', (d) => lines.push(String(d)));
	child.stderr.on('data', (d) => lines.push(String(d)));
	for (let i = 0; i < 120; i++) {
		if (
			await fetch(`http://127.0.0.1:${port}/`).then(
				() => true,
				() => false,
			)
		)
			break;
		await wait(500);
	}
	return {
		child,
		lines,
		stop: () => {
			try {
				process.kill(-child.pid, 'SIGTERM');
			} catch {}
		},
	};
}

async function drive(origin, server, mode, names) {
	const browser = await chromium.launch();
	const rows = [];
	try {
		for (const name of names) {
			const page = await browser.newPage();
			const log = { errors: [], calls: [], served: '' };
			page.on('pageerror', (e) => log.errors.push(e.message.slice(0, 120)));
			const before =
				server.lines.join('').match(/slowValue\(.*?\) on the server/g)?.length ?? 0;
			log.served = await fetch(`${origin}/${name}`, {
				signal: AbortSignal.timeout(15_000),
			}).then(
				(r) => r.text(),
				(e) => `fetch failed: ${e.message}`,
			);
			await page
				.goto(`${origin}/${name}`, { timeout: 15_000 })
				.catch((e) => log.errors.push(`load: ${e.message.split('\n')[0]}`));
			const browserCalls = [];
			page.on(
				'console',
				(m) =>
					/slowValue\(.*\) on the browser/.test(m.text()) && browserCalls.push('browser'),
			);
			const onServer = () =>
				(server.lines.join('').match(/slowValue\(.*?\) on the server/g)?.length ?? 0) >
				before;
			log.calls = {
				join: (sep) =>
					[...(onServer() ? ['server'] : []), ...browserCalls.slice(0, 1)].join(sep),
			};
			const result = await CHECKS[name](page, log).catch((e) => ({
				expected: '?',
				actual: `check failed: ${e.message.split('\n')[0]}; served: ${log.served.replace(/\s+/g, ' ').slice(0, 160)}; server: ${server.lines.join('').split('\n').filter(Boolean).slice(-3).join(' / ').slice(0, 300)}`,
			}));
			rows.push({ mode, name, ...result, ok: result.expected === result.actual });
			await page.close();
		}
	} finally {
		await browser.close();
	}
	return rows;
}

install();
const results = [];
for (const name of repros) {
	scaffold(name);
	const devPort = await freePort();
	const dev = await serve('npx', ['vp', 'dev', '--host', '127.0.0.1', '--port', String(devPort), '--strictPort'], devPort);
	try {
		results.push(...(await drive(`http://127.0.0.1:${devPort}`, dev, 'dev', [name])));
	} finally {
		dev.stop();
	}
	if (devOnly) continue;
	const built = await run('npx', ['vp', 'build'], 180_000);
	if (built.status !== 0) {
		const last = built.output.split('\n').filter(Boolean).at(-1)?.trim() ?? 'none';
		results.push({ mode: 'production', name, expected: 'builds', actual: built.timedOut ? `the production build did not finish in 180 s (last output: ${last})` : built.output.split('\n').filter((l) => /MARKLESS_|Error/.test(l)).slice(0, 3).join(' | '), ok: false });
		continue;
	}
	const prodPort = await freePort();
	const prod = await serve('node', ['.output/server/index.mjs'], prodPort);
	try {
		results.push(...(await drive(`http://127.0.0.1:${prodPort}`, prod, 'production', [name])));
	} finally {
		prod.stop();
	}
}
for (const r of results)
	console.log(
		`${r.ok ? 'works' : 'BUG  '}  ${r.mode.padEnd(10)} ${r.name.padEnd(30)} expected: ${r.expected}\n${' '.repeat(48)}actual:   ${r.actual}`,
	);
writeFileSync(join(here, 'results.json'), `${JSON.stringify(results, null, '\t')}\n`);
