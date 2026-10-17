/** How long one request of the checker's own (not the browser's) may take, body included. */
export const REQUEST_TIMEOUT_MS = Number(process.env.MARKLESS_MIGRATE_REQUEST_TIMEOUT_MS) || 30_000;

/** fetch that gives up on a server that stops answering part way through, and names the origin it could not reach. */
export async function request(url: string | URL, init: RequestInit = {}): Promise<Response> {
	const target = new URL(url);
	try {
		return await fetch(target, { ...init, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
	} catch (error) {
		throw unreachable(target, error);
	}
}

/** Reads a response body within the request's time limit, naming the origin when the connection drops part way. */
export async function bodyText(response: Response, url: string | URL): Promise<string> {
	try {
		return await response.text();
	} catch (error) {
		throw unreachable(new URL(url), error);
	}
}

function unreachable(url: URL, error: unknown): Error {
	const e = error as Error & { cause?: { code?: string; message?: string } };
	const why = e.name === 'TimeoutError' || e.name === 'AbortError' ? `no complete answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)} s` : (e.cause?.code ?? e.cause?.message ?? e.message);
	return new Error(`could not reach ${url.origin} (${url.pathname}${url.search}): ${why}`, { cause: error });
}
