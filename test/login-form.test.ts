import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { LAUNCH } from '../src/check/browser.ts';
import { proposeAuth, readLoginForm, withLoginForm } from '../src/plan/auth.ts';

let browser: Browser;
const servers: Server[] = [];
before(async () => {
	browser = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: [...LAUNCH.ignoreDefaultArgs] });
});
after(async () => {
	await browser?.close();
	for (const s of servers) s.close();
});

function serve(html: string): Promise<string> {
	const server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}/login`)));
}

const guard = [{ role: undefined, routes: ['/profile'], file: 'src/routes/_auth.tsx', line: 11, redirectTo: '/login' }];
const starter = () => proposeAuth(guard as never, [], [])!;

test('a sign-in form that asks only for a name gets a starter that fills that field from its own variable and submits, with no password step', async () => {
	const url = await serve('<!doctype html><title>Login</title><div>You must log in!</div><form><input placeholder="Username"><button type="submit">Login</button></form>');
	const form = await readLoginForm(browser, url);
	assert.deepEqual(form, { user: { placeholder: 'Username' }, submit: { role: 'button', name: 'Login' }, passwordless: true });
	const login = withLoginForm(starter(), form).roles['signed-in']!.login!;
	assert.deepEqual(login.slice(1, 3), [{ fill: { placeholder: 'Username' }, value: '${SIGNED_IN_USERNAME}' }, { click: { role: 'button', name: 'Login' } }]);
	assert.ok(!JSON.stringify(login).includes('PASSWORD'), JSON.stringify(login));
});

test('a form with a password keeps the email and password steps, fitted to its labels', async () => {
	const url = await serve('<!doctype html><title>Sign in</title><form><label>Work email <input name="e"></label><label>Secret <input type="password"></label><button>Continue</button></form>');
	const login = withLoginForm(starter(), await readLoginForm(browser, url)).roles['signed-in']!.login!;
	assert.deepEqual(login.slice(1, 4), [{ fill: { label: 'Work email' }, value: '${SIGNED_IN_EMAIL}' }, { fill: { label: 'Secret' }, value: '${SIGNED_IN_PASSWORD}' }, { click: { role: 'button', name: 'Continue' } }]);
});
