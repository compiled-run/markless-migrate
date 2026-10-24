// Two-app fixture for a disclosure's height animation, as shadcn's accordion animates Base UI's panel: keyframes from
// height 0 to var(--accordion-panel-height) on open and back on close. `measured` mounts the panel with the variable
// set to the content's measured height and keeps a closing panel mounted until its exit animation ends, as Base UI
// does; `auto` mounts it with the variable left at `auto` (the open animation runs, but height cannot interpolate to
// auto, so the panel jumps open half way) and removes it as soon as it closes (no exit animation at all).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Variant = 'measured' | 'auto';

function page(variant: Variant): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>FAQ</title>
<style>
body { font: 16px/1.5 sans-serif; margin: 0; padding: 24px; }
@keyframes accordion-down { from { height: 0; } to { height: var(--accordion-panel-height); } }
@keyframes accordion-up { from { height: var(--accordion-panel-height); } to { height: 0; } }
.panel { overflow: hidden; }
.panel[data-open] { animation: accordion-down 200ms ease-out; }
.panel[data-closed] { animation: accordion-up 200ms ease-out; }
.panel p { margin: 0; padding: 8px 0; }
</style></head>
<body><main><h1>FAQ</h1><div class="item"><h3><button type="button" id="trigger" aria-expanded="false">What is your return policy?</button></h3><div id="slot"></div></div><p>After the list.</p></main>
<template id="panel"><div class="panel" role="region" aria-labelledby="trigger" style="--accordion-panel-height: auto"><p>Returns are accepted within 30 days of delivery.</p><p>Items must be unused and in their original packaging.</p><p>Refunds reach the original payment method within a week.</p></div></template>
<script>
const variant = ${JSON.stringify(variant)};
const trigger = document.getElementById('trigger');
const slot = document.getElementById('slot');
let panel = null;
trigger.addEventListener('click', () => {
	const open = trigger.getAttribute('aria-expanded') !== 'true';
	trigger.setAttribute('aria-expanded', String(open));
	if (open) {
		if (panel) panel.remove();
		panel = document.getElementById('panel').content.firstElementChild.cloneNode(true);
		panel.setAttribute('data-open', '');
		slot.append(panel);
		if (variant === 'measured') {
			panel.style.setProperty('--accordion-panel-height', panel.scrollHeight + 'px');
			panel.addEventListener('animationend', () => panel.style.setProperty('--accordion-panel-height', 'auto'), { once: true });
		}
		return;
	}
	const closing = panel;
	if (variant === 'auto') {
		closing.remove();
		panel = null;
		return;
	}
	closing.style.setProperty('--accordion-panel-height', closing.scrollHeight + 'px');
	closing.removeAttribute('data-open');
	closing.setAttribute('data-closed', '');
	closing.addEventListener('animationend', () => {
		closing.remove();
		if (panel === closing) panel = null;
	}, { once: true });
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
