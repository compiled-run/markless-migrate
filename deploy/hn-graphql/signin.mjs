// Creates the same account on each app (the old app's own /register) and saves each session as a Playwright storage state for check --auth: node deploy/hn-graphql/signin.mjs <old> <new> <dir>
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [oldOrigin, newOrigin, dir = '.migrate/auth'] = process.argv.slice(2);
const id = process.env.HN_USER ?? 'checker';
const password = process.env.HN_PASSWORD ?? 'checker-password';
await mkdir(dir, { recursive: true });
for (const [side, origin] of [['old', oldOrigin], ['new', newOrigin]]) {
	const res = await fetch(new URL('/register', origin), { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id, password }) });
	const cookie = res.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
	if (!cookie) throw new Error(`${side}: /register answered ${res.status} ${res.headers.get('location')} without a session`);
	const value = cookie.split(';')[0].slice('connect.sid='.length);
	const expires = Date.parse(/expires=([^;]+)/i.exec(cookie)?.[1] ?? '') / 1000 || -1;
	const { hostname } = new URL(origin);
	const state = { cookies: [{ name: 'connect.sid', value, domain: hostname, path: '/', expires, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] };
	await writeFile(join(dir, `${side}.json`), `${JSON.stringify(state, null, '\t')}\n`);
	console.log(`${side}: signed in as ${id} (${res.headers.get('location')})`);
}
