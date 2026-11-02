// A Radix menu whose content is not portaled (Menubar.Content without Menubar.Portal) mounts its popper wrapper inside
// the menubar, next to its trigger, while Radix puts its focus guards at the start and end of the body.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { convert } from '../src/convert/index.ts';

const PAGE = `<!doctype html><html lang="en"><head><title>Menubar</title></head><body><div id="root"><div><div dir="ltr"><div role="menubar" data-slot="menubar">
<button type="button" role="menuitem" id="radix-1" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="menubar-trigger">File</button>
<button type="button" role="menuitem" id="radix-2" aria-haspopup="menu" aria-expanded="false" data-state="closed" data-slot="menubar-trigger">Edit</button>
</div></div></div></div><script>
const items = { 'radix-1': ['New Tab', 'New Window'], 'radix-2': ['Undo', 'Redo'] };
const guard = () => Object.assign(document.createElement('span'), { tabIndex: 0 });
document.addEventListener('pointerdown', (event) => {
	const t = event.target.closest('[data-slot="menubar-trigger"]');
	if (!t) return;
	for (const w of document.querySelectorAll('[data-radix-popper-content-wrapper]')) w.remove();
	for (const g of document.querySelectorAll('[data-radix-focus-guard]')) g.remove();
	for (const b of document.querySelectorAll('[data-slot="menubar-trigger"]')) { b.setAttribute('aria-expanded', 'false'); b.setAttribute('data-state', 'closed'); }
	const start = guard();
	const end = guard();
	start.setAttribute('data-radix-focus-guard', '');
	end.setAttribute('data-radix-focus-guard', '');
	document.body.prepend(start);
	document.body.append(end);
	t.setAttribute('aria-expanded', 'true');
	t.setAttribute('data-state', 'open');
	t.setAttribute('aria-controls', t.id + '-c');
	const w = document.createElement('div');
	w.setAttribute('data-radix-popper-content-wrapper', '');
	w.style.cssText = 'position: fixed; left: 0px; top: 0px; transform: translate(10px, 40px)';
	w.innerHTML = '<div role="menu" id="' + t.id + '-c" aria-labelledby="' + t.id + '" data-state="open" data-radix-menu-content="" data-slot="menubar-content" tabindex="-1">' + items[t.id].map((i) => '<div role="menuitem" tabindex="-1" data-slot="menubar-item">' + i + '</div>').join('') + '</div>';
	t.after(w);
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

test("a Radix menu mounted inside its menubar, not portaled, is a layer of its trigger's, as a portaled one is", async () => {
	const app = await mkdtemp(join(tmpdir(), 'radix-inline-menu-'));
	try {
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: [{ route: '/', status: 200 }] }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'radix-inline-menu', private: true, type: 'module', dependencies: {} }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		const report = await convert({ old: origin, app, only: ['/'] });
		const page = await readFile(join(app, report.routes.find((r) => r.route === '/')!.page), 'utf8');
		const dir = join(app, 'components', 'converted', 'layers');
		const layers = await Promise.all((await readdir(dir).catch(() => [])).map((f) => readFile(join(dir, f), 'utf8')));
		const holding = (text: string) => [page, ...layers].filter((source) => source.includes(text) && /data-mm-layer=/.test(source));
		assert.equal(holding('New Tab').length, 1, "File's menu is one layer");
		assert.equal(holding('Undo').length, 1, "Edit's menu is one layer");
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});
