import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, accessFailures, compareLogin, interpolate, loginRoutes, validateAuth } from '../src/check/auth.ts';
import { appHeaders, defaultEnv, type StorageState } from '../src/check/browser.ts';
import { summarize } from '../src/check/summary.ts';
import { renderHtml } from '../src/check/html.ts';
import type { HttpCapture, Report } from '../src/check/types.ts';

const cookie = (over: Partial<StorageState['cookies'][number]> = {}): StorageState['cookies'][number] => ({ name: 'session', value: 'abc', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax', ...over });
const state = (...cookies: StorageState['cookies']): StorageState => ({ cookies, origins: [] });
const http = (...hops: [number, string][]): HttpCapture => ({ chain: hops.map(([status, url]) => ({ status, url })), status: hops.at(-1)![0], contentType: 'text/html' });

test('an auth file needs roles, each with a login script or a storage state, and anonymous is implied', () => {
	assert.throws(() => validateAuth({}), /"roles" must name at least one role/);
	assert.throws(() => validateAuth({ roles: { member: {} } }), /role "member" needs "storageState" or "login" steps/);
	assert.throws(() => validateAuth({ roles: { anonymous: { storageState: 'a.json' } } }), /always checked/);
	assert.throws(() => validateAuth({ roles: { member: { login: [{ type: 'x' }] } } }), /not goto, fill, click, press or wait/);
	const auth = validateAuth({ loginRoute: '/login', roles: { member: { login: [{ goto: '/en/login?x=1' }, { click: 'button' }] }, admin: { storageState: 'admin.json' } } });
	assert.deepEqual(loginRoutes(auth), ['/login', '/en/login']);
});

test('login values read the environment, and a missing variable says which', () => {
	assert.equal(interpolate('${PW}!', { PW: 'secret' }), 'secret!');
	assert.throws(() => interpolate('${NOPE}', {}), /reads \$\{NOPE\}/);
});

test('session cookies compare by name and attributes, never by value', () => {
	const same = compareLogin('member', '/login', state(cookie()), state(cookie({ value: 'other' })), 'http://127.0.0.1:1', 'http://127.0.0.1:2');
	assert.equal(same.ok, true);
	assert.deepEqual(same.cookies.old, ['session: Path=/; host-only; HttpOnly; not Secure; SameSite=Lax; session']);
	const changed = compareLogin('member', '/login', state(cookie()), state(cookie({ httpOnly: false, sameSite: 'Strict', path: '/members' })), 'http://127.0.0.1:1', 'http://127.0.0.1:2');
	assert.deepEqual(changed.failures.map((f) => [f.check, f.actual]), [['session cookie session after signing in as member', 'session: Path=/members; host-only; readable by scripts; not Secure; SameSite=Strict; session']]);
	const missing = compareLogin('member', '/login', state(cookie(), cookie({ name: 'other.example', domain: 'other.example' })), state(cookie({ name: 'sid' })), 'http://127.0.0.1:1', 'http://127.0.0.1:2');
	assert.deepEqual(missing.failures.map((f) => [f.check, f.actual]), [['session cookie session after signing in as member', '(not set)'], ['cookie sid after signing in as member', 'sid: Path=/; host-only; HttpOnly; not Secure; SameSite=Lax; session']]);
});

test('access: a redirect to the login page or a 401/403 denies, and a different decision stops the comparison', () => {
	assert.equal(access(http([307, '/en/members'], [200, '/en/login']), []).allowed, false);
	assert.equal(access(http([403, '/en/admin']), []).allowed, false);
	assert.equal(access(http([302, '/'], [200, '/en']), []).allowed, true, 'a locale redirect is not a denial');
	assert.equal(access(http([302, '/account'], [200, '/enter']), ['/enter']).allowed, false, 'the auth file names the login route');
	const open = accessFailures('/en/members', 'anonymous', http([307, '/en/members'], [200, '/en/login']), http([200, '/en/members']), []);
	assert.equal(open.comparable, false);
	assert.deepEqual(open.failures.map((f) => [f.dimension, f.check, f.expected, f.actual]), [['auth', 'access as anonymous', 'denied: 307 to /en/login (200)', 'let in: 200']]);
	const elsewhere = accessFailures('/en/members', 'anonymous', http([307, '/en/members'], [200, '/en/login']), http([307, '/en/members'], [200, '/en/login?next=/en/members']), []);
	assert.equal(elsewhere.comparable, true);
	assert.deepEqual(elsewhere.failures.map((f) => [f.check, f.expected, f.actual]), [['where anonymous is sent', '/en/login', '/en/login?next=/en/members']]);
	assert.deepEqual(accessFailures('/en', 'member', http([200, '/en']), http([200, '/en']), []).failures, []);
});

test("the checker's own requests carry the role's cookies for that host only, and --cookie and --header values", () => {
	const env = defaultEnv('http://127.0.0.1:3000', { storageState: state(cookie(), cookie({ name: 'elsewhere', domain: 'cdn.example' })), cookies: [{ name: 'bypass', value: 't' }], headers: { 'x-pass': 't' }, userAgent: 'UA' });
	assert.deepEqual(appHeaders(env), { 'x-pass': 't', cookie: 'session=abc; bypass=t', 'user-agent': 'UA' });
});

test('reports group routes by role, with each role sign-in, and a blocked route says why instead of listing failures', () => {
	const zero = { downloaded: 0, source: 0, executed: 0 };
	const base = { ok: true, failures: [], weight: { old: zero, new: zero }, visualDiffs: [], shots: [], dimensions: {} as Report['routes'][number]['dimensions'] };
	const report: Report = {
		version: 1,
		old: 'http://old',
		new: 'http://new',
		startedAt: '',
		ok: false,
		roles: ['anonymous', 'member'],
		logins: [{ role: 'member', ok: false, cookies: { old: ['session: Path=/'], new: ['session: Path=/x'] }, failures: [{ route: '/login', role: 'member', dimension: 'auth', check: 'session cookie session after signing in as member', expected: 'session: Path=/', actual: 'session: Path=/x', hint: 'Set the same Path' }] }],
		routes: [
			{ ...base, route: '/members', role: 'anonymous' },
			{ ...base, route: '/members', role: 'member', ok: false, blocked: { side: 'old', vendor: 'Cloudflare', status: 403, evidence: 'header cf-mitigated: challenge', message: 'blocked by Cloudflare on OLD (403, header cf-mitigated: challenge): use a staging URL or pass --header/--cookie with a bypass token' } },
		],
	};
	const text = summarize(report);
	assert.match(text, /As anonymous:\npass +\/members/);
	assert.match(text, /As member:\n {6}sign-in: differs \(session: Path=\/\)\n {6}auth: session cookie session after signing in as member/);
	assert.match(text, /BLOCKED +\/members +blocked by Cloudflare on OLD/);
	assert.match(text, /1 of 2 route checks \(route and role\) green, 1 blocked by bot protection\./);
	const html = renderHtml(report);
	assert.match(html, /<h2>As member<\/h2><details class="states login" open>/);
	assert.match(html, /<span class="badge blocked">blocked<\/span> \/members <small>as member<\/small>/);
});
