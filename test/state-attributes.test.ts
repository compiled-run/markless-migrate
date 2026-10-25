import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { runCheck } from '../src/check/run.ts';
import { VIEWPORTS, type Report } from '../src/check/types.ts';

// A trigger whose only answer is the state attribute a library sets for its styles: no ARIA, nothing drawn differently.
const page = (answers: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>State</title></head><body><main><h1>State</h1><button id="t" type="button" data-state="closed">Details</button>${answers ? `<script>t.onclick = () => { t.dataset.state = t.dataset.state === 'open' ? 'closed' : 'open'; };</script>` : ''}</main></body></html>`;

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

function serve(body: string): Promise<string> {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body));
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

const check = async (old: string, next: string): Promise<Report> => runCheck({ oldOrigin: await serve(old), newOrigin: await serve(next), routes: ['/'], viewports: [VIEWPORTS[0]!], browser, concurrency: 1, journeys: { budgetMs: 60_000 } });

test("a step's state attributes (data-state, data-highlighted, data-pressed...) are part of how it answers: a port that leaves them as they were is red", async () => {
	const report = await check(page(true), page(false));
	const failures = report.routes[0]!.failures.filter((f) => !f.accepted && f.check.startsWith('click button "Details"'));
	assert.ok(failures.length, JSON.stringify(report.routes[0]!.failures.map((f) => f.check)));
	assert.match(failures[0]!.expected, /button "Details" data-state: closed → open/);
	const same = await check(page(true), page(true));
	assert.deepEqual(same.routes[0]!.failures.filter((f) => !f.accepted).map((f) => `${f.check}: ${f.actual}`), []);
});
