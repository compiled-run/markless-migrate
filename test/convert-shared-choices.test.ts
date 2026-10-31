// A capture shard records a site-wide palette's reveal but not its choices; the convert of every page then chooses each
// version of it once, however many pages and shards showed it. A shard also writes what each page's capture took.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { convert } from '../src/convert/index.ts';

const COUNT = 25;
const page = (title: string) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><header><button aria-haspopup="dialog" aria-expanded="false" id="search">Search</button></header><main><h1>${title}</h1></main><script>
const button = document.getElementById('search');
button.addEventListener('click', () => {
	button.setAttribute('aria-expanded', 'true');
	const dialog = document.createElement('div');
	dialog.setAttribute('role', 'dialog');
	for (let i = 0; i < ${COUNT}; i++) {
		const item = document.createElement('div');
		item.setAttribute('cmdk-item', '');
		item.setAttribute('data-value', 'Doc ' + i);
		item.textContent = 'Doc ' + i;
		item.addEventListener('click', () => history.pushState(null, '', '/docs/' + i));
		dialog.append(item);
	}
	document.body.append(dialog);
});
</script></body></html>`;
const PAGES: Record<string, string> = { '/': page('Home'), '/a': page('A') };

let server: Server;
let origin: string;
before(async () => {
	server = createServer((req, res) => {
		const html = PAGES[new URL(req.url ?? '/', 'http://x').pathname];
		res.writeHead(html ? 200 : 404, { 'content-type': 'text/html' }).end(html ?? '<!doctype html><title>Not found</title><main><h1>Not found</h1></main>');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const shown = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	for (const key of await readdir(dir).catch(() => [])) for (const name of await readdir(join(dir, key)).catch(() => [])) if (name.endsWith('.shown.json')) out.push(join(dir, key, name));
	return out;
};

test("a shard's capture leaves a site-wide palette's choices to the full convert, which records them once", async () => {
	const app = await mkdtemp(join(tmpdir(), 'shared-choices-'));
	try {
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: Object.keys(PAGES).map((route) => ({ route, status: 200 })) }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'shared-choices', private: true, type: 'module', dependencies: {} }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		const choices = join(app, '.migrate', 'convert', 'choices');
		for (const route of Object.keys(PAGES)) await convert({ old: origin, app, only: [route], captureOnly: true });
		assert.deepEqual(await shown(choices), [], 'no shard chose the palette');
		const costs = await Promise.all((await readdir(join(app, '.migrate', 'convert', 'costs'))).map(async (f) => JSON.parse(await readFile(join(app, '.migrate', 'convert', 'costs', f), 'utf8')) as { route: string; seconds: number }));
		assert.deepEqual(costs.map((c) => c.route).sort(), ['/', '/a'], "each page's capture time, for the next run's shards");
		assert.ok(costs.every((c) => Number.isInteger(c.seconds) && c.seconds >= 0));
		await convert({ old: origin, app });
		const files = await shown(choices);
		assert.equal(files.length, 1, 'one recording for both pages');
		const recorded = JSON.parse(await readFile(files[0]!, 'utf8')) as Record<string, { href?: string }>;
		assert.deepEqual(recorded['Doc 3'], { href: '/docs/3' });
		assert.equal(Object.keys(recorded).length, COUNT);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});
