import { createServer, request, type Server } from 'node:http';

/** The page a request asks for: a document path, or the page of a fragment URL under `fragmentPrefix`. */
export function pageOf(pathname: string, fragmentPrefix: string | undefined): string {
	const page = fragmentPrefix && pathname.startsWith(fragmentPrefix) ? `/${pathname.slice(fragmentPrefix.length)}` : pathname;
	return page.length > 1 ? page.replace(/\/+$/, '') : page;
}

/**
 * The port's origin during a verdict: every request is passed to the server on `target`, and a request for a page of the
 * site that this build does not hold is recorded, so the pages the routes navigate to can be built and the routes checked again.
 */
export function recordingProxy(target: number, port: number, outside: (page: string) => boolean, fragmentPrefix: string | undefined, seen: Set<string>): Promise<Server> {
	const server = createServer((req, res) => {
		const page = pageOf(new URL(req.url ?? '/', 'http://x').pathname, fragmentPrefix);
		// Only a browser's request is a visit: check also fetches every page's HTML from Node to plan its navigations.
		if (/Mozilla/.test(req.headers['user-agent'] ?? '') && outside(page)) seen.add(page);
		const upstream = request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: req.headers }, (answer) => {
			res.writeHead(answer.statusCode ?? 502, answer.headers);
			answer.pipe(res);
		});
		upstream.on('error', () => res.headersSent ? res.destroy() : res.writeHead(502).end());
		req.pipe(upstream);
	});
	return new Promise((done, fail) => {
		server.on('error', fail);
		server.listen(port, '127.0.0.1', () => done(server));
	});
}
