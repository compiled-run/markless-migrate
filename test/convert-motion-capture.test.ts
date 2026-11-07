import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import ts from 'typescript';
import { capturePage } from '../src/convert/capture.ts';

// A hero that moves for most visitors and holds still for one who asks for reduced motion, decided by the page's own script.
const PAGE = '<!doctype html><html lang="en"><head><title>Hero</title></head><body><main><h1>Launch</h1><p id="hero"></p></main><script>document.getElementById("hero").textContent = matchMedia("(prefers-reduced-motion: reduce)").matches ? "Still hero" : "Moving hero";</script></body></html>';

function serve(html: string): Promise<{ server: Server; origin: string }> {
	return new Promise((done) => {
		const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
		server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
	});
}

test('convert captures the page with motion allowed, and records the reduced-motion page beside it without writing the port from it', { timeout: 120_000 }, async () => {
	const { server, origin } = await serve(PAGE);
	const dir = await mkdtemp(join(tmpdir(), 'mm-motion-capture-'));
	const browser = await chromium.launch();
	try {
		const captured = await capturePage(browser, origin, '/', dir, [{ name: 'desktop', width: 1280, height: 800, isMobile: false }]);
		assert.match(captured.settled.desktop!, /<p id="hero">Moving hero<\/p>/);
		assert.equal(captured.motion, 'no-preference');
		assert.match(captured.reducedMotion?.desktop ?? '', /<p id="hero">Still hero<\/p>/);
		// A capture made under another motion preference is not read back as this one.
		const file = join(dir, (await readdir(dir))[0]!);
		const stale = { ...JSON.parse(await readFile(file, 'utf8')), motion: undefined, settled: { desktop: '<p>Still hero</p>' } };
		await import('node:fs/promises').then((fs) => fs.writeFile(file, JSON.stringify(stale)));
		assert.match((await capturePage(browser, origin, '/', dir, [{ name: 'desktop', width: 1280, height: 800, isMobile: false }])).settled.desktop!, /<p id="hero">Moving hero<\/p>/);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test('a page whose scripts never ask for the motion preference is captured once: a reduced-motion visitor sees the same document', { timeout: 120_000 }, async () => {
	const { server, origin } = await serve('<!doctype html><html lang="en"><head><title>Plain</title></head><body><main><h1>Plain</h1></main></body></html>');
	const dir = await mkdtemp(join(tmpdir(), 'mm-motion-capture-'));
	const browser = await chromium.launch();
	try {
		const captured = await capturePage(browser, origin, '/', dir, [{ name: 'desktop', width: 1280, height: 800, isMobile: false }]);
		assert.equal(captured.motion, 'no-preference');
		assert.equal(captured.reducedMotion, undefined);
	} finally {
		await browser.close();
		server.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test('no convert module opens the old site with the check\'s own reduced-motion environment: every one runs through captureEnv', async () => {
	const dir = new URL('../src/convert/', import.meta.url);
	const offenders: string[] = [];
	for (const name of (await readdir(dir)).filter((n) => n.endsWith('.ts') && n !== 'capture-env.ts')) {
		const source = ts.createSourceFile(name, await readFile(new URL(name, dir), 'utf8'), ts.ScriptTarget.Latest, true);
		const visit = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defaultEnv') offenders.push(`${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	assert.deepEqual(offenders, []);
});
