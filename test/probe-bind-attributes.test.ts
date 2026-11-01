import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';

const probe = new URL('../scripts/probe/dead-controls.mjs', import.meta.url).pathname;

// A button whose only effect on the original is bind:show on a div in its banner, as Qwik writes a Modal.Root's bind:show prop; the port's does nothing.
const page = (bind: boolean, css = '') =>
	`<!doctype html><html lang="en"><head><title>t</title><style>${css}</style></head><body><header><div id="root">Site</div></header><main><button id="b">Press</button></main><script>
	document.getElementById('b').addEventListener('click', () => {
		${bind ? `const r = document.getElementById('root'); r.hasAttribute('bind:show') ? r.removeAttribute('bind:show') : r.setAttribute('bind:show', '');` : ''}
	});
	</script></body></html>`;

const PAGES = { old: page(true), new: page(false), styled: page(true, '[bind\\:show] { color: red }') };
const servers: Server[] = [];
const origins: Record<string, string> = {};
let dir = '';
before(async () => {
	for (const [name, html] of Object.entries(PAGES)) {
		const server = createServer((req, res) => (req.url === '/' ? res.writeHead(200, { 'content-type': 'text/html' }).end(html) : res.writeHead(404).end()));
		await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
		servers.push(server);
		origins[name] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	}
	dir = await mkdtemp(join(tmpdir(), 'probe-bind-'));
	await writeFile(join(dir, 'routes.json'), JSON.stringify(['/']));
});
after(async () => {
	for (const server of servers) server.close();
	await rm(dir, { recursive: true, force: true });
});

async function findings(old: string, next: string): Promise<string[]> {
	const out = join(dir, `${old}.jsonl`);
	await promisify(execFile)(process.execPath, [probe, join(dir, 'routes.json'), out], { env: { ...process.env, OLD: origins[old], NEW: origins[next], MAX_ACTIONS: '4', KEY_MAX: '0', INPUT_MAX: '0', STATIC_WIDTHS: '1280', ANCHOR_WIDTHS: '' }, timeout: 120_000 });
	const row = JSON.parse((await readFile(out, 'utf8')).trim().split('\n')[0]!) as { findings: { control: string; kind: string; actual: string }[] };
	return row.findings.filter((f) => f.control.includes('Press')).map((f) => `${f.kind}: ${f.actual}`);
}

test("Qwik's own bind:* attribute changing on the original is no change the port must make", async () => {
	assert.deepEqual(await findings('old', 'new'), []);
});

test('a bind:* attribute a stylesheet selects on can show, so the port must change it too', async () => {
	assert.notDeepEqual(await findings('styled', 'new'), []);
});
