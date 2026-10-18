import type { BrowserContext, Page, Response } from 'playwright';
import type { Infrastructure, InfrastructureCause } from './types.ts';

/** How long one page load may take before it is retried, then reported as an infrastructure failure. */
export const LOAD_TIMEOUT_MS = Number(process.env.MARKLESS_MIGRATE_LOAD_TIMEOUT_MS) || 30_000;
/** The wait before a page load or request that failed for want of a network answer is tried again. */
export const RETRY_BACKOFF_MS = Number(process.env.MARKLESS_MIGRATE_RETRY_BACKOFF_MS) || 2_000;

const DNS = /\b(ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ENOTFOUND|EAI_AGAIN)\b/;
const CONNECT = /\b(ERR_CONNECTION_(REFUSED|RESET|CLOSED|TIMED_OUT|FAILED|ABORTED)|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_TIMED_OUT|ERR_SSL_PROTOCOL_ERROR|ERR_CERT_[A-Z_]+|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET)\b/;

/** Thrown when an app could not be reached or did not answer in time: the network's failure, not the app's. */
export class InfrastructureError extends Error {
	readonly infrastructure: Omit<Infrastructure, 'side'>;
	constructor(infrastructure: Omit<Infrastructure, 'side'>, options?: { cause?: unknown }) {
		super(infrastructure.message, options);
		this.name = 'InfrastructureError';
		this.infrastructure = infrastructure;
	}
}

const errorText = (error: unknown): string => {
	const e = error as Error & { cause?: { code?: string; message?: string } };
	return [e?.name, e?.message, e?.cause?.code, e?.cause?.message].filter(Boolean).join(' ');
};

/** What kind of network failure an error is, with the code that names it; undefined for any other error. */
export function classify(error: unknown): { cause: InfrastructureCause; code: string } | undefined {
	if (error instanceof InfrastructureError) return { cause: error.infrastructure.cause, code: error.infrastructure.code ?? '' };
	const text = errorText(error);
	const dns = DNS.exec(text);
	if (dns) return { cause: 'dns', code: dns[1]! };
	const connect = CONNECT.exec(text);
	if (connect) return { cause: 'connect', code: connect[1]! };
	if ((error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError' || /\bTimeout \d+ms exceeded\b/.test(text)) return { cause: 'timeout', code: 'timeout' };
	return undefined;
}

export function describe(cause: InfrastructureCause, code: string, url: URL, timeoutMs: number): string {
	const where = `${url.origin} (${url.pathname}${url.search})`;
	if (cause === 'dns') return `DNS: ${url.hostname} does not resolve (${code}), so ${where} was not loaded`;
	if (cause === 'connect') return `could not connect to ${where}: ${code}`;
	return `${where} did not finish loading within ${Math.round(timeoutMs / 1000)} s`;
}

export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Loads a page, retrying once after a backoff when the network fails it; a second failure is an InfrastructureError naming the cause. */
export async function loadPage(page: Page, url: string, options: { timeout?: number; backoffMs?: number } = {}): Promise<Response | null> {
	const timeout = options.timeout ?? LOAD_TIMEOUT_MS;
	for (let attempt = 0; ; attempt++) {
		try {
			return await page.goto(url, { waitUntil: 'load', timeout });
		} catch (error) {
			const kind = classify(error);
			if (!kind) throw error;
			if (attempt === 0) {
				// A load still pending aborts the next one; leave it first.
				await page.goto('about:blank').catch(() => {});
				await sleep(options.backoffMs ?? RETRY_BACKOFF_MS);
				continue;
			}
			const message = `${describe(kind.cause, kind.code, new URL(url), timeout)}, twice, ${Math.round((options.backoffMs ?? RETRY_BACKOFF_MS) / 100) / 10} s apart`;
			throw new InfrastructureError({ cause: kind.cause, code: kind.code, origin: new URL(url).origin, message }, { cause: error });
		}
	}
}

/** The browser contexts one route's check opened, so a check past its deadline can be stopped. */
export class Scope {
	closed = false;
	readonly contexts = new Set<BrowserContext>();
	track(context: BrowserContext): void {
		if (this.closed) {
			void context.close().catch(() => {});
			throw new InfrastructureError({ cause: 'check timeout', message: 'the route check was stopped at its deadline' });
		}
		this.contexts.add(context);
		context.on('close', () => this.contexts.delete(context));
	}
	async close(): Promise<void> {
		this.closed = true;
		await Promise.all([...this.contexts].map((c) => c.close().catch(() => {})));
	}
}
