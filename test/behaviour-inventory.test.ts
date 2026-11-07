import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { accountSource, type Accounted, type SourceBehaviour } from '../src/check/inventory-compare.ts';
import { runCheck } from '../src/check/run.ts';
import { scanBehaviours } from '../src/source/behaviours.ts';

const PNG8 = (() => {
	const p = new PNG({ width: 8, height: 8 });
	p.data.fill(200);
	return PNG.sync.write(p);
})();

// A card with a :hover rule, a badge the page animates as it loads, a header the page shrinks on scroll and a picture; the port has the card and badge but none of what they do, and no picture.
const page = (full: boolean) => `<!doctype html><html lang="en"><head><title>Inventory</title><style>.card { padding: 8px } ${full ? '.card:hover { background: #eef }' : ''} .tall { height: 2000px }</style></head><body><header id="top">Top</header><main><h1>Inventory</h1><div class="card">A card</div><span id="badge">New</span>${full ? '<img src="/a.png" alt="A" width="8" height="8">' : ''}<div class="tall"></div></main>${full ? '<script>document.getElementById("badge").animate([{ opacity: 0 }, { opacity: 1 }], 300); addEventListener("scroll", () => document.getElementById("top").classList.toggle("small", scrollY > 10));</script>' : ''}</body></html>`;

function serve(html: string): Promise<{ server: Server; origin: string }> {
	return new Promise((done) => {
		const server = createServer((req, res) => (req.url === '/a.png' ? res.writeHead(200, { 'content-type': 'image/png' }).end(PNG8) : res.writeHead(200, { 'content-type': 'text/html' }).end(html)));
		server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
	});
}

test('every :hover rule, animated element, scroll listener and media element of the old page must be on the new page; the rest is red, and the source items no page showed are red until accepted', { timeout: 300_000 }, async () => {
	const [old, next] = await Promise.all([serve(page(true)), serve(page(false))]);
	const browser = await chromium.launch();
	try {
		const source = { nondeterminism: [], writes: [], clients: [], behaviours: [{ kind: 'hover-rule', key: 'css|.card:hover', what: '.card:hover', file: 'app/site.css', line: 1 }, { kind: 'animation', what: 'useAnimate()', file: 'app/carousel.tsx', line: 9 }, { kind: 'scroll', what: 'useScroll()', file: 'app/header.tsx', line: 4 }] satisfies SourceBehaviour[] };
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], viewports: [{ name: 'desktop', width: 1280, height: 800, isMobile: false }], browser, journeys: { maxJourneys: 0, budgetMs: 1 }, behaviours: true, source });
		const route = report.routes[0]!;
		const inventory = route.failures.filter((f) => f.check.startsWith('behaviour inventory: ')).map((f) => f.check);
		for (const want of ['behaviour inventory: :hover rule .card:hover', 'behaviour inventory: animation <span> new', 'behaviour inventory: scroll behaviour a listener on the page scrolling', 'behaviour inventory: media element <img> /a.png']) assert.ok(inventory.includes(want), inventory.join('\n'));
		assert.ok(route.behaviours?.some((b) => b.key === 'css|.card:hover' && b.status === 'missing'));
		// The source's hover rule was seen and not ported; its animation and scroll hook are of kinds the page showed and the port lacks.
		assert.deepEqual(report.inventory?.source.map((s) => s.status), ['missing', 'missing', 'missing']);
		assert.equal(report.inventory?.failures.length, 3);
		assert.equal(report.ok, false);
	} finally {
		await browser.close();
		old.server.close();
		next.server.close();
	}
});

test('accountSource: a keyed item is the live behaviour of its key, a keyless one its kind, and one no page showed is unseen', () => {
	const routes = [{ route: '/', behaviours: [{ kind: 'media', key: 'media|img|/a.png', what: '<img> /a.png', status: 'ported' }, { kind: 'scroll', key: 'scroll|window', what: 'a listener', status: 'ported' }] satisfies Accounted[] }];
	const items: SourceBehaviour[] = [
		{ kind: 'media', key: 'media|img|/a.png', what: '<img> /a.png', file: 'a.tsx', line: 1 },
		{ kind: 'scroll', what: 'useScroll()', file: 'b.tsx', line: 2 },
		{ kind: 'animation', what: 'useAnimate()', file: 'c.tsx', line: 3 },
	];
	const { items: out, failures } = accountSource(items, routes);
	assert.deepEqual(out.map((i) => i.status), ['ported', 'ported', 'unseen']);
	assert.deepEqual(failures.map((f) => f.check), ['behaviour inventory (source): animation useAnimate() at c.tsx:3']);
});

test('scanBehaviours reads handlers, framer-motion components, scroll hooks, :hover rules and media from the source, keyed as a live page shows them', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-behaviours-'));
	try {
		await mkdir(join(dir, 'app'), { recursive: true });
		await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '19.0.0', 'framer-motion': '11.0.0' } }));
		await writeFile(join(dir, 'app', 'hero.tsx'), `import { motion, useScroll } from 'framer-motion';\nexport default function Hero() {\n\tconst { scrollY } = useScroll();\n\treturn <section>\n\t\t<motion.h1 animate={{ opacity: 1 }}>Ship faster</motion.h1>\n\t\t<button onClick={() => alert('hi')}>Say hi</button>\n\t\t<img src="/hero.png" alt="" />\n\t</section>;\n}\n`);
		await writeFile(join(dir, 'app', 'site.css'), '.cta:hover { color: red }\n.field:focus-visible { outline: 2px solid }\n');
		const found = await scanBehaviours(dir);
		const keys = found.map((b) => `${b.kind} ${b.key ?? '-'} ${b.file}:${b.line}`);
		for (const want of ['animation animation|h1|ship faster app/hero.tsx:5', 'scroll - app/hero.tsx:3', 'handler handler|say hi app/hero.tsx:6', 'media media|img|/hero.png app/hero.tsx:7', 'hover-rule css|.cta:hover app/site.css:1', 'focus-rule css|.field:focus-visible app/site.css:2']) assert.ok(keys.includes(want), keys.join('\n'));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
