// Loaded into a command-line tool under test with `node --import`: logs every request it makes, and serves recorded responses so the old and new tool see the same network.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const LOG = process.env.MARKLESS_MIGRATE_CLI_LOG;
const FIXTURES = process.env.MARKLESS_MIGRATE_CLI_FIXTURES;
/** `replay` serves fixtures and refuses the rest, `record` goes to the network and saves what fetch got, `live` goes to the network. */
const MODE = process.env.MARKLESS_MIGRATE_CLI_NETWORK ?? 'replay';
const MAX_BODY = 1024 * 1024;

const fixtures = FIXTURES && existsSync(FIXTURES) ? JSON.parse(readFileSync(FIXTURES, 'utf8')) : {};
const note = (entry) => {
	if (LOG) appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
};
const textual = (type) => /json|text|xml|javascript|graphql|x-www-form-urlencoded/.test(type ?? '');

const realFetch = globalThis.fetch;
globalThis.fetch = async function conformedFetch(input, init) {
	const request = new Request(input, init);
	const type = request.headers.get('content-type') ?? '';
	const body = request.body && textual(type) ? await request.clone().text() : undefined;
	const key = `${request.method} ${request.url}`;
	note({ via: 'fetch', method: request.method, url: request.url, ...(body ? { body } : {}) });
	if (MODE === 'replay') {
		const hit = fixtures[key];
		if (!hit) throw new TypeError('fetch failed', { cause: new Error(`markless-migrate: no recorded response for ${key}`) });
		return new Response(hit.body, { status: hit.status, headers: hit.headers });
	}
	const response = await realFetch(request);
	if (MODE === 'record') {
		const contentType = response.headers.get('content-type') ?? '';
		fixtures[key] = { status: response.status, headers: contentType ? { 'content-type': contentType } : {}, body: textual(contentType) ? (await response.clone().text()).slice(0, MAX_BODY) : '' };
		writeFileSync(FIXTURES, `${JSON.stringify(fixtures, null, '\t')}\n`);
	}
	return response;
};

// node:http(s) clients: logged by method and URL; under replay they fail as if offline, the same on both sides.
for (const mod of [http, https]) {
	const protocol = mod === https ? 'https:' : 'http:';
	for (const name of ['request', 'get']) {
		const real = mod[name];
		mod[name] = function conformedRequest(...args) {
			const options = typeof args[0] === 'string' || args[0] instanceof URL ? new URL(args[0]) : (args[0] ?? {});
			const url = options instanceof URL ? options.href : `${options.protocol ?? protocol}//${options.hostname ?? options.host ?? 'localhost'}${options.port ? `:${options.port}` : ''}${options.path ?? '/'}`;
			const method = (options instanceof URL ? (typeof args[1] === 'object' && args[1]?.method) || 'GET' : options.method ?? 'GET').toUpperCase();
			note({ via: `node:${protocol.slice(0, -1)}`, method, url });
			const req = real.apply(this, args);
			if (MODE === 'replay') process.nextTick(() => req.destroy(Object.assign(new Error(`connect ECONNREFUSED (markless-migrate replays fetch only: ${method} ${url})`), { code: 'ECONNREFUSED' })));
			return req;
		};
	}
}
