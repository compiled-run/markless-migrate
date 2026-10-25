import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { LAUNCH } from '../src/check/browser.ts';
import { interimViews, type StepResult, type Views } from '../src/check/journeys.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type Report } from '../src/check/types.ts';

// A router that swaps <main> in place after fetching the next page (answered 400 ms late); `placeholder` puts "Loading invoice…" in first, as a pending UI shown during the fetch.
const invoices = (placeholder: boolean) => {
	const script = `<script>
document.addEventListener('click', async (e) => {
	const a = e.target.closest('a[data-nav]'); if (!a) return; e.preventDefault();
	${placeholder ? "document.querySelector('main').innerHTML = '<p>Loading invoice…</p>';" : ''}
	const html = await (await fetch(a.href)).text();
	document.querySelector('main').innerHTML = new DOMParser().parseFromString(html, 'text/html').querySelector('main').innerHTML;
	history.pushState(null, '', a.href);
});
</script>`;
	const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoices</title></head><body><nav><a data-nav href="/">All</a> <a data-nav href="/invoice">Invoice 3</a></nav><main>${body}</main>${script}</body></html>`;
	return (path: string) => (path === '/invoice' ? page('<h1>Invoice 3</h1><p>Due in March</p>') : path === '/' ? page('<h1>All invoices</h1><p>Ten invoices</p>') : undefined);
};

// A refresh button over a list read from the server (answered 400 ms late); `blank` empties the list while it waits, as a list redrawn from its pending state.
const refresh = (blank: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Team</title></head><body><main><h1>Team</h1>
<ul id="people"><li>Ada</li><li>Grace</li></ul><button id="go" type="button">Refresh</button></main>
<script>
document.getElementById('go').onclick = async () => {
	const list = document.getElementById('people');
	${blank ? "list.replaceChildren();" : ''}
	const names = await (await fetch('/people')).json();
	list.replaceChildren(...names.map((n) => Object.assign(document.createElement('li'), { textContent: n })));
};
</script></body></html>`;

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
});
after(async () => {
	await browser?.close();
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

function serve(body: string | ((path: string) => string | undefined)): Promise<string> {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const late = (send: () => void) => setTimeout(send, 400);
		if (path === '/people') return late(() => res.writeHead(200, { 'content-type': 'application/json' }).end('["Ada","Grace","Linus"]'));
		const page = typeof body === 'string' ? (path === '/' ? body : undefined) : body(path);
		if (page === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		const answer = () => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
		// The page fetched by the router is slow; the document load is not.
		if (req.headers['sec-fetch-dest'] === 'empty') late(answer);
		else answer();
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

async function check(old: string | ((path: string) => string | undefined), next: string | ((path: string) => string | undefined)): Promise<Report> {
	const [a, b] = await Promise.all([serve(old), serve(next)]);
	return runCheck({ oldOrigin: a, newOrigin: b, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1, journeys: { budgetMs: 60_000 } });
}

const inBetween = (r: Report) => r.routes.flatMap((x) => x.failures).filter((f) => !f.accepted && /on screen until the result/.test(`${f.expected} ${f.actual}`));

test('a router that shows a loading placeholder while it fetches the next page, where the old one kept the page until the answer, is red with what was shown and for how long', async () => {
	const red = inBetween(await check(invoices(false), invoices(true)));
	const click = red.find((f) => f.check === 'click link "Invoice 3"');
	assert.ok(click, JSON.stringify(red.map((f) => f.check)));
	assert.match(click.expected, /goes straight to the result/);
	assert.match(click.actual, /shows 1 view in between for \d+ ms \("Loading invoice…"\) before the result/);
	assert.ok(Number(/for (\d+) ms/.exec(click.actual)![1]) >= 300, click.actual);
	assert.ok(red.some((f) => f.check === 'press Enter on link "Invoice 3"' && f.dimension === 'a11y'), 'the keyboard path shows it too');
});

test('a list emptied while its refresh is in flight is red as part of the page gone, and the same placeholder on both sides is not', async () => {
	const red = inBetween(await check(refresh(false), refresh(true)));
	const click = red.find((f) => f.check.startsWith('click button "Refresh"'));
	assert.ok(click, JSON.stringify(red.map((f) => f.check)));
	assert.match(click.actual, /\(part of the page gone\)/);
	assert.equal(inBetween(await check(refresh(true), refresh(true))).length, 0);
	assert.equal(inBetween(await check(invoices(false), invoices(false))).length, 0);
});

test('a placeholder the old page also showed is not a difference, however long each server took; a flicker under a tenth of a second is not one either', () => {
	const step = (views: Views): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: '', navigated: false, reaction: { regions: [], changes: [], views } });
	const loading = { swaps: 2, interimMs: 380, interim: ['Loading…'] };
	assert.equal(interimViews([step(loading), step({ ...loading, interimMs: 410 })], step({ ...loading, interimMs: 450 })), undefined);
	// A Next.js loading.tsx both sides show: 18 ms on one runner, 151 ms on the other is the server's speed, not another view.
	assert.equal(interimViews([step({ swaps: 2, interimMs: 18, interim: ['loading'] })], step({ swaps: 3, interimMs: 151, interim: ['loading'] })), undefined);
	assert.equal(interimViews([step({ swaps: 1, interimMs: 0, interim: [] })], step({ swaps: 2, interimMs: 60, interim: ['…'] })), undefined);
	assert.match(interimViews([step({ swaps: 1, interimMs: 0, interim: [] })], step({ swaps: 3, interimMs: 250, interim: ['⍥', 'Loading'] }))!, /new: shows 2 views in between for 250 ms \("⍥", "Loading"\)/);
});
