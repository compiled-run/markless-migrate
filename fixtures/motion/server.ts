// Two-app fixture for the motion check: a sidebar category that collapses by animating its height, as Docusaurus's
// does. `animated` transitions it (and drops the transition when the visitor asks for reduced motion), `instant`
// has no transition, `same` serves `animated` again, and `reduced` keeps the transition under reduced motion too.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Variant = 'animated' | 'instant' | 'same' | 'reduced';

function page(variant: Variant): string {
	const transition = variant === 'instant' ? '' : '.items { transition: height 250ms ease-in-out; }';
	const reduce = variant === 'reduced' || variant === 'instant' ? '' : '@media (prefers-reduced-motion: reduce) { .items { transition: none; } }';
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Motion</title>
<style>
body { font: 16px/1.5 sans-serif; margin: 0; }
nav { width: 240px; padding: 16px; }
.toggle { display: block; width: 100%; text-align: left; padding: 6px 8px; border: 0; background: #fff; transition: background-color 150ms ease; }
.toggle:hover { background: #eee; }
.items { overflow: hidden; margin: 0; padding: 0 0 0 16px; list-style: none; }
${transition}
${reduce}
</style></head>
<body><main><nav aria-label="Docs">
<button class="toggle" type="button" aria-expanded="true" aria-controls="items">Getting Started</button>
<ul class="items" id="items"><li>Introduction</li><li>Installation</li><li>Configuration</li><li>Deployment</li></ul>
</nav><h1>Docs</h1></main>
<script>
const toggle = document.querySelector('.toggle');
const items = document.getElementById('items');
toggle.addEventListener('click', () => {
	const open = toggle.getAttribute('aria-expanded') === 'true';
	items.style.height = items.scrollHeight + 'px';
	void items.offsetHeight;
	items.style.height = open ? '0px' : items.scrollHeight + 'px';
	toggle.setAttribute('aria-expanded', String(!open));
});
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
