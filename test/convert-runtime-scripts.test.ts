import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { frameworkScriptsOf } from '../src/convert/runtime-scripts.ts';

// A Vite-built React app names no framework in its page: its entry imports a chunk that carries React.
test("a single-page app's entry and the chunks it imports are the old framework's code when one of them carries its runtime", async () => {
	const files: Record<string, string> = {
		'/assets/index-a1.js': 'import{j as e,c as r}from"./client-b2.js";import"./helper-c3.js";r(document.getElementById("root")).render(e("div",{}));',
		'/assets/client-b2.js': 'const t=Symbol.for("react.transitional.element");export const j=()=>t,c=()=>({render(){}});',
		'/assets/helper-c3.js': 'export const x=1;',
		'/analytics.js': 'window.dataLayer=[];',
	};
	const server = createServer((req, res) => (files[req.url ?? ''] ? res.writeHead(200, { 'content-type': 'text/javascript' }).end(files[req.url!]) : res.writeHead(404).end()));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		const html = '<html><head><script type="module" crossorigin src="/assets/index-a1.js"></script><link rel="modulepreload" href="/assets/client-b2.js"><script src="/analytics.js"></script></head><body><div id="root"></div></body></html>';
		const found = await frameworkScriptsOf(html, origin, new Map());
		assert.deepEqual([...found].sort(), ['/assets/client-b2.js', '/assets/index-a1.js']);
	} finally {
		server.close();
	}
});
