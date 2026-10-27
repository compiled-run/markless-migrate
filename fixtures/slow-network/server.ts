import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

/** A tab whose click handler arrives in a script after the tab has painted, padded with code that never runs; `firefoxOnly` bytes of a blocking script only Firefox requests; `gzip` compresses the page and its script for a browser that accepts it. */
export async function serve(padding = 48_000, font = 0, tabs = true, css = 0, firefoxOnly = 0, gzip = false): Promise<{ origin: string; server: Server }> {
	const style = font ? `<style>@font-face{font-family:Late;src:url(/late.woff2)format("woff2");font-display:swap}body{font-family:Late,sans-serif}button{all:unset}</style>` : '';
	const sheet = css ? '<link rel="stylesheet" href="/blocking.css">' : '';
	const gecko = firefoxOnly ? `<script>if (/Firefox\\//.test(navigator.userAgent)) document.write('<script src="/firefox-only.js"><\\/script>')</script>` : '';
	const page = `<!doctype html><html><head><title>Tabs</title>${style}${sheet}${gecko}<script src="/app.js" defer></script></head><body><main><h1>Tabs</h1>${tabs ? '' : '<!--'}<div role="tablist"><button role="tab" aria-selected="true">One</button><button role="tab" aria-selected="false">Two</button></div>${tabs ? '' : '-->'}</main></body></html>`;
	const app = `function neverCalled() { return ${JSON.stringify('x'.repeat(padding))}; }
for (const tab of document.querySelectorAll('[role=tab]')) tab.addEventListener('click', () => { for (const t of document.querySelectorAll('[role=tab]')) t.setAttribute('aria-selected', String(t === tab)); });`;
	const server = createServer((req, res) => {
		const text = (type: string, body: string) => (gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'])) ? res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' }).end(gzipSync(body)) : res.writeHead(200, { 'content-type': type }).end(body));
		if (req.url === '/blocking.css') res.writeHead(200, { 'content-type': 'text/css' }).end(`/*${'x'.repeat(css)}*/h1{color:#123}`);
		else if (req.url === '/late.woff2') res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.alloc(font, 3));
		else if (req.url === '/firefox-only.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(`/*${'x'.repeat(firefoxOnly)}*/`);
		else if (req.url === '/app.js') text('text/javascript', app);
		else if (req.url === '/') text('text/html', page);
		else res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
