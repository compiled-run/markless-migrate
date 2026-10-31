// One address in front of several copies of the old site's server, each request to the next copy in turn: a single
// `next start` answering many cold loads at once was what a probe or check runner waited on.
// Usage: node round-robin.ts <port> <origin>...
import { createServer, request, Agent, type Server } from 'node:http';

export function roundRobin(origins: readonly string[]): Server {
	const agent = new Agent({ keepAlive: true });
	let next = 0;
	return createServer((req, res) => {
		const target = new URL(origins[next++ % origins.length]!);
		const out = request({ host: target.hostname, port: target.port, method: req.method, path: req.url, headers: req.headers, agent }, (answer) => {
			res.writeHead(answer.statusCode ?? 502, answer.rawHeaders);
			answer.pipe(res);
		});
		out.on('error', (error) => {
			if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
			res.end(`round-robin: ${error.message}`);
		});
		req.pipe(out);
	});
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [port, ...origins] = process.argv.slice(2);
	if (!port || !origins.length) throw new Error('usage: round-robin.ts <port> <origin>...');
	roundRobin(origins).listen(Number(port));
}
