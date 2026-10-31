import type { BrowserContext, Frame, Page, Request, Response } from 'playwright';
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
	// What the load is still waiting on when it times out: the request that holds the load event back.
	const waiting = new Map<Request, number>();
	const sent = (r: Request) => void waiting.set(r, Date.now());
	const done = (r: Request) => void waiting.delete(r);
	page.on('request', sent);
	page.on('requestfinished', done);
	page.on('requestfailed', done);
	const held = () => {
		// A fetch or a socket does not hold the load event back; what the document itself asked for does.
		const oldest = [...waiting].filter(([r]) => !/^(fetch|xhr|eventsource|websocket|ping|preflight)$/.test(r.resourceType())).sort((a, b) => a[1] - b[1]).slice(0, 3);
		return oldest.length ? `; still waiting on ${oldest.map(([r, at]) => `${r.url().slice(0, 140)} (${r.resourceType()}, ${Math.round((Date.now() - at) / 1000)} s)`).join(', ')}` : '; no request was still waiting';
	};
	try {
		return await loadWithRetry();
	} finally {
		page.off('request', sent);
		page.off('requestfinished', done);
		page.off('requestfailed', done);
	}
	async function loadWithRetry(): Promise<Response | null> {
	for (let attempt = 0; ; attempt++) {
		waiting.clear();
		try {
			return await page.goto(url, { waitUntil: 'load', timeout });
		} catch (error) {
			// The about:blank left before a retry can commit after its own goto returned, and abort the retried load.
			if (attempt === 1 && /interrupted by another navigation to "about:blank"/.test(errorText(error))) continue;
			const kind = classify(error);
			if (!kind) throw error;
			if (attempt === 0) {
				// A load still pending aborts the next one; leave it first.
				await page.goto('about:blank').catch(() => {});
				await sleep(options.backoffMs ?? RETRY_BACKOFF_MS);
				continue;
			}
			const message = `${describe(kind.cause, kind.code, new URL(url), timeout)}, twice, ${Math.round((options.backoffMs ?? RETRY_BACKOFF_MS) / 100) / 10} s apart${kind.cause === 'timeout' ? held() : ''}`;
			throw new InfrastructureError({ cause: kind.cause, code: kind.code, origin: new URL(url).origin, message }, { cause: error });
		}
	}
	}
}

/** The browser contexts one route's check opened, so a check past its deadline can be stopped. */
export class Scope {
	closed = false;
	readonly contexts = new Set<BrowserContext>();
	/** Requests the route's pages are waiting on, by when each was sent; when each origin last answered, and when a request last failed. */
	readonly waiting = new Map<Request, { url: string; at: number }>();
	readonly answered = new Map<string, number>();
	/** When each frame last committed a navigation. */
	private readonly navigated = new WeakMap<Frame, number>();
	failed = 0;
	track(context: BrowserContext): void {
		if (this.closed) {
			void context.close().catch(() => {});
			throw new InfrastructureError({ cause: 'check timeout', message: 'the route check was stopped at its deadline' });
		}
		this.contexts.add(context);
		context.on('close', () => this.contexts.delete(context));
		context.on('page', (page) => page.on('framenavigated', (frame) => this.navigated.set(frame, Date.now())));
		context.on('request', (request) => this.waiting.set(request, { url: request.url(), at: Date.now() }));
		context.on('requestfinished', (request) => {
			this.waiting.delete(request);
			try {
				this.answered.set(new URL(request.url()).origin, Date.now());
			} catch {}
		});
		context.on('requestfailed', (request) => {
			this.waiting.delete(request);
			this.failed = Date.now();
		});
	}
	/** The oldest request still waiting for an answer after `ms`, if any: a server that stopped answering. */
	stalled(ms: number): { url: string; at: number } | undefined {
		const now = Date.now();
		return [...this.waiting].filter(([request, w]) => now - w.at >= ms && !this.orphaned(request, w.at)).map(([, w]) => w).sort((a, b) => a.at - b.at)[0];
	}
	// Playwright sends no requestfailed for a request its page dropped by closing or navigating away.
	private orphaned(request: Request, at: number): boolean {
		try {
			const frame = request.frame();
			if (frame.isDetached() || frame.page().isClosed()) return true;
			return !request.isNavigationRequest() && (this.navigated.get(frame) ?? 0) > at;
		} catch {
			return false;
		}
	}
	/** How long ago `origin` last answered a request of the route's pages. */
	sinceAnswer(origin: string): number | undefined {
		const at = this.answered.get(new URL(origin).origin);
		return at === undefined ? undefined : Date.now() - at;
	}
	async close(): Promise<void> {
		this.closed = true;
		await Promise.all([...this.contexts].map((c) => c.close().catch(() => {})));
	}
}
