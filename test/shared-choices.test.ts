// The pipeline's shared job records a site-wide palette once per version of its options, split between its parts, from
// the controls outside each sampled page's main content; capture shards leave it alone and convert reads it back.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { recordShared, samplePages, sharedHeld } from '../scripts/shared-choices.ts';
import { fetchRecordKey, recorderVersions } from '../src/convert/record-key.ts';
import { convert } from '../src/convert/index.ts';

const page = (title: string, library: string) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><header><button aria-haspopup="dialog" aria-expanded="false" aria-controls="palette">Search</button></header><main><h1>${title}</h1><button aria-haspopup="menu" aria-expanded="false" id="demo">Demo</button></main><script>
const add = (role, item, count, to) => {
	const layer = document.createElement('div');
	layer.setAttribute('role', role);
	for (let i = 0; i < count; i++) {
		const el = document.createElement('div');
		if (item === 'cmdk') { el.setAttribute('cmdk-item', ''); el.setAttribute('data-value', '${library} ' + i); } else el.setAttribute('role', 'menuitem');
		el.textContent = '${library} ' + i;
		el.addEventListener('click', () => { layer.remove(); history.pushState(null, '', to + i); });
		layer.append(el);
	}
	document.body.append(layer);
};
document.querySelector('[aria-controls=palette]').addEventListener('click', (e) => { e.currentTarget.setAttribute('aria-expanded', 'true'); add('dialog', 'cmdk', 25, '/docs/${library}/'); });
document.getElementById('demo').addEventListener('click', (e) => { e.currentTarget.setAttribute('aria-expanded', 'true'); add('menu', 'menuitem', 30, '/demo/'); });
</script></body></html>`;
const PAGES: Record<string, string> = { '/': page('Home', 'base'), '/docs/radix/a': page('A', 'radix'), '/docs/radix/b': page('B', 'radix'), '/docs/base/a': page('Base A', 'base') };

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

test('the first page of each path group is sampled', () => {
	assert.deepEqual(samplePages(['/', '/docs/radix/a', '/docs/radix/b', '/docs/base/a', '/blocks?x=1', '/blocks/b']), ['/', '/docs/radix/a', '/docs/base/a', '/blocks/b']);
});

test("the shared job's parts record each version of a site-wide palette once, never a page's own menu, and convert reads them back", async () => {
	const app = await mkdtemp(join(tmpdir(), 'shared-choices-'));
	try {
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: Object.keys(PAGES).map((route) => ({ route, status: 200 })) }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'shared-choices', private: true, type: 'module', dependencies: {} }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		const versions = await recorderVersions();
		const keys = join(app, 'record-keys.json');
		await writeFile(keys, JSON.stringify(Object.fromEntries(await Promise.all(Object.keys(PAGES).map(async (r) => [r, await fetchRecordKey(versions, origin, r)])))));
		assert.equal(await sharedHeld(join(app, '.migrate', 'convert'), keys), false, 'nothing recorded yet');
		const parts = await Promise.all([0, 1].map((part) => recordShared({ origin, app, part, parts: 2, width: 2, keys, log: () => {} })));
		assert.equal(await sharedHeld(join(app, '.migrate', 'convert'), keys), true, 'the next run with these keys records nothing');
		assert.deepEqual(parts.map((p) => p.length), [1, 1], 'the two versions, one in each part');
		assert.deepEqual(parts.flat().map((c) => c.route).sort(), ['/', '/docs/radix/a']);
		const root = join(app, '.migrate', 'convert', 'shared-choices');
		const files = (await Promise.all((await readdir(root)).map(async (k) => (await readdir(join(root, k))).filter((f) => f.endsWith('.shown.json'))))).flat();
		assert.deepEqual(files.sort(), parts.flat().map((c) => c.file).sort());
		assert.ok(files.every((f) => f.startsWith('palette-')));
		const chrome = await Promise.all((await readdir(root)).filter((k) => existsSync(join(root, k, 'chrome.json'))).map(async (k) => JSON.parse(await readFile(join(root, k, 'chrome.json'), 'utf8')) as { reveals: { key: string }[] }));
		assert.equal(chrome.length, 3, 'one per sampled page');
		assert.deepEqual([...new Set(chrome.flatMap((c) => c.reveals.map((r) => r.key)))], ['palette'], "a page's own menu in its main content is not the site's");
		for (const route of Object.keys(PAGES)) await convert({ old: origin, app, only: [route], captureOnly: true });
		await convert({ old: origin, app });
		const chosen = existsSync(join(app, '.migrate', 'convert', 'choices')) ? (await readdir(join(app, '.migrate', 'convert', 'choices'), { recursive: true })).map(String) : [];
		assert.equal(chosen.some((f) => f.includes('palette-')), false, 'convert read the palette back rather than choosing it');
		assert.ok(chosen.some((f) => f.includes('demo-')), "the page's own menu, left by the shards, is chosen by convert");
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});
