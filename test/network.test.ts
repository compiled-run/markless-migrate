import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { frameworkTransport } from '../src/check/browser.ts';
import { shownText } from '../src/check/capture.ts';
import { recordable } from '../src/check/data.ts';
import { bodyShape, compareNetwork, contractLines, normalizeUrl, usedFields, type NetworkCapture, type NetworkRecord } from '../src/check/network.ts';

const OLD = 'http://127.0.0.1:3000';
const NEW = 'http://127.0.0.1:5173';
const news = (query = 'fields=title,summary&locale=en'): NetworkRecord => ({ side: 'server', method: 'GET', url: `https://cms.example/news?${query}`, status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ title: 'Winter timetable', summary: 'Walks start later.' }] }) });
const hours = (origin = OLD): NetworkRecord => ({ side: 'browser', method: 'GET', url: `${origin}/api/hours`, status: 200, contentType: 'application/json', body: '{"today":"Open 9 to 5"}' });
const capture = (records: NetworkRecord[], shown = 'Winter timetable\nWalks start later.\nOpen 9 to 5'): NetworkCapture => ({ records, server: true, shown });

test('URLs normalise the app origin, ids, timestamps and cache-busters, and sort the query', () => {
	assert.equal(normalizeUrl('http://localhost:3000/api/posts/42?b=2&a=1&_=1739912345678', OLD), '{self}/api/posts/{id}?_={bust}&a=1&b=2');
	assert.equal(normalizeUrl('https://cms.example/entries/3f2b8c1e-9a7d-4e2b-8f1a-2b3c4d5e6f70?since=1739912345', OLD), 'cms.example/entries/{uuid}?since={time}');
	assert.equal(normalizeUrl('https://api.simplesvg.com/lucide.json?icons=languages,search,x', OLD), normalizeUrl('https://api.iconify.design/lucide.json?icons=languages,search,x', OLD), "Iconify's fallback host is the same service");
	assert.notEqual(normalizeUrl('https://api.simplesvg.com/lucide.json?icons=search', OLD), normalizeUrl('https://api.iconify.design/lucide.json?icons=x', OLD), 'which icons are asked for is still compared');
	assert.equal(normalizeUrl('https://cms.example/news?limit=2', OLD), 'cms.example/news?limit=2', 'small numbers are kept: a changed page size is a difference');
});

test('body shapes keep field names and types, and GraphQL queries as text', () => {
	assert.equal(bodyShape('email=a%40b.c&n=2', 'application/x-www-form-urlencoded'), ' {email: string, n: number}');
	assert.equal(bodyShape('{"query":"query {\\n  posts { title summary }\\n}","variables":{"first":2}}', 'application/json'), ' {"query":"query { posts { title summary } }","variables":{"first":"number"}}');
});

test('a GraphQL query is compared by what it asks for: Apollo\'s __typename and how a client prints it are not a difference', () => {
	const apollo = JSON.stringify({ operationName: 'HideNewsItem', variables: { id: 1 }, query: 'mutation HideNewsItem($id: Int!) {\n  hideNewsItem(id: $id) {\n    id\n    hidden\n    __typename\n  }\n}\n' });
	const port = JSON.stringify({ operationName: 'HideNewsItem', variables: { id: 2 }, query: '\n  mutation HideNewsItem($id: Int!) {\n    hideNewsItem(id: $id) {\n      id\n      hidden\n    }\n  }\n' });
	assert.equal(bodyShape(apollo, 'application/json'), bodyShape(port, 'application/json'));
	const other = JSON.stringify({ operationName: 'HideNewsItem', variables: { id: 2 }, query: 'mutation HideNewsItem($id: Int!) { hideNewsItem(id: $id) { id } }' });
	assert.notEqual(bodyShape(apollo, 'application/json'), bodyShape(other, 'application/json'), 'a field left out is still a difference');
	const withFragment = (typename: string) => JSON.stringify({ query: `query Feed { feed { ...Story ${typename} } } fragment Story on NewsItem { id title ${typename} }` });
	assert.equal(bodyShape(withFragment('__typename'), 'application/json'), bodyShape(withFragment(''), 'application/json'), 'inside fragments too');
	const aliased = JSON.stringify({ query: 'query { __typename feed { kind: __typename id } }' });
	assert.match(bodyShape(aliased, 'application/json'), /kind: __typename/, 'a __typename the page asks for by alias, or at the root, is its own');
});

test('the fields a page uses are the response values it shows in text or attributes', () => {
	const used = usedFields(news(), 'Winter timetable');
	assert.deepEqual([...used], ['items[].title']);
	assert.deepEqual([...usedFields({ ...hours(), body: '{"count":12,"ok":"yes"}' }, '12 yes')], [], 'short values and plain numbers match by chance, so they are not counted');
});

test('a script or resource hint URL built from a response is code loading, not a field the page shows (VitePress prefetching hashmap.json chunks)', async () => {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.setContent('<link rel="prefetch" href="/assets/guide_index.md.Bq2sXk9P.lean.js"><link rel="modulepreload" href="/assets/index.md.Dt7mR1aZ.js"><script src="/assets/plugins_index.md.Cz4wLp0Q.js"></script><a href="/team.md.Hs8vNn2E">Team</a>');
		const body = JSON.stringify({ 'guide_index.md': 'Bq2sXk9P', 'index.md': 'Dt7mR1aZ', 'plugins_index.md': 'Cz4wLp0Q', 'team.md': 'Hs8vNn2E' });
		const used = usedFields({ ...hours(), url: `${OLD}/hashmap.json`, body }, await page.evaluate(shownText));
		assert.deepEqual([...used], ['team.md'], 'a link the reader follows still shows the field');
	} finally {
		await browser.close();
	}
});

test('the same requests from both apps are one contract, whatever their origins', () => {
	assert.deepEqual(compareNetwork('/', [capture([news(), hours()]), capture([news(), hours()])], capture([news(), hours(NEW)]), OLD, NEW), []);
	assert.deepEqual(contractLines(capture([news(), hours(), hours()]), OLD), ['2x browser GET {self}/api/hours', 'server GET cms.example/news?fields=title,summary&locale=en']);
});

test('a dropped query field, a different endpoint, a second fetch and a dropped server request each fail', () => {
	const olds = [capture([news(), hours()]), capture([news(), hours()])];
	const [changed] = compareNetwork('/', olds, capture([news('fields=title&locale=en'), hours(NEW)]), OLD, NEW);
	assert.equal(changed!.check, 'server request changed');
	assert.equal(changed!.actual, 'server GET cms.example/news?fields=title&locale=en');

	const endpoint = compareNetwork('/', olds, capture([news(), { ...hours(NEW), url: `${NEW}/api/opening-hours` }]), OLD, NEW);
	assert.deepEqual(endpoint.map((f) => [f.check, f.expected, f.actual]), [['browser request to a different endpoint', 'browser GET {self}/api/hours', 'browser GET {self}/api/opening-hours']]);

	const twice = compareNetwork('/', olds, capture([news(), hours(NEW), hours(NEW)]), OLD, NEW);
	assert.deepEqual(twice.map((f) => [f.check, f.actual]), [['browser request GET {self}/api/hours', '2 times']]);

	const dropped = compareNetwork('/', olds, capture([hours(NEW)]), OLD, NEW);
	assert.deepEqual(dropped.map((f) => [f.check, f.expected]), [['server request missing', 'server GET cms.example/news?fields=title,summary&locale=en']]);
});

test('a request only some OLD loads made is optional; a field the NEW page stops showing fails', () => {
	assert.deepEqual(compareNetwork('/', [capture([news(), hours()]), capture([news()])], capture([news()]), OLD, NEW), []);
	const [f] = compareNetwork('/', [capture([news()]), capture([news()])], capture([news()], 'Winter timetable'), OLD, NEW);
	assert.equal(f!.check, 'response fields the page shows from server GET cms.example/news?fields=title,summary&locale=en');
	assert.match(f!.actual, /no longer shown: items\[\]\.summary$/);
});

test('without the recorder on NEW, server requests cannot be compared and the report says so', () => {
	const [f, ...rest] = compareNetwork('/', [capture([news()]), capture([news()])], { ...capture([]), server: false }, OLD, NEW);
	assert.equal(rest.length, 0);
	assert.equal(f!.check, 'server-side requests');
	assert.match(f!.actual, /not recorded/);
});

test('source facts name the old call site behind a failing request', () => {
	const [f] = compareNetwork('/', [capture([news()]), capture([news()])], capture([]), OLD, NEW, [{ file: 'lib/cms.ts', line: 12, kind: 'fetch', queries: ['https://cms.example/news?fields=title,summary'] }]);
	assert.match(f!.hint, /Old source sends it from lib\/cms\.ts:12 \(fetch\)\.$/);
});

test('only answered requests are recorded for replay, once each, under the URL that was recorded', () => {
	const kept = recordable([news(), news(), { ...hours(), intercepted: true, status: 0 }, { ...hours(NEW), replayed: true, recordedUrl: `${OLD}/api/hours` }]);
	assert.deepEqual(kept.map((r) => r.url), ['https://cms.example/news?fields=title,summary&locale=en', `${OLD}/api/hours`]);
	assert.equal('replayed' in kept[1]!, false);
});

test('client-side navigation fetches are framework transport: Next RSC, Remix _data and the Markless router\'s page fetches', () => {
	const request = (headers: Record<string, string>, method = 'GET') => ({ headers: () => headers, method: () => method });
	assert.equal(frameworkTransport(request({ 'x-markless-fragment': '1' }), new URL(`${NEW}/docs/installation`)), true);
	assert.equal(frameworkTransport(request({ 'x-markless-fragment': '1', purpose: 'prefetch' }), new URL(`${NEW}/docs`)), true);
	assert.equal(frameworkTransport(request({}), new URL(`${NEW}/_markless/fragment/guide/why`)), true, 'Markless 0.7 fetches fragments by path');
	assert.equal(frameworkTransport(request({}), new URL(`${NEW}/_markless/fragment/`)), true);
	assert.equal(frameworkTransport(request({ rsc: '1' }), new URL(`${OLD}/dashboard`)), true);
	assert.equal(frameworkTransport(request({}), new URL(`${OLD}/notes?_data=routes%2Fnotes`)), true);
	assert.equal(frameworkTransport(request({ accept: 'application/json' }), new URL(`${NEW}/api/hours`)), false);
});

test('a single-page app\'s browser fetch that the new server makes while it renders the page has moved to the server, not gone; fetched more often, or not at all, it still fails', () => {
	// The old app is files on a static host (no recorder); the new one renders on its server with the recorder.
	const posts = (side: 'browser' | 'server'): NetworkRecord => ({ side, method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts', status: 200, contentType: 'application/json', body: '[{"id":1,"title":"sunt aut facere"}]' });
	const spa = (records: NetworkRecord[]): NetworkCapture => ({ records, server: false, shown: 'sunt aut facere' });
	const olds = [spa([posts('browser')]), spa([posts('browser')])];
	assert.deepEqual(compareNetwork('/', olds, capture([posts('server')], 'sunt aut facere'), OLD, NEW), []);
	const twice = compareNetwork('/', olds, capture([posts('server'), posts('server')], 'sunt aut facere'), OLD, NEW);
	assert.deepEqual(twice.map((f) => [f.check, f.actual]), [['server request GET jsonplaceholder.typicode.com/posts', '2 times']]);
	const gone = compareNetwork('/', olds, capture([], 'sunt aut facere'), OLD, NEW);
	assert.deepEqual(gone.map((f) => [f.check, f.expected]), [['browser request missing', 'browser GET jsonplaceholder.typicode.com/posts']]);
	const lost = compareNetwork('/', olds, capture([posts('server')], ''), OLD, NEW);
	assert.match(lost.map((f) => f.check).join('|'), /response fields the page shows/, 'what the page showed from it is still compared');
	const noRecorder = compareNetwork('/', olds, { ...capture([posts('server')], 'sunt aut facere'), server: false }, OLD, NEW);
	assert.deepEqual(noRecorder.map((f) => f.check), ['browser request missing'], 'without the recorder on the new server nothing shows it moved');
});
