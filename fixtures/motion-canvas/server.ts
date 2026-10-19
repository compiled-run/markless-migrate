// Two-app fixture for a canvas animated from load, as a Rive hero is: a square crossing the canvas every 2 s, drawn on
// animation frames from the page's own clock. `late` starts the same drawing 400 ms later (start-time jitter, the same
// frames); `low` draws it 30 px lower (a real offset).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Variant = 'base' | 'late' | 'low';

function page(variant: Variant): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Canvas</title>
<style>body { font: 16px/1.5 sans-serif; margin: 0; padding: 24px; } canvas { display: block; width: 400px; height: 200px; }</style></head>
<body><main><h1>Hero</h1><canvas width="400" height="200"></canvas><button type="button" id="more">Learn more</button></main>
<script>
document.getElementById('more').addEventListener('click', () => document.title = 'Canvas');
const ctx = document.querySelector('canvas').getContext('2d');
const row = ${variant === 'low' ? 100 : 70};
let start;
const draw = (now) => {
	start ??= now;
	const x = ((now - start) % 2000) / 2000 * 340;
	ctx.fillStyle = '#eee';
	ctx.fillRect(0, 0, 400, 200);
	ctx.fillStyle = '#222';
	ctx.fillRect(x, row, 60, 60);
	requestAnimationFrame(draw);
};
setTimeout(() => requestAnimationFrame(draw), ${variant === 'late' ? 400 : 0});
</script></body></html>`;
}

export async function serve(variant: Variant): Promise<{ origin: string; server: Server }> {
	const server = createServer((request, response) => {
		if (new URL(request.url ?? '/', 'http://x').pathname !== '/') return void response.writeHead(404).end('not found');
		response.writeHead(200, { 'content-type': 'text/html' }).end(page(variant));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
