import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { roundRobin } from '../deploy/shadcn-ui/round-robin.ts';

const servers: Server[] = [];
after(() => {
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});
const listen = (s: Server) => new Promise<number>((done) => { servers.push(s); s.listen(0, '127.0.0.1', () => done((s.address() as AddressInfo).port)); });

test('requests are spread over the servers in turn, each answered byte for byte with its status and headers, and the Host the browser sent', async () => {
	const ports = await Promise.all([0, 1].map((n) => listen(createServer((req, res) => {
		res.writeHead(n ? 201 : 200, { 'x-server': String(n), 'cache-control': 'max-age=60', 'set-cookie': ['a=1', 'b=2'] }).end(`${n} ${req.method} ${req.url} ${req.headers.host}`);
	}))));
	const front = await listen(roundRobin(ports.map((p) => `http://127.0.0.1:${p}`)));
	const answers = [];
	for (let i = 0; i < 4; i++) {
		const r = await fetch(`http://127.0.0.1:${front}/docs?x=${i}`, { method: i === 3 ? 'POST' : 'GET', ...(i === 3 ? { body: 'payload' } : {}) });
		answers.push([r.status, r.headers.get('x-server'), r.headers.get('set-cookie'), r.headers.get('cache-control'), Buffer.from(await r.arrayBuffer()).toString('latin1')]);
	}
	assert.deepEqual(answers.map((a) => a[1]), ['0', '1', '0', '1']);
	assert.deepEqual(answers[1]!.slice(0, 4), [201, '1', 'a=1, b=2', 'max-age=60']);
	assert.equal(answers[0]![4], `0 GET /docs?x=0 127.0.0.1:${front}`);
	assert.equal(answers[3]![4], `1 POST /docs?x=3 127.0.0.1:${front}`);
});
