// Loaded into the app's Node server with `node --import`: records the requests each page load makes while the server renders it, and replays recorded responses on request.
import { AsyncLocalStorage } from 'node:async_hooks';
import http from 'node:http';
import https from 'node:https';

const CONTROL = '/__markless-migrate/';
const HEADER = 'x-markless-migrate';
const MAX_BODY = 256 * 1024;
const MAX_LOADS = 500;
const store = new AsyncLocalStorage();
/** @type {Map<string, {records: object[], pending: Set<Promise<unknown>>}>} */
const loads = new Map();
/** @type {Map<string, object[]>} */
const datasets = new Map();

function parseTag(value) {
	if (typeof value !== 'string') return undefined;
	const tag = Object.fromEntries(value.split(';').map((part) => part.trim().split('=')).filter(([k, v]) => k && v));
	return tag.load ? tag : undefined;
}

function loadFor(id) {
	let load = loads.get(id);
	if (!load) {
		load = { records: [], pending: new Set() };
		loads.set(id, load);
		if (loads.size > MAX_LOADS) loads.delete(loads.keys().next().value);
	}
	return load;
}

const textual = (type) => /json|text|xml|javascript|graphql|x-www-form-urlencoded/.test(type);
const mime = (value) => (value ?? '').split(';')[0].trim().toLowerCase();

function queryKey(url) {
	const u = new URL(url);
	return `${u.pathname}?${[...u.searchParams].sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b))).map(([k, v]) => `${k}=${v}`).join('&')}`;
}

// Exact URL first; then the same path and query on any host, so an app pointed at another backend still gets the recording.
function lookup(set, method, url, body) {
	const responses = datasets.get(set) ?? [];
	const same = (r) => r.side === 'server' && r.method === method && (r.requestBody ?? '') === (body ?? '');
	return responses.find((r) => same(r) && r.url === url) ?? responses.find((r) => same(r) && queryKey(r.url) === queryKey(url));
}

const realFetch = globalThis.fetch;
globalThis.fetch = async function recordedFetch(input, init) {
	const tag = store.getStore();
	if (!tag) return realFetch(input, init);
	let request;
	try {
		request = new Request(input, init);
	} catch {
		return realFetch(input, init);
	}
	const load = loadFor(tag.load);
	const requestType = mime(request.headers.get('content-type'));
	const requestBody = request.body && textual(requestType) ? await request.clone().text() : undefined;
	const base = { side: 'server', method: request.method, url: request.url, ...(requestType ? { requestType } : {}), ...(requestBody ? { requestBody } : {}) };
	const hit = tag.data ? lookup(tag.data, request.method, request.url, requestBody) : undefined;
	if (hit) {
		load.records.push({ ...base, status: hit.status, contentType: hit.contentType, body: hit.body, replayed: true, recordedUrl: hit.url });
		return new Response(hit.body, { status: hit.status, headers: { 'content-type': hit.contentType } });
	}
	const response = await realFetch(request);
	const contentType = mime(response.headers.get('content-type'));
	const record = { ...base, status: response.status, contentType };
	load.records.push(record);
	if (textual(contentType)) {
		const reading = response
			.clone()
			.text()
			.then((text) => {
				record.body = text.slice(0, MAX_BODY);
			})
			.catch(() => {})
			.finally(() => load.pending.delete(reading));
		load.pending.add(reading);
	}
	return response;
};

// node:http(s) clients (axios, got, SDKs): method, URL and status only.
for (const mod of [http, https]) {
	const protocol = mod === https ? 'https:' : 'http:';
	for (const name of ['request', 'get']) {
		const real = mod[name];
		mod[name] = function recordedRequest(...args) {
			const req = real.apply(this, args);
			const tag = store.getStore();
			if (!tag) return req;
			const options = typeof args[0] === 'string' || args[0] instanceof URL ? new URL(args[0]) : args[0] ?? {};
			const url = options instanceof URL ? options.href : `${options.protocol ?? protocol}//${options.hostname ?? options.host ?? 'localhost'}${options.port ? `:${options.port}` : ''}${options.path ?? '/'}`;
			const record = { side: 'server', method: (req.method ?? 'GET').toUpperCase(), url, status: 0, contentType: '' };
			loadFor(tag.load).records.push(record);
			req.once('response', (res) => {
				record.status = res.statusCode ?? 0;
				record.contentType = mime(res.headers['content-type']);
			});
			return req;
		};
	}
}

function allowed(req) {
	const token = process.env.MARKLESS_MIGRATE_TOKEN;
	if (token) return req.headers['x-markless-migrate-token'] === token;
	const address = req.socket.remoteAddress ?? '';
	return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function control(req, res) {
	const url = new URL(req.url, 'http://recorder');
	const send = (status, value) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
	if (!allowed(req)) return send(403, { error: 'the request recorder answers loopback callers, or callers sending MARKLESS_MIGRATE_TOKEN' });
	if (url.pathname === `${CONTROL}requests`) {
		const load = loads.get(url.searchParams.get('load') ?? '');
		if (!load) return send(200, { recorder: 1, records: [] });
		const wait = new Promise((done) => setTimeout(done, 2000));
		Promise.race([Promise.all([...load.pending]), wait]).then(() => send(200, { recorder: 1, records: load.records }));
		return;
	}
	if (url.pathname === `${CONTROL}data` && req.method === 'PUT') {
		const chunks = [];
		req.on('data', (chunk) => chunks.push(chunk));
		req.on('end', () => {
			try {
				datasets.set(url.searchParams.get('set') ?? '', JSON.parse(Buffer.concat(chunks).toString('utf8')).responses ?? []);
				send(200, { recorder: 1 });
			} catch (error) {
				send(400, { error: String(error) });
			}
		});
		return;
	}
	send(200, { recorder: 1 });
}

for (const Server of [http.Server, https.Server]) {
	const emit = Server.prototype.emit;
	Server.prototype.emit = function recordedEmit(event, ...args) {
		if (event !== 'request') return emit.call(this, event, ...args);
		const [req, res] = args;
		if (req.url?.startsWith(CONTROL)) {
			control(req, res);
			return true;
		}
		const tag = parseTag(req.headers[HEADER]);
		if (!tag) return emit.call(this, event, ...args);
		return store.run(tag, () => emit.call(this, event, ...args));
	};
}
