import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { gridPage } from '../fixtures/div-grid/page.ts';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS } from '../src/check/types.ts';

function serve(sorts: boolean): Promise<Server> {
	const server = createServer((req, res) => {
		if (req.url !== '/') res.writeHead(404).end();
		else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(gridPage({ sorts }));
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const desktop = VIEWPORTS[0]!;
let browser: Browser;
let old: Server;
let unsorted: Server;
before(async () => {
	browser = await chromium.launch();
	[old, unsorted] = await Promise.all([serve(true), serve(false)]);
});
after(async () => {
	await browser?.close();
	for (const s of [old, unsorted]) s?.close();
});

test('a grid built from divs counts its headers, rows and listening spans as controls, and the journeys sort, filter, select and move through it', async () => {
	const { journeys, elements } = await explore(browser, defaultEnv(origin(old)), '/', desktop);
	const names = elements.map((e) => e.element);
	for (const expected of ['columnheader "Name"', 'columnheader "Size Filter"', 'clickable "Filter"', 'row "gamma 3 Open gamma"', 'row "alpha 12 Open alpha"', 'clickable "Open gamma"', 'spinbutton "Size at least" (after click clickable "Filter")']) assert.ok(names.includes(expected), `${expected} in ${names.join(', ')}`);
	assert.deepEqual(elements.filter((e) => e.signature.startsWith('sampled|')).map((e) => [e.element, e.by]), [['1 more row of the same grid', 'alike: the first 2 are exercised']]);
	assert.ok(!names.includes('row "beta 7 Open beta"'), 'rows past the sample are counted, not listed');
	assert.deepEqual(elements.filter((e) => !e.by), [], 'every control is exercised or covered');
	const run = new Set(journeys.map((j) => j.name));
	for (const expected of ['click columnheader "Name"', 'press Enter on columnheader "Name"', 'press Space on row "gamma 3 Open gamma"', 'press ArrowDown on row "gamma 3 Open gamma"', 'click clickable "Open gamma"', 'click clickable "Filter", then type "42" into spinbutton "Size at least"']) assert.ok(run.has(expected), `${expected} in ${[...run].join('\n')}`);
	const sorted = journeys.find((j) => j.name === 'click columnheader "Name"')!.expected[0]!;
	assert.ok(sorted.moved?.some((line) => /row "gamma 3 Open gamma"/.test(line)), JSON.stringify(sorted));
	const moved = journeys.find((j) => j.name === 'press ArrowDown on row "gamma 3 Open gamma"')!.expected[0]!;
	assert.match(moved.focus, /row "alpha 12 Open alpha"/);
	const filtered = journeys.find((j) => j.name.endsWith('type "42" into spinbutton "Size at least"'))!.expected.at(-1)!;
	assert.ok(filtered.removed.some((line) => /row "gamma 3 Open gamma"/.test(line)), JSON.stringify(filtered));
});

test('a new grid whose headers no longer sort is red on the header journeys', async () => {
	const report = await runCheck({ oldOrigin: origin(old), newOrigin: origin(unsorted), routes: ['/'], viewports: [desktop], browser, responsiveness: undefined });
	const failures = report.routes[0]!.failures;
	assert.ok(failures.some((f) => f.dimension === 'behaviour' && f.check === 'click columnheader "Name"'), failures.map((f) => `${f.dimension} ${f.check}`).join('\n'));
	assert.ok(failures.some((f) => f.dimension === 'a11y' && f.check === 'press Enter on columnheader "Name"'), failures.map((f) => `${f.dimension} ${f.check}`).join('\n'));
});

test('a control whose listener a framework delegates to the root is found by the props the framework keeps on it; a header\'s own label is the header, and one with no text is found by its structure and position', async () => {
	const html = `<!doctype html><html lang="en"><head><title>Delegated</title></head><body><main><span id="go">Load more</span><p id="out"></p>
<div role="grid" aria-label="Files"><div role="row"><div role="columnheader" aria-sort="none"><span id="label">Name</span><span id="grip" style="display:inline-block;width:4px;height:10px"></span></div></div></div></main>
<script>
for (const id of ['label', 'grip']) document.getElementById(id).addEventListener('mousedown', () => {});
const go = document.getElementById('go');
go['__reactProps$abc'] = { onClick: () => { document.getElementById('out').textContent = 'more loaded'; } };
document.addEventListener('click', (e) => { const props = e.target['__reactProps$abc']; if (props?.onClick) props.onClick(e); });
</script></body></html>`;
	const server = createServer((req, res) => (req.url === '/' ? res.writeHead(200, { 'content-type': 'text/html' }).end(html) : res.writeHead(404).end()));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	try {
		const { journeys, elements } = await explore(browser, defaultEnv(origin(server)), '/', desktop);
		assert.deepEqual(elements.map((e) => [e.element, e.by ?? e.reason]), [
			['columnheader "Name"', 'click columnheader "Name"'],
			['clickable "Load more"', 'click clickable "Load more"'],
			['clickable <span> #2 in main>grid>row>columnheader (no name: matched by structure and position)', 'click clickable <span> #2 in main>grid>row>columnheader (no name: matched by structure and position)'],
			['grid keyboard pattern of grid "Files"', 'its grid keyboard journeys'],
		]);
		assert.deepEqual(journeys.find((j) => j.name === 'click clickable "Load more"')!.expected[0]!.added, ['- paragraph: more loaded']);
	} finally {
		server.close();
	}
});
