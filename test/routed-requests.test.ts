import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEnv, routedRequests } from '../src/check/browser.ts';

const routes = (matcher: string | RegExp, url: string) => (typeof matcher === 'string' ? matcher === '**/*' : matcher.test(url));

test("the app's own static files load without the route handler; everything else still passes through it", () => {
	const matcher = routedRequests(defaultEnv('https://old.example.com'), {});
	for (const url of [
		'https://old.example.com/_next/static/chunks/main-abc.js',
		'https://old.example.com/_next/static/css/app.css?v=3',
		'https://old.example.com/fonts/geist.woff2',
		'https://old.example.com/images/hero.png',
		'https://old.example.com/favicon.ico',
	])
		assert.equal(routes(matcher, url), false, url);
	for (const url of [
		'https://old.example.com/',
		'https://old.example.com/docs/components/button',
		'https://old.example.com/api/search?q=a',
		'https://old.example.com/_next/data/build/page.json',
		'https://old.example.com/r/registry.json',
		'https://old.example.com/assets/logo.png.html',
		'https://other.example.com/_next/static/chunks/main-abc.js',
		'https://www.google-analytics.com/analytics.js',
		'http://old.example.com/images/hero.png',
	])
		assert.equal(routes(matcher, url), true, url);
});

test('a page load that rewrites, replays, times or redirects requests routes every request', () => {
	const base = defaultEnv('https://old.example.com');
	assert.equal(routedRequests({ ...base, headers: { 'x-pass': '1' } }, {}), '**/*');
	assert.equal(routedRequests({ ...base, replay: { set: 's', responses: [] } }, {}), '**/*');
	assert.equal(routedRequests({ ...base, writeFacts: [{ method: 'GET', path: '/x', handler: { file: 'a.ts', line: 1 } } as never] }, {}), '**/*');
	assert.equal(routedRequests({ ...base, frontDoor: { old: 'https://legacy.example.com', serves: () => true } as never }, {}), '**/*');
	assert.equal(routedRequests(base, { timed: { network: {} as never, miss: () => {} } }), '**/*');
	assert.equal(routedRequests(defaultEnv('https://www.google-analytics.com'), {}), '**/*', 'an origin the blocker refuses');
});
