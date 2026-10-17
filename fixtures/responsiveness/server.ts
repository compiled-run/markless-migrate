// Two-app fixture for the responsiveness check. `old` answers in the page and navigates in the page; `slow` imports a
// 500 KB module on the first click (sent 150 ms late, as over a phone's network) and loads the next page in full
// from a server that takes `delayMs`; `equal` serves `old` again.
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Variant = 'old' | 'slow' | 'equal';

export const dir = (variant: Variant) => new URL(`./${variant === 'slow' ? 'slow' : 'old'}/`, import.meta.url).pathname;

// About 500 KB of module that also does work when it is evaluated, like a component library pulled in on demand.
const big = `${Array.from({ length: 6000 }, (_, i) => `export const row${i} = ${JSON.stringify({ id: i, label: `row ${i} ${'x'.repeat(40)}` })};`).join('\n')}
const table = []; for (let i = 0; i < 200000; i++) table.push(i * 2);
export function add(n) { return n + 1 + table.length * 0; }
`;

export async function serve(variant: Variant, delayMs = 0): Promise<{ origin: string; server: Server }> {
	const server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://x').pathname;
		if (path === '/big.js') {
			await new Promise((done) => setTimeout(done, 150));
			return void response.writeHead(200, { 'content-type': 'text/javascript' }).end(big);
		}
		if (path !== '/' && path !== '/next') return void response.writeHead(404).end('not found');
		if (path === '/next' && delayMs) await new Promise((done) => setTimeout(done, delayMs));
		response.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(`${dir(variant)}${path === '/' ? 'index' : 'next'}.html`));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
