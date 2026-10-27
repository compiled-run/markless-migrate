// Serves on `port` what the server on `upstream` answers, gzipped as `next start` serves the old side: a node-server port compresses nothing itself.
import { createServer, request } from 'node:http';
import { send } from './gzip.mjs';

const [upstream, port] = process.argv.slice(2);
if (!upstream || !port) throw new Error('usage: serve-gzipped.mjs <upstream port> <port>');

createServer((req, res) => {
	const forward = request({ host: '127.0.0.1', port: Number(upstream), method: req.method, path: req.url, headers: req.headers }, (answer) => {
		const length = answer.headers['content-length'] === undefined ? undefined : Number(answer.headers['content-length']);
		send(req, res, answer.statusCode ?? 502, answer.headers, answer, length);
	});
	forward.on('error', (error) => {
		if (!res.headersSent) res.writeHead(502);
		res.end(String(error?.stack ?? error));
	});
	req.pipe(forward);
}).listen(Number(port), '127.0.0.1', () => console.log(`serving http://127.0.0.1:${upstream} gzipped on http://127.0.0.1:${port}`));
