import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(n: number): string {
	let v = n < 0 ? (-n << 1) | 1 : n << 1;
	let out = '';
	do {
		let digit = v & 31;
		v >>>= 5;
		if (v) digit |= 32;
		out += B64[digit];
	} while (v);
	return out;
}

/** One script made of modules, each on lines of its own, and a source map giving every line its module and line. */
export function bundle(modules: readonly { readonly source: string; readonly code: string }[]): { code: string; map: string } {
	const lines: string[] = [];
	const segments: string[] = [];
	let source = 0;
	let line = 0;
	modules.forEach((m, index) => {
		m.code.split('\n').forEach((text, i) => {
			lines.push(text);
			segments.push(`${vlq(0)}${vlq(index - source)}${vlq(i - line)}${vlq(0)}`);
			source = index;
			line = i;
		});
	});
	return { code: lines.join('\n'), map: JSON.stringify({ version: 3, sources: modules.map((m) => m.source), mappings: segments.join(';') }) };
}

/** Text that compresses about as well as minified code does not: a fixed pseudo-random run of letters. */
function noise(length: number, seed: number): string {
	let x = seed;
	let out = '';
	for (let i = 0; i < length; i++) {
		x = (x * 1103515245 + 12345) % 2147483648;
		out += B64[x % 62];
	}
	return out;
}

export interface WasteFixture {
	/** Source path of the code the click needs. */
	readonly handler: string;
	/** A package the page imports and never calls. */
	readonly heavy: string;
	/** A library port in the registry that the page never uses. */
	readonly port: string;
	readonly registry: string;
	/** The control's role and the attribute that turns on. */
	readonly role: 'tab' | 'button';
}

/** A page whose script carries a heavy package and a library port nothing calls, beside the handler its first click runs; the source map is served hidden beside the script. */
export async function serve(fixture: WasteFixture, padding = 60_000): Promise<{ origin: string; server: Server; map: string }> {
	const state = fixture.role === 'tab' ? 'aria-selected' : 'aria-expanded';
	const heavy = Array.from({ length: 40 }, (_, i) => `function plot${i}(points) { const out = []; for (const p of points) out.push(p * ${i + 1}); return out.join(',') + ${JSON.stringify(noise(Math.floor(padding / 40), i + 1))}; }`).join('\n');
	const { code, map } = bundle([
		{ source: `../../${fixture.heavy}`, code: heavy },
		{ source: `../../${fixture.port}`, code: `function portClick(target) {\n  if (!target.closest('[cmdk-root]')) return false;\n  return ${JSON.stringify(noise(3200, 99))}.length > 0;\n}` },
		{ source: `../../${fixture.registry}`, code: `const PARTS = [{ click: portClick }, { draw: typeof plot0 }];` },
		{ source: fixture.handler, code: `for (const control of document.querySelectorAll('[role=${fixture.role}]')) control.addEventListener('click', () => {\n  for (const c of document.querySelectorAll('[role=${fixture.role}]')) c.setAttribute('${state}', String(c === control));\n});` },
	]);
	const controls = fixture.role === 'tab' ? '<div role="tablist"><button role="tab" aria-selected="true">One</button><button role="tab" aria-selected="false">Two</button></div>' : '<button role="button" aria-expanded="false">More</button>';
	const page = `<!doctype html><html><head><title>Waste</title><script type="application/json" data-state>${JSON.stringify({ rows: Array.from({ length: 50 }, (_, i) => i) })}</script><script src="/bundle.js" defer></script></head><body><main>${controls}</main></body></html>`;
	const server = createServer((req, res) => {
		if (req.url === '/bundle.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(code);
		else if (req.url === '/bundle.js.map') res.writeHead(200, { 'content-type': 'application/json' }).end(map);
		else if (req.url === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(page);
		else res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, map };
}
