// Serves hn-snapshot.json.gz as the Hacker News Firebase REST API (/v0/<path>.json): node deploy/hn-graphql/hn-api.mjs [port]
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';

const { data } = JSON.parse(gunzipSync(readFileSync(new URL('./hn-snapshot.json.gz', import.meta.url))).toString('utf8'));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4870);
createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/v0\//, '').replace(/\.json$/, '');
	res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
	res.end(JSON.stringify(data[path] ?? null));
}).listen(port, '127.0.0.1', () => console.log(`HN snapshot API on http://127.0.0.1:${port}/v0`));
