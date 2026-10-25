import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A tab whose click handler arrives in a script after the tab has painted, padded with code that never runs. */
export async function serve(padding = 48_000): Promise<{ origin: string; server: Server }> {
	const page = `<!doctype html><html><head><title>Tabs</title><script src="/app.js" defer></script></head><body><main><h1>Tabs</h1><div role="tablist"><button role="tab" aria-selected="true">One</button><button role="tab" aria-selected="false">Two</button></div></main></body></html>`;
	const app = `function neverCalled() { return ${JSON.stringify('x'.repeat(padding))}; }
for (const tab of document.querySelectorAll('[role=tab]')) tab.addEventListener('click', () => { for (const t of document.querySelectorAll('[role=tab]')) t.setAttribute('aria-selected', String(t === tab)); });`;
	const server = createServer((req, res) => {
		if (req.url === '/app.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(app);
		else if (req.url === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(page);
		else res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
