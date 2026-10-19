import type { Route } from 'playwright';

/** Added to every response while responsiveness is timed, on both sides: about one round trip to a nearby CDN. */
export const DEFAULT_LATENCY_MS = 40;

type Stored = { readonly status: number; readonly headers: Record<string, string>; readonly body: Buffer };

const VOLATILE = /^(referer|user-agent|cookie|origin|accept-language|accept-encoding|priority|purpose|sec-.*|upgrade-insecure-requests|cache-control|pragma|if-.*|x-markless-migrate.*)$/;

/** One side's network while timing: each GET is fetched from the app once, then every load gets that copy after the same fixed latency, so timings compare the apps and not the hosts; the first fetch's duration is reported as server time. */
export class TimedNetwork {
	readonly latencyMs: number;
	/** A write reached the app: its data GETs are fetched again each time from then on, since their answers may have changed. */
	wrote = false;
	private readonly answers = new Map<string, Promise<Stored | undefined>>();
	private readonly firstFetch = new Map<string, number>();

	constructor(latencyMs = DEFAULT_LATENCY_MS) {
		this.latencyMs = latencyMs;
	}

	/** How long the app took to answer this URL the first time it was asked, the whole response, network included. */
	serverMs(url: string): number | undefined {
		return this.firstFetch.get(url);
	}

	/** Answers the request from the stored copy after the fixed latency; `miss` is told when the copy had to be fetched now. */
	async answer(route: Route, headers: Record<string, string>, miss: () => void): Promise<void> {
		const request = route.request();
		const key = `${request.url()}\n${Object.entries(headers).filter(([name]) => !VOLATILE.test(name.toLowerCase())).map(([name, value]) => `${name.toLowerCase()}: ${value}`).sort().join('\n')}`;
		let hit = this.answers.get(key);
		if (!hit) {
			miss();
			hit = this.fetch(route, headers);
			this.answers.set(key, hit);
		}
		const got = await hit;
		if (!got) {
			this.answers.delete(key);
			return route.continue({ headers }).catch(() => {});
		}
		await this.delay();
		await route.fulfill(got).catch(() => {});
	}

	delay(): Promise<void> {
		return new Promise((done) => setTimeout(done, this.latencyMs));
	}

	private async fetch(route: Route, headers: Record<string, string>): Promise<Stored | undefined> {
		const url = route.request().url();
		const started = performance.now();
		try {
			const response = await route.fetch({ headers, maxRedirects: 0, timeout: 30_000 });
			const body = await response.body();
			if (!this.firstFetch.has(url)) this.firstFetch.set(url, Math.round(performance.now() - started));
			const kept = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name)));
			return { status: response.status(), headers: kept, body };
		} catch {
			return undefined;
		}
	}
}
