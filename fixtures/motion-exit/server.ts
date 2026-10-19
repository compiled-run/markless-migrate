// Two-app fixture for an exit animation's end: a modal whose backdrop fades out in 150 ms and whose panel fades out
// in 200 ms, as shadcn's dialog does over Radix. `presence` hides each element when its own exit ends, as Radix's
// Presence does; `shared` hides both when the panel's exit ends, so the backdrop, its fade over, shows at full
// opacity again for the last 50 ms (the flash). Both start the same animations.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Variant = 'presence' | 'shared';

function page(variant: Variant): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Modal</title>
<style>
body { font: 16px/1.5 sans-serif; margin: 0; }
@keyframes enter { from { opacity: 0; } }
@keyframes exit { to { opacity: 0; } }
.backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); }
.panel { position: fixed; top: 30%; left: 30%; width: 40%; padding: 24px; background: #fff; border-radius: 8px; }
[data-state=open] { animation: enter 150ms ease; }
.backdrop[data-state=closed] { animation: exit 150ms ease; }
.panel[data-state=closed] { animation: exit 200ms ease; }
</style></head>
<body><main><h1>Users</h1><button type="button" id="open">Add user</button></main>
<div class="backdrop" id="backdrop" hidden></div>
<div class="panel" role="dialog" aria-labelledby="title" id="panel" hidden><h2 id="title">Add user</h2><button type="button" id="close">Cancel</button></div>
<script>
const backdrop = document.getElementById('backdrop');
const panel = document.getElementById('panel');
document.getElementById('open').addEventListener('click', () => {
	for (const el of [backdrop, panel]) { el.hidden = false; el.dataset.state = 'open'; }
});
document.getElementById('close').addEventListener('click', () => {
	for (const el of [backdrop, panel]) el.dataset.state = 'closed';
	const variant = ${JSON.stringify(variant)};
	if (variant === 'presence') {
		for (const el of [backdrop, panel]) el.addEventListener('animationend', (e) => { if (e.target === el) el.hidden = true; }, { once: true });
	} else {
		panel.addEventListener('animationend', (e) => {
			if (e.target !== panel) return;
			panel.hidden = true;
			backdrop.hidden = true;
		}, { once: true });
	}
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
