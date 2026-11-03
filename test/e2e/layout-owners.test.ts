// A route explores the same journeys, and gets the same verdict, whichever shard of a site's run it is dealt to: the owner of
// each shared header control comes from one survey of the site (#617), and the merge of the shards gives each route its owner's verdict.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { parseLayoutSurvey, type LayoutSurvey } from '../../src/check/layout-survey.ts';
import { shareLayoutLater } from '../../src/check/report-judge.ts';
import { runCheck, type CheckOptions } from '../../src/check/run.ts';
import type { RouteResult } from '../../src/check/types.ts';

const servers: Server[] = [];
after(() => {
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

// `dead`: the port's Menu button shows nothing, a defect of the shared header every page has.
const header = (dead: boolean) => `<header><button onclick="${dead ? '' : 'this.nextElementSibling.hidden=!this.nextElementSibling.hidden'}">Menu</button><p hidden>Menu open</p></header>`;
const page = (name: string, own: number, dead: boolean) => `<!doctype html><html lang="en"><head><title>${name}</title></head><body>${header(dead)}<main><h1>${name}</h1>${Array.from({ length: own }, (_, i) => `<button onclick="this.textContent='${name} ${i} done'">${name} ${i}</button>`).join('')}</main></body></html>`;
const pages = (dead: boolean): Record<string, string> => ({ '/a': page('A', 1, dead), '/b': page('B', 2, dead), '/c': page('C', 1, dead), '/d': page('D', 2, dead) });
const SITE = Object.keys(pages(false));

function serve(site: Record<string, string>): Promise<string> {
	const server = createServer((req, res) => {
		const body = site[new URL(req.url ?? '/', 'http://x').pathname];
		if (body === undefined) return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title>');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
	});
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

/** What a route explored, and its verdict: each control used or left to its owner, and every finding. */
const verdict = (r: RouteResult) => ({
	journeys: (r.journeys ?? []).map((j) => j.name).sort(),
	elements: (r.coverage?.elements ?? []).map((e) => `${e.signature} ${e.shared ? `shared with ${e.shared}` : e.by ? 'used' : (e.reason ?? '')}`).sort(),
	failures: r.failures.map((f) => `${f.dimension}: ${f.check}`).sort(),
	ok: r.ok,
});

test('each route explores the same journeys and gets the same verdict under two different shard dealings of a site run', async () => {
	const [oldOrigin, newOrigin] = await Promise.all([serve(pages(false)), serve(pages(true))]);
	let survey: LayoutSurvey | undefined;
	await runCheck({ oldOrigin, newOrigin: oldOrigin, routes: SITE, templates: { site: SITE }, writeLayoutSurvey: async (s) => void (survey = parseLayoutSurvey(JSON.stringify(s), 'survey')) });
	assert.deepEqual(survey!.roles[0]!.routes.map((r) => r.route), SITE, 'the survey covers the site in its order');
	const shard = async (routes: readonly string[], extra: Partial<CheckOptions> = {}) => (await runCheck({ oldOrigin, newOrigin, routes, templates: { site: SITE }, layoutSurvey: survey!, ...extra })).routes;
	const merged = async (dealing: readonly (readonly string[])[]) => Object.fromEntries(shareLayoutLater((await Promise.all(dealing.map((routes) => shard(routes)))).flat()).map((r) => [r.route, verdict(r)]));

	const dealtInTurn = await merged([['/a', '/c'], ['/b', '/d']]);
	const packed = await merged([['/d', '/a'], ['/c', '/b']]);
	const alone = await merged([['/b'], ['/c'], ['/a', '/d']]);
	assert.deepEqual(packed, dealtInTurn);
	assert.deepEqual(alone, dealtInTurn);
	assert.ok(dealtInTurn['/a']!.failures.some((f) => /^behaviour: click button "Menu"/.test(f)), JSON.stringify(dealtInTurn['/a']));
	for (const route of ['/b', '/c', '/d']) {
		assert.ok(dealtInTurn[route]!.elements.includes('header|button|Menu|0 shared with /a'), `${route} leaves the header to the site's first page`);
		assert.ok(dealtInTurn[route]!.failures.some((f) => f.endsWith(', in the layout shared with /a')) && !dealtInTurn[route]!.ok, `${route} carries the dead Menu from /a's shard`);
	}

	await assert.rejects(shard(['/a'], { layoutSurvey: { ...survey!, roles: [{ role: null, routes: survey!.roles[0]!.routes.slice(1) }] } }), /does not cover 1 route/);
	const missing = shareLayoutLater(await shard(['/b']));
	assert.ok(missing[0]!.failures.some((f) => f.check === 'not exercised: button "Menu", shared with /a'), 'an owner no shard checked leaves the control not exercised');
});
