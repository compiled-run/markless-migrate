// A converted page's head: a font-display: swap font's preloads come after its stylesheets at low priority, an icon font's stay first.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { convert } from '../src/convert/index.ts';

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tabs</title>
<link rel="preload" href="/sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/icons.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">
</head><body><main><h1>Tabs</h1><i>x</i><code>npx add</code><p>Body</p></main></body></html>`;
const CSS = `@font-face{font-family:Sans;src:url(/sans.woff2) format("woff2");font-display:swap}
@font-face{font-family:Icons;src:url(/icons.woff2) format("woff2");font-display:block}
@font-face{font-family:Mono;src:url(/mono.woff2) format("woff2");font-display:swap}
@font-face{font-family:Text;src:url(/text.woff2) format("woff2")}
body{font-family:Sans,sans-serif}i{font-family:Icons}code{font-family:Mono,monospace}p{font-family:Text,serif}`;

test('a swap font is preloaded after the stylesheets at low priority, whether the old page preloaded it or convert adds it; an icon font keeps its place', async () => {
	const server = createServer((req, res) => {
		if (req.url === '/') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
		if (req.url === '/site.css') return void res.writeHead(200, { 'content-type': 'text/css' }).end(CSS);
		if (req.url?.endsWith('.woff2')) return void res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.alloc(64));
		res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const app = await mkdtemp(join(tmpdir(), 'font-heads-'));
	try {
		await mkdir(join(app, '.migrate'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: [{ route: '/', status: 200 }] }));
		await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'font-heads', private: true, type: 'module', dependencies: {} }));
		await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
		await convert({ old: origin, app, only: ['/'], reveal: false });
		const heads = await readFile(join(app, 'heads.ts'), 'utf8');
		const tags = JSON.parse(heads.match(/export const TAGS: readonly HeadTag\[\] = (.*);\n/)![1]!) as { tag: string; attrs: Record<string, string> }[];
		const ids = JSON.parse(heads.match(/export const ROUTES: [^=]+= (.*);\n/)![1]!)['/'].tags as number[];
		const links = ids.map((i) => tags[i]!).filter((t) => t.tag === 'link').map((t) => [t.attrs.href!.replace(/^\/_converted\/styles\/[^.]+/, '/cut'), t.attrs.rel, t.attrs.fetchpriority]);
		assert.deepEqual(
			links.filter(([href]) => href!.endsWith('.woff2') || href!.endsWith('.css')).map(([href, rel, p]) => `${href} ${rel}${p ? ` ${p}` : ''}`),
			['/text.woff2 preload', '/icons.woff2 preload', '/site.css stylesheet', '/sans.woff2 preload low', '/mono.woff2 preload low'],
			heads,
		);
	} finally {
		server.close();
		await rm(app, { recursive: true, force: true });
	}
});
