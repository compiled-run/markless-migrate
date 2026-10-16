import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareEndpoint, declaredEndpoints, endpointKind, type EndpointCapture } from '../src/check/endpoints.ts';

const capture = (path: string, body: string, contentType: string, status = 200): EndpointCapture => ({ http: { chain: [{ url: path, status }], status, contentType }, kind: endpointKind(path, contentType, body), body });
const rss = (items: string[], built = 'Mon, 12 Oct 2026 10:00:00 GMT') => `<?xml version="1.0"?><rss version="2.0"><channel><title>News</title><lastBuildDate>${built}</lastBuildDate>${items.map((t) => `<item><title>${t}</title><guid>https://x.example/${t}</guid></item>`).join('')}</channel></rss>`;

test('a feed item that is gone is named, and a build date that varied between old loads is noise', () => {
	const olds = [capture('/feed.xml', rss(['a', 'b']), 'application/rss+xml'), capture('/feed.xml', rss(['a', 'b'], 'Mon, 12 Oct 2026 10:00:07 GMT'), 'application/rss+xml')];
	const failures = compareEndpoint('/feed.xml', olds, capture('/feed.xml', rss(['a'], 'Mon, 12 Oct 2026 10:00:31 GMT'), 'application/rss+xml'));
	assert.deepEqual(failures.map((f) => [f.dimension, f.check, f.expected, f.actual]), [['data', 'feed item missing', '"b" (https://x.example/b)', '(absent)']]);
});

test('robots.txt is compared line by line as seo; a renamed JSON field is one missing and one new field, grouped across entries', () => {
	const robots = compareEndpoint('/robots.txt', [capture('/robots.txt', 'User-agent: *\nAllow: /\n', 'text/plain')], capture('/robots.txt', 'User-agent: *\nDisallow: /\n', 'text/plain'));
	assert.deepEqual(robots.map((f) => [f.dimension, f.check, f.expected, f.actual]), [['seo', 'robots.txt line', 'Allow: /', 'Disallow: /']]);
	const json = (key: string) => JSON.stringify({ items: [{ [key]: 'One', slug: 'one' }, { [key]: 'Two', slug: 'two' }] });
	const renamed = compareEndpoint('/api/news', [capture('/api/news', json('title'), 'application/json')], capture('/api/news', json('headline'), 'application/json'));
	assert.deepEqual(renamed.map((f) => [f.dimension, f.check, f.expected, f.actual]), [
		['data', 'JSON field items[].title missing', '"One" (and 1 more entry)', '(absent) (and 1 more entry)'],
		['data', 'JSON field items[].headline not in the old response', '(absent) (and 1 more entry)', '"One" (and 1 more entry)'],
	]);
});

test('sitemap entries are compared as a set, status and content type as http, and a different format is named', () => {
	const map = (locs: string[]) => `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;
	assert.deepEqual(compareEndpoint('/sitemap.xml', [capture('/sitemap.xml', map(['/a', '/b']), 'application/xml')], capture('/sitemap.xml', map(['/b', '/a']), 'application/xml')), []);
	const gone = compareEndpoint('/sitemap.xml', [capture('/sitemap.xml', map(['/a']), 'application/xml')], capture('/sitemap.xml', 'nope', 'text/html', 404));
	assert.deepEqual(gone.map((f) => [f.dimension, f.check]), [['http', 'status'], ['http', 'content-type']]);
	const text = compareEndpoint('/manifest.json', [capture('/manifest.json', '{"a":1}', 'application/json')], capture('/manifest.json', 'a=1', 'text/plain'));
	assert.deepEqual(text.map((f) => [f.check, f.expected, f.actual]), [['content-type', 'application/json', 'text/plain'], ['format', 'json', 'text']]);
});

test('feeds and the manifest a page head declares are found', () => {
	assert.deepEqual(declaredEndpoints('<link rel="manifest" href="/m.json"><link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="alternate" hreflang="fr" href="/fr/"><link rel="stylesheet" href="/a.css">'), ['/m.json', '/feed.xml']);
});
