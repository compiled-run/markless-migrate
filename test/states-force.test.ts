// A forced pseudo-class holds on every element a state names while it is read, and is gone before the next state is forced.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { observeStates } from '../src/check/states.ts';
import { discoverStates, parseRules } from '../src/check/stylesheet.ts';
import { VIEWPORTS } from '../src/check/types.ts';

const css = 'button:focus-visible { outline: 2px solid red; } @media (prefers-color-scheme: dark) { body { background: black; } }';
const html = `<!doctype html><html lang="en"><head><title>Two buttons</title><style>${css}</style></head><body><main><button>Save</button> <button>Cancel</button></main></body></html>`;

let browser: Browser;
let server: Server;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
});
after(async () => {
	await browser?.close();
	server?.close();
});

test('a pseudo-class is forced on each of the state\'s targets at once, and lifted from all of them before the next state', async () => {
	const env = defaultEnv(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
	const sources = [{ url: '/inline.css', text: css }];
	const states = discoverStates(sources);
	assert.deepEqual(states.map((s) => s.label), [':focus-visible on button', 'prefers-color-scheme: dark']);
	const row = await observeStates({ browser, envs: { old: env, new: env }, route: '/', viewport: VIEWPORTS[0]!, states, rules: parseRules(sources), noise: [], explain: [] });
	const outlines = (label: string) => {
		const run = row.states.find((s) => s.label === label);
		assert.ok(run && 's1' in run, label);
		return [run.s1, run.s2, run.sn].map((elements) => elements.filter((el) => el.tag === 'button').map((el) => `${el.name}: ${el.style['outline-style']}`));
	};
	const both = ['Save: solid', 'Cancel: solid'];
	assert.deepEqual(outlines(':focus-visible on button'), [both, both, both]);
	const none = ['Save: none', 'Cancel: none'];
	assert.deepEqual(outlines('prefers-color-scheme: dark'), [none, none, none]);
});
