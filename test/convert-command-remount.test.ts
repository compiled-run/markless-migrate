// cmdk mounts a Command in a dialog each time the dialog opens: a new list at the top, no search, the first item selected.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { convert } from '../src/convert/index.ts';

const ITEMS = ['Calendar', 'Search Emoji', 'Calculator'].map((v, i) => `<div cmdk-item="" role="option" id="i${i}" aria-disabled="false" aria-selected="${i === 0}" data-selected="${i === 0}" data-value="${v}">${v}</div>`).join('');
const PAGE = `<!doctype html><html lang="en"><head><title>Command</title></head><body><div id="root"><main>
<button type="button" id="open" aria-haspopup="dialog" aria-expanded="false" aria-controls="palette" data-state="closed" data-slot="dialog-trigger">Open</button>
</main></div><script>
document.addEventListener('click', (event) => {
	const t = event.target.closest('[data-slot="dialog-trigger"]');
	if (!t || document.getElementById('palette')) return;
	t.setAttribute('aria-expanded', 'true');
	t.setAttribute('data-state', 'open');
	const d = document.createElement('div');
	d.innerHTML = '<div role="dialog" id="palette" data-state="open" data-slot="dialog-content" tabindex="-1"><h2>Command Palette</h2><div cmdk-root="" tabindex="-1"><input cmdk-input="" role="combobox" type="text" value="" placeholder="Type a command"><div cmdk-list="" role="listbox"><div cmdk-list-sizer="">${ITEMS}</div></div></div></div>';
	document.body.append(d.firstChild);
});
</script></body></html>`;

let server: Server;
let origin: string;
before(async () => {
	server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		res.writeHead(path === '/' ? 200 : 404, { 'content-type': 'text/html' }).end(path === '/' ? PAGE : '<!doctype html><title>Not found</title><body><main><h1>Not found</h1></main></body>');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test("what a dialog's Command holds renders under an @if the cmdk part turns off and on again as the dialog closes, so each opening gets a new input and list, as cmdk mounts them", async () => {
	const app = await mkdtemp(join(tmpdir(), 'command-remount-'));
	try {
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: [{ route: '/', status: 200 }] }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'command-remount', private: true, type: 'module', dependencies: {} }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		const report = await convert({ old: origin, app, only: ['/'] });
		const page = await readFile(join(app, report.routes.find((r) => r.route === '/')!.page), 'utf8');
		const dir = join(app, 'components', 'converted', 'layers');
		const layers = await Promise.all((await readdir(dir).catch(() => [])).map((f) => readFile(join(dir, f), 'utf8')));
		const [layer, ...others] = [page, ...layers].filter((source) => source.includes('cmdk-root'));
		assert.equal(others.length, 0, 'one source renders the palette');
		assert.ok(layer, 'the palette is converted');
		assert.match(layer, /^import \{ state \} from '@markless\/core';$/m);
		assert.match(layer, /\n\tlet commandMounted0 = state\(true\);\n/);
		assert.match(layer, /<div cmdk-root="" tabindex="-1" onMmunmount=\{\(\) => \(commandMounted0 = false\)\} onMmmount=\{\(\) => \(commandMounted0 = true\)\}>@if \(commandMounted0\) \{ <><input cmdk-input=""[^]*Calculator<\/div><\/div><\/div><\/> \}<\/div>/);
		assert.match(layer, /<h2>Command Palette<\/h2><div cmdk-root/, 'what the dialog shows around the Command stays as it is');
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});
