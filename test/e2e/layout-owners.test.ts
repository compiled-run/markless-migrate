// A route explores the same journeys whichever shard it is dealt to: the owner of each shared header control is chosen
// over the whole site (#617), not over the routes one shard holds.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { parseLayoutSurvey, type LayoutSurvey } from '../../src/check/layout-survey.ts';
import { runCheck, type CheckOptions } from '../../src/check/run.ts';
import type { RouteResult } from '../../src/check/types.ts';

const servers: Server[] = [];
after(() => {
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

const HEADER = `<header><button onclick="this.nextElementSibling.hidden=!this.nextElementSibling.hidden">Menu</button><p hidden>Menu open</p><button onclick="document.body.classList.toggle('dark')">Theme</button></header>`;
const page = (name: string, own: number) => `<!doctype html><html lang="en"><head><title>${name}</title></head><body>${HEADER}<main><h1>${name}</h1>${Array.from({ length: own }, (_, i) => `<button onclick="this.textContent='${name} ${i} done'">${name} ${i}</button>`).join('')}</main></body></html>`;
const PAGES: Record<string, string> = { '/a': page('A', 1), '/b': page('B', 2), '/c': page('C', 1), '/d': page('D', 2) };
const SITE = Object.keys(PAGES);

function serve(): Promise<string> {
	const server = createServer((req, res) => {
		const body = PAGES[new URL(req.url ?? '/', 'http://x').pathname];
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

/** What a route explored: each control, and whether it used it or left it to the route that owns it. */
const explored = (r: RouteResult) => ({
	journeys: (r.journeys ?? []).map((j) => j.name).sort(),
	elements: (r.coverage?.elements ?? []).map((e) => `${e.signature} ${e.shared ? `shared with ${e.shared}` : e.by ? 'used' : (e.reason ?? '')}`).sort(),
});

test('each route explores the same journeys under two different shard dealings', async () => {
	const origin = await serve();
	const shard = async (routes: readonly string[], extra: Partial<CheckOptions> = {}) =>
		(await runCheck({ oldOrigin: origin, newOrigin: origin, routes, templates: { site: SITE }, ...extra })).routes;
	const byRoute = (results: readonly (readonly RouteResult[])[]) => Object.fromEntries(results.flat().map((r) => [r.route, explored(r)]));

	const dealtInTurn = byRoute(await Promise.all([shard(['/a', '/c']), shard(['/b', '/d'])]));
	const packed = byRoute(await Promise.all([shard(['/d', '/a']), shard(['/c', '/b'])]));
	assert.deepEqual(packed, dealtInTurn);
	assert.ok(Object.values(dealtInTurn).some((r) => r.elements.some((e) => e.includes('shared with /a'))), 'some route leaves the header to the first page of the site');

	let survey: LayoutSurvey | undefined;
	await runCheck({ oldOrigin: origin, newOrigin: origin, routes: SITE, templates: { site: SITE }, writeLayoutSurvey: async (s) => void (survey = parseLayoutSurvey(JSON.stringify(s), 'survey')) });
	assert.deepEqual(survey!.roles[0]!.routes.map((r) => r.route), SITE, 'the survey covers the site in its order');
	const fromSurvey = byRoute(await Promise.all([shard(['/b']), shard(['/c', '/a', '/d'])]));
	const read = byRoute(await Promise.all([shard(['/b'], { layoutSurvey: survey! }), shard(['/c', '/a', '/d'], { layoutSurvey: survey! })]));
	assert.deepEqual(fromSurvey, dealtInTurn);
	assert.deepEqual(read, dealtInTurn);
	await assert.rejects(shard(['/a'], { layoutSurvey: { ...survey!, roles: [{ role: null, routes: survey!.roles[0]!.routes.slice(1) }] } }), /does not cover 1 route/);
});
