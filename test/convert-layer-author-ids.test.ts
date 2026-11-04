// Two popovers whose author gave their inputs the same ids: the port keeps both layers in the page while closed, the original mounts one at a time.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { convert } from '../src/convert/index.ts';

const FIELDS = '<label for="width">Width</label><input id="width" name="width" class="width" value="100%"><label id="height-label" for="height">Height</label><input id="height" aria-labelledby="height-label" aria-describedby="height-hint"><p id="height-hint">px</p>';
const PAGE = `<!doctype html><html lang="en"><head><title>Popover</title></head><body><div id="root"><main>
<button type="button" id="open-a" aria-haspopup="dialog" aria-expanded="false" aria-controls="pop-a" data-state="closed" data-slot="popover-trigger">Open A</button>
<button type="button" id="open-b" aria-haspopup="dialog" aria-expanded="false" aria-controls="pop-b" data-state="closed" data-slot="popover-trigger">Open B</button>
</main></div><script>
document.addEventListener('click', (event) => {
	const t = event.target.closest('[data-slot="popover-trigger"]');
	if (!t) return;
	const id = t.getAttribute('aria-controls');
	if (document.getElementById(id)) return;
	t.setAttribute('aria-expanded', 'true');
	t.setAttribute('data-state', 'open');
	const d = document.createElement('div');
	d.innerHTML = '<div role="dialog" id="' + id + '" data-state="open" data-slot="popover-content"><h4>Dimensions ' + id + '</h4>${FIELDS}</div>';
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

test("a later layer holding an author's id an earlier layer holds names it anew, and only that layer's references to it follow", async () => {
	const app = await mkdtemp(join(tmpdir(), 'layer-author-ids-'));
	try {
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: [{ route: '/', status: 200 }] }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'layer-author-ids', private: true, type: 'module', dependencies: {} }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		const report = await convert({ old: origin, app, only: ['/'] });
		const page = await readFile(join(app, report.routes.find((r) => r.route === '/')!.page), 'utf8');
		const dir = join(app, 'components', 'converted', 'layers');
		const sources = [page, ...(await Promise.all((await readdir(dir).catch(() => [])).map((f) => readFile(join(dir, f), 'utf8'))))].join('\n');
		const a = /<div role="dialog"[^>]*>(?:(?!role="dialog")[^])*?Dimensions pop-a[^]*?<p id="height-hint[^"]*">px<\/p><\/div>/.exec(sources)?.[0];
		const b = /<div role="dialog"[^>]*>(?:(?!role="dialog")[^])*?Dimensions pop-b[^]*?<p id="height-hint[^"]*">px<\/p><\/div>/.exec(sources)?.[0];
		assert.ok(a && b, 'both popovers are converted');
		assert.match(a, /<label for="width">Width<\/label><input id="width" name="width" class="width"/, 'the first keeps the ids it had');
		assert.match(a, /<label id="height-label" for="height">Height<\/label><input id="height" aria-labelledby="height-label" aria-describedby="height-hint"/);
		assert.match(b, /<label for="width-2">Width<\/label><input id="width-2" name="width" class="width"/, 'the second names its own, and its label follows; its name and class are no ids');
		assert.match(b, /<label id="height-label-2" for="height-2">Height<\/label><input id="height-2" aria-labelledby="height-label-2" aria-describedby="height-hint-2"/);
		assert.match(b, /<p id="height-hint-2">px<\/p>/);
		assert.match(page, /id="open-a"[^>]*aria-controls="pop-a"/, 'the triggers still name their own layers');
		assert.match(page, /id="open-b"[^>]*aria-controls="pop-b"/);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});
