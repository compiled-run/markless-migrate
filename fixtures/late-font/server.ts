// A page whose largest text paints with a web font it finds only in its stylesheet (`late`), the same page preloading
// that font (`preloaded`), and one whose largest content is an image (`image`). The stylesheet takes 200 ms and the font
// 100 ms, and at 250 ms the page fetches 400 kB of data, as an animation runtime does: found late, the font arrives after
// that fetch began, so Lighthouse's simulated LCP waits for the data too; preloaded, the heading paints before it.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { PNG } from 'pngjs';

export type Variant = 'late' | 'preloaded' | 'image';

const font = readFileSync(new URL('../vite-site/public/inter-latin.woff2', import.meta.url));
// The page finds the font only once its stylesheet has arrived and been parsed: one round trip later than a preload.
const css = '@font-face{font-family:Heading;font-weight:500;src:url(/heading.woff2) format("woff2")}body{margin:0;padding:24px;font:16px/1.5 system-ui}h1{font:500 48px/1.1 Heading,system-ui}';
// Noise, so Chrome counts it as contentful (it leaves out images with too few bits per pixel).
const hero = new PNG({ width: 380, height: 600 });
for (let i = 0; i < hero.data.length; i++) hero.data[i] = i % 4 === 3 ? 255 : (i * 2654435761) >>> 24;
const png = PNG.sync.write(hero);

const data = Buffer.from(Array.from({ length: 50_000 }, (_, i) => ((i * 2654435761) >>> 0).toString(36).padStart(8, '0')).join(''));
// Before the stylesheet, so the timer starts at once rather than after the stylesheet has arrived.
const later = '<script>setTimeout(() => fetch("/data.bin"), 250)</script>';
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

const page = (variant: Variant) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Late font</title>${variant === 'preloaded' ? '<link rel="preload" href="/heading.woff2" as="font" type="font/woff2" crossorigin>' : ''}${later}<link rel="stylesheet" href="/site.css"></head><body>${variant === 'image' ? '<img src="/hero.png" width="380" height="600" alt="">' : ''}<h1>The Build Tool for the Web</h1><p>Small print.</p></body></html>`;

export async function serve(variant: Variant): Promise<{ origin: string; server: Server }> {
	const server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://x').pathname;
		const gz = /gzip/.test(String(request.headers['accept-encoding'] ?? ''));
		const send = (type: string, body: Buffer | string) => {
			const raw = typeof body === 'string' ? Buffer.from(body) : body;
			response.writeHead(200, { 'content-type': type, ...(gz && !type.startsWith('font') && !type.startsWith('image') ? { 'content-encoding': 'gzip' } : {}) }).end(gz && !type.startsWith('font') && !type.startsWith('image') ? gzipSync(raw) : raw);
		};
		if (path === '/') return send('text/html; charset=utf-8', page(variant));
		if (path === '/site.css') return void (await wait(200), send('text/css', css));
		if (path === '/heading.woff2') return void (await wait(100), send('font/woff2', font));
		if (path === '/data.bin') return send('application/octet-stream', data);
		if (path === '/hero.png') return send('image/png', png);
		response.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
