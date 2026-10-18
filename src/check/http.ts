import { classify, InfrastructureError, RETRY_BACKOFF_MS, sleep } from './infrastructure.ts';

/** How long one request of the checker's own (not the browser's) may take, body included. */
export const REQUEST_TIMEOUT_MS = Number(process.env.MARKLESS_MIGRATE_REQUEST_TIMEOUT_MS) || 30_000;

/** fetch that gives up on a server that stops answering part way through, tries a read once more after a backoff, and names the origin it could not reach. */
export async function request(url: string | URL, init: RequestInit = {}): Promise<Response> {
	const target = new URL(url);
	const read = !init.method || /^(GET|HEAD)$/i.test(init.method);
	for (let attempt = 0; ; attempt++) {
		try {
			return await fetch(target, { ...init, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		} catch (error) {
			if (read && attempt === 0 && !init.signal && classify(error)) {
				await sleep(RETRY_BACKOFF_MS);
				continue;
			}
			throw unreachable(target, error);
		}
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
	const kind = classify(error);
	const why = kind?.cause === 'timeout' ? `no complete answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)} s` : (e.cause?.code ?? e.cause?.message ?? e.message);
	const message = `could not reach ${url.origin} (${url.pathname}${url.search}): ${kind?.cause === 'dns' ? `DNS: ${url.hostname} does not resolve (${why})` : why}`;
	return kind ? new InfrastructureError({ cause: kind.cause, code: kind.code, origin: url.origin, message }, { cause: error }) : new Error(message, { cause: error });
}
