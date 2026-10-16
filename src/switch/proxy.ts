import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type Server } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isSwitched } from './state.ts';

export type Side = 'old' | 'new';

export interface ProxyOptions {
	readonly old: string;
	readonly new: string;
	/** Switched routes, read on every request so `switch` takes effect without a restart. */
	readonly switched: () => readonly string[] | Promise<readonly string[]>;
	readonly host?: string;
	readonly port?: number;
	/** Called for every request with the side that answered it, for logs. */
	readonly log?: (line: string) => void;
}

export interface Proxy {
	readonly origin: string;
	readonly server: Server;
	close(): Promise<void>;
}

const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);

/** Whether the browser is loading a page into a tab, as opposed to a script, image, fetch or XHR. */
export function isNavigation(method: string, headers: IncomingHttpHeaders): boolean {
	if (method !== 'GET' && method !== 'HEAD') return false;
	const dest = headers['sec-fetch-dest'];
	if (dest) return dest === 'document';
	return /text\/html/.test(String(headers.accept ?? ''));
}

/** The page the request was made from, as a path on the proxy, when the Referer is the proxy itself. */
function refererPath(headers: IncomingHttpHeaders): string | undefined {
	const referer = headers.referer;
	if (!referer || !headers.host) return undefined;
	try {
		const url = new URL(referer);
		return url.host === headers.host ? url.pathname : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The sides to try, in order. A page load goes to the side its route is switched to, with no fallback (an unknown path is
 * the old app's 404). Anything else (assets, fetches, form posts) goes first to the side that served the page it came
 * from, then to the other when that side does not have it.
 */
export function route(method: string, path: string, headers: IncomingHttpHeaders, switched: readonly string[]): Side[] {
	const own: Side = isSwitched(switched, path) ? 'new' : 'old';
	if (isSwitched(switched, path) || isNavigation(method, headers)) return [own];
	const from = refererPath(headers);
	const first: Side = from === undefined ? own : isSwitched(switched, from) ? 'new' : 'old';
	return [first, first === 'old' ? 'new' : 'old'];
}

const MISSING = new Set([404, 405, 410, 501]);

function domainMatches(host: string, domain: string): boolean {
	const d = domain.replace(/^\./, '').toLowerCase();
	const h = host.toLowerCase();
	return h === d || h.endsWith(`.${d}`);
}

/** Drops a cookie's Domain when it would not apply to the proxy's host, so the browser keeps it there instead of rejecting it. */
export function rewriteSetCookie(cookie: string, proxyHost: string): string {
	return cookie
		.split(';')
		.filter((part) => {
			const [name, value] = part.split('=');
			return name?.trim().toLowerCase() !== 'domain' || domainMatches(proxyHost, (value ?? '').trim());
		})
		.join(';');
}

/** Points a redirect at either app's own origin back at the proxy, keeping path, query and fragment. */
export function rewriteLocation(location: string, upstreams: readonly string[], proxyOrigin: string): string {
	for (const upstream of upstreams) {
		const base = new URL(upstream);
		let url: URL;
		try {
			url = new URL(location, base);
		} catch {
			return location;
		}
		if (/^[a-z][\w+.-]*:|^\/\//i.test(location) && url.host === base.host) return `${proxyOrigin}${url.pathname}${url.search}${url.hash}`;
	}
	return location;
}

function upstreamHeaders(req: IncomingMessage, target: URL, proxyOrigin: string): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {};
	for (const [name, value] of Object.entries(req.headers)) {
		if (value === undefined || HOP.has(name)) continue;
		out[name] = value;
	}
	out.host = target.host;
	if (typeof out.origin === 'string' && out.origin === proxyOrigin) out.origin = target.origin;
	if (typeof out.referer === 'string' && out.referer.startsWith(`${proxyOrigin}/`)) out.referer = target.origin + out.referer.slice(proxyOrigin.length);
	const proxy = new URL(proxyOrigin);
	out['x-forwarded-host'] = proxy.host;
	out['x-forwarded-proto'] = proxy.protocol.slice(0, -1);
	out['x-forwarded-for'] = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
	return out;
}

function send(target: URL, method: string, headers: Record<string, string | string[]>, body: Buffer): Promise<IncomingMessage> {
	return new Promise((resolve, reject) => {
		const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method, headers: { ...headers, ...(body.length ? { 'content-length': String(body.length) } : {}) } }, resolve);
		request.on('error', reject);
		request.end(body);
	});
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks);
}

/** Serves switched routes from the new app and everything else from the old one, on one origin, so both share cookies. */
export async function startProxy(options: ProxyOptions): Promise<Proxy> {
	const origins: Record<Side, string> = { old: new URL(options.old).origin, new: new URL(options.new).origin };
	const server = createServer(async (req, res) => {
		const method = req.method ?? 'GET';
		const proxyOrigin = `http://${req.headers.host ?? 'localhost'}`;
		const url = new URL(req.url ?? '/', proxyOrigin);
		try {
			const sides = route(method, url.pathname, req.headers, await options.switched());
			const body = await readBody(req);
			let answer: { side: Side; response: IncomingMessage } | undefined;
			for (const [i, side] of sides.entries()) {
				const target = new URL(url.pathname + url.search, origins[side]);
				const response = await send(target, method, upstreamHeaders(req, target, proxyOrigin), body);
				if (i < sides.length - 1 && MISSING.has(response.statusCode ?? 0)) {
					response.resume();
					continue;
				}
				answer = { side, response };
				break;
			}
			const { side, response } = answer!;
			const headers: Record<string, string | string[]> = {};
			for (const [name, value] of Object.entries(response.headers)) {
				if (value === undefined || HOP.has(name)) continue;
				if (name === 'set-cookie') headers[name] = (value as string[]).map((c) => rewriteSetCookie(c, url.hostname));
				else if (name === 'location') headers[name] = rewriteLocation(String(value), [origins.old, origins.new], proxyOrigin);
				else headers[name] = value;
			}
			headers['x-markless-migrate-side'] = side;
			res.writeHead(response.statusCode ?? 502, headers);
			response.pipe(res);
			options.log?.(`${side.padEnd(3)} ${response.statusCode} ${method} ${url.pathname}${url.search}`);
		} catch (error) {
			if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(`markless-migrate proxy: ${(error as Error).message}\n`);
			options.log?.(`err 502 ${method} ${url.pathname}: ${(error as Error).message}`);
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('proxy has no port');
	const host = address.family === 'IPv6' ? `[${address.address}]` : address.address;
	return {
		origin: `http://${host}:${address.port}`,
		server,
		close: () => {
			server.closeAllConnections();
			return new Promise((done) => server.close(() => done()));
		},
	};
}
