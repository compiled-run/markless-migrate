import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { LAUNCH } from '../src/check/browser.ts';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type Report } from '../src/check/types.ts';

// A router that updates the address at the click and swaps <main> when the page arrives; `abort` drops a fetch a later click or Back made stale, as routers do.
const router = (abort: boolean) => `<script>
let current;
const show = async (href) => {
	${abort ? 'current?.abort(); const ctrl = current = new AbortController();' : 'const ctrl = { signal: undefined };'}
	try {
		const html = await (await fetch(href, { signal: ctrl.signal })).text();
		document.querySelector('main').innerHTML = new DOMParser().parseFromString(html, 'text/html').querySelector('main').innerHTML;
	} catch {}
};
document.addEventListener('click', (e) => {
	const a = e.target.closest('a[data-nav]'); if (!a) return; e.preventDefault();
	history.pushState(null, '', a.href);
	show(a.href);
});
addEventListener('popstate', () => show(location.href));
</script>`;

const people = (abort: boolean) => (path: string) => {
	const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>People</title></head><body><main>${body}<ul><li><a data-nav href="/ada">Ada</a></li><li><a data-nav href="/grace">Grace</a></li><li><a data-nav href="/">Everyone</a></li></ul></main>${router(abort)}</body></html>`;
	if (path === '/') return page('<h1>Everyone</h1>');
	if (path === '/ada') return page('<h1>Ada Lovelace</h1><p>Wrote the first program</p>');
	if (path === '/grace') return page('<h1>Grace Hopper</h1><p>Wrote the first compiler</p>');
	return undefined;
};

// A search box that asks the server on every key; the one-letter query is answered after the whole word has been typed. `latest` shows only the answer to what the box holds now.
const search = (latest: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Search</title></head><body><main><h1>Search</h1>
<input type="search" aria-label="Search people" id="q"><ul id="hits"></ul></main>
<script>
document.getElementById('q').addEventListener('input', async (e) => {
	const q = e.target.value;
	const hits = await (await fetch('/find?q=' + encodeURIComponent(q))).json();
	if (${latest ? 'q !== document.getElementById("q").value' : 'false'}) return;
	document.getElementById('hits').replaceChildren(...hits.map((h) => Object.assign(document.createElement('li'), { textContent: h })));
});
</script></body></html>`;

const NAMES = ['Ada Lovelace', 'Grace Hopper', 'Linus Torvalds', 'Barbara Liskov', 'Edsger Dijkstra', 'Alan Turing'];

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
		const url = new URL(req.url ?? '/', 'http://x');
		if (url.pathname === '/find') {
			const q = (url.searchParams.get('q') ?? '').toLowerCase();
			const hits = NAMES.filter((n) => n.toLowerCase().includes(q));
			return void setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(hits)), q.length === 1 ? 1500 : 40);
		}
		const page = typeof body === 'string' ? (url.pathname === '/' ? body : undefined) : body(url.pathname);
		if (page === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		const answer = () => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
		// Ada's page is slow to arrive by the router, so a second click lands before it.
		if (req.headers['sec-fetch-dest'] === 'empty') setTimeout(answer, url.pathname === '/ada' ? 700 : 40);
		else answer();
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

async function check(old: string | ((path: string) => string | undefined), next: string | ((path: string) => string | undefined)): Promise<Report> {
	const [a, b] = await Promise.all([serve(old), serve(next)]);
	return runCheck({ oldOrigin: a, newOrigin: b, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1, journeys: { budgetMs: 90_000 } });
}

const failures = (r: Report) => r.routes.flatMap((x) => x.failures).filter((f) => !f.accepted && f.dimension === 'behaviour');
const names = (r: Report) => r.routes.flatMap((x) => x.journeys ?? []).map((j) => j.name);

test('a second link clicked before the first page arrives, and Back pressed before it arrives, must leave the page its address shows: an answer that comes late and wins is red', async () => {
	const report = await check(people(true), people(false));
	const red = failures(report);
	const raced = red.find((f) => /then link "Grace" before the first one's page has arrived/.test(f.check));
	assert.ok(raced, JSON.stringify(red.map((f) => f.check)));
	assert.match(raced.expected, /against a fresh load of where it ended: the same page/);
	assert.match(raced.actual, /shows \+ .*Ada Lovelace/);
	const back = red.find((f) => /then go back before its page has arrived/.test(f.check));
	assert.ok(back, JSON.stringify(red.map((f) => f.check)));
	assert.match(back.actual, /Ada Lovelace/);
});

test('both routers dropping the stale answer compare alike, and the races are among the journeys', async () => {
	const report = await check(people(true), people(true));
	assert.deepEqual(failures(report).filter((f) => /before (its|the first one's) page has arrived/.test(f.check)), []);
	assert.ok(names(report).some((n) => /then link "Grace" before/.test(n)), JSON.stringify(names(report)));
});

test('typing key by key into a search box whose first answer arrives last: the new page showing that stale answer is red, the old one shows the answer to what was typed', async () => {
	const report = await check(search(true), search(false));
	const red = failures(report);
	const typed = red.find((f) => /key by key, 150 ms apart/.test(f.check));
	assert.ok(typed, JSON.stringify({ red: red.map((f) => [f.check, f.expected, f.actual]), journeys: names(report) }, null, 1));
	assert.equal(failures(await check(search(true), search(true))).filter((f) => /key by key/.test(f.check)).length, 0);
});

test('where a race ends is compared with a fresh load of the same app, not with the old app the front door still sends that page to', async () => {
	// The new app's people pages carry a footer the old one lacks; only `/` is switched, so the front door would load /grace from the old app.
	const port = (path: string) => people(true)(path)?.replace('</main>', path === '/' ? '</main>' : '<footer>Ported</footer></main>');
	const [a, b] = await Promise.all([serve(people(true)), serve(port)]);
	const report = await runCheck({ oldOrigin: a, newOrigin: b, routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1, journeys: { budgetMs: 90_000 }, switched: ['/'] });
	assert.deepEqual(failures(report).filter((f) => /against a fresh load/.test(f.actual)).map((f) => [f.check, f.actual]), []);
});

test('Back pressed before a router has added the page to history leaves the app on both sides: the step is compared, not reported as a control that could not be used', async () => {
	// This router adds the history entry when the page arrives, so Back before that leaves the document; only the old page's beforeunload listener slows the leaving.
	const late = (slow: boolean) => (path: string) =>
		people(true)(path)?.replace(
			/<script>[\s\S]*<\/script>/,
			`<script>document.addEventListener('click', async (e) => { const a = e.target.closest('a[data-nav]'); if (!a) return; e.preventDefault(); const html = await (await fetch(a.href)).text(); history.pushState(null, '', a.href); document.querySelector('main').innerHTML = new DOMParser().parseFromString(html, 'text/html').querySelector('main').innerHTML; });${slow ? "addEventListener('beforeunload', () => {});" : ''}</script>`,
		);
	const report = await check(late(true), late(false));
	assert.ok(names(report).includes('click link "Ada", then go back before its page has arrived'), JSON.stringify(names(report)));
	assert.deepEqual(failures(report).filter((f) => /could not be used/.test(f.actual)).map((f) => [f.check, f.actual]), []);
});
