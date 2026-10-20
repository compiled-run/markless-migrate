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

test('JSON arrays are aligned by identity, so removing a middle item reports exactly that item', () => {
	const doc = (items: object[]) => JSON.stringify({ items });
	const a = { slug: 'a', title: 'A' };
	const b = { slug: 'b', title: 'B' };
	const c = { slug: 'c', title: 'C' };
	const removed = compareEndpoint('/api/news', [capture('/api/news', doc([a, b, c]), 'application/json')], capture('/api/news', doc([a, c]), 'application/json'));
	assert.deepEqual(removed.map((f) => [f.check, f.expected, f.actual]), [['JSON item items[slug=b] missing', '{"slug":"b","title":"B"}', '(absent)']]);
	const changed = compareEndpoint('/api/news', [capture('/api/news', doc([a, b, c]), 'application/json')], capture('/api/news', doc([c, { ...b, title: 'Bee' }, a]), 'application/json'));
	assert.deepEqual(changed.map((f) => [f.check, f.expected, f.actual]), [['JSON field items[].title', '"B"', '"Bee"']], 'reordering alone is not a difference');
});

test('JSON arrays without an identity field are aligned by longest common subsequence', () => {
	const doc = (tags: unknown[]) => JSON.stringify({ tags });
	const removed = compareEndpoint('/api/tags', [capture('/api/tags', doc(['x', 'y', 'z']), 'application/json')], capture('/api/tags', doc(['x', 'z']), 'application/json'));
	assert.deepEqual(removed.map((f) => [f.check, f.expected, f.actual]), [['JSON item tags[#1] missing', '"y"', '(absent)']]);
	const added = compareEndpoint('/api/tags', [capture('/api/tags', doc([{ n: 1 }, { n: 1 }]), 'application/json')], capture('/api/tags', doc([{ n: 1 }, { n: 2 }, { n: 1 }]), 'application/json'));
	assert.deepEqual(added.map((f) => [f.check, f.actual]), [['JSON item tags[+0] not in the old response', '{"n":2}']]);
	const edited = compareEndpoint('/api/tags', [capture('/api/tags', doc(['x', 'y', 'z']), 'application/json')], capture('/api/tags', doc(['x', 'why', 'z']), 'application/json'));
	assert.deepEqual(edited.map((f) => [f.check, f.expected, f.actual]), [['JSON field tags[]', '"y"', '"why"']], 'an item replaced in place is a changed value');
});

test('check --all adds the config redirects and the other trailing-slash form of each page, not the pages themselves', async () => {
	const { redirectTargets } = await import('../src/check/endpoints.ts');
	assert.deepEqual(redirectTargets(['/', '/about/', '/blog', '/feed.xml', '/x?y=1', '/blog/'], [{ from: '/old-about' }, { from: '/old/:slug' }]), ['/about', '/old-about']);
});

test('an endpoint that sends this visitor to a page compares where it sends them, not the page markup', () => {
	const page = (path: string, body: string): EndpointCapture => ({ http: { chain: [{ url: '/query', status: 302 }, { url: path, status: 200 }], status: 200, contentType: 'text/html' }, kind: endpointKind(path, 'text/html', body), body });
	assert.deepEqual(compareEndpoint('/query', [page('/dashboard', '<!DOCTYPE html><p>old</p>')], page('/dashboard', '<!doctype html><p>new</p>')), []);
	assert.equal(compareEndpoint('/query', [page('/dashboard', '<p>old</p>')], page('/elsewhere', '<p>new</p>'))[0]?.check, 'status');
});

test('a feed\'s build date is when it was generated: a static feed built on another day compares as a date, and a missing or broken one is red', () => {
	const olds = [capture('/blog.rss', rss(['a'], 'Fri, 16 Oct 2026 23:29:42 GMT'), 'application/rss+xml'), capture('/blog.rss', rss(['a'], 'Fri, 16 Oct 2026 23:29:42 GMT'), 'application/rss+xml')];
	assert.deepEqual(compareEndpoint('/blog.rss', olds, capture('/blog.rss', rss(['a'], 'Mon, 19 Oct 2026 05:58:29 GMT'), 'application/rss+xml')), []);
	assert.deepEqual(compareEndpoint('/blog.rss', olds, capture('/blog.rss', rss(['a'], 'yesterday-ish'), 'application/rss+xml')).map((f) => f.check), ['feed field lastBuildDate']);
	const atom = (updated: string) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>News</title><updated>${updated}</updated><entry><title>a</title><id>urn:a</id><updated>2026-10-01T00:00:00Z</updated></entry></feed>`;
	const atomOlds = [capture('/atom.xml', atom('2026-10-16T23:29:42Z'), 'application/atom+xml'), capture('/atom.xml', atom('2026-10-16T23:29:42Z'), 'application/atom+xml')];
	assert.deepEqual(compareEndpoint('/atom.xml', atomOlds, capture('/atom.xml', atom('2026-10-19T05:58:29Z'), 'application/atom+xml')), []);
	const entry = atom('2026-10-16T23:29:42Z').replace('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z');
	assert.equal(compareEndpoint('/atom.xml', atomOlds, capture('/atom.xml', entry, 'application/atom+xml')).length, 1, 'an entry\'s own date is content, still compared');
});
