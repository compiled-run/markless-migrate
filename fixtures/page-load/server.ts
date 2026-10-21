// Two-app fixture for the page-load check. `old` paints its heading from the HTML alone; `slow` shows the same page
// behind a 400 KB render-blocking script in its head, and also fetches 300 KB of animation data before the heading
// paints; `equal` serves `old` again.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Variant = 'old' | 'slow' | 'equal';

const body = `<main><h1>The Build Tool for the Web</h1><p>${'A fast page about a fast tool. '.repeat(20)}</p></main>`;
const style = '<style>body{font:16px/1.5 system-ui;margin:0;padding:24px;background:#111;color:#eee}h1{font-size:40px}</style>';
const page = (head: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page load</title>${style}${head}</head><body>${body}</body></html>`;
// Text a gzip pass cannot shrink much, so the bytes on the wire stay large.
const noise = (bytes: number) => Array.from({ length: bytes / 8 }, (_, i) => ((i * 2654435761) >>> 0).toString(36).padStart(8, '0')).join('');

const PAGES: Readonly<Record<Variant, string>> = {
	old: page(''),
	equal: page(''),
	slow: page(`<script src="/blocking.js"></script><script>fetch('/animation.bin')</script>`),
};

export async function serve(variant: Variant): Promise<{ origin: string; server: Server }> {
	const blocking = `window.__blocking = ${JSON.stringify(noise(400_000))}.length;`;
	const animation = noise(300_000);
	const server = createServer((request, response) => {
		const path = new URL(request.url ?? '/', 'http://x').pathname;
		if (path === '/blocking.js') return void response.writeHead(200, { 'content-type': 'text/javascript' }).end(blocking);
		if (path === '/animation.bin') return void response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(animation);
		if (path !== '/') return void response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGES[variant]);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
