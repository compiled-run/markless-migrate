// One browser, launched again when it dies, and each route's work (a capture, a check) run in a scope that knows
// whether the browser died under it. No playwright import: this module records nothing, so it stays out of the recorder's key.

export interface ContextLike {
	close(...args: never[]): Promise<void>;
	on(event: 'close', listener: () => void): unknown;
}

export interface BrowserLike {
	newContext(...args: never[]): Promise<ContextLike>;
	isConnected(): boolean;
	on(event: 'disconnected', listener: () => void): unknown;
	close(): Promise<void>;
}

/** What work run twice came to: its value, or why the browser died under both tries. */
export type Retried<T> = { readonly value: T } | { readonly failed: string };

interface Scope {
	lost?: string;
}

/**
 * One browser at a time, launched again on the first use after it dies. Each `retried` work gets the browser through
 * a scope: a context of the scope's closed by anything but its own close() means the browser died under the work, whose
 * result is then discarded and the work run once more on a new browser.
 */
export class Relauncher<B extends BrowserLike> {
	private current: Promise<B> | undefined;
	/** The browser launched last, dead or not: what does not open a context (its browser type) is read from it. */
	private latest: B | undefined;
	private closing = false;
	private launches = 0;
	private readonly launch: () => Promise<B>;
	private readonly log: (line: string) => void;
	/** What the browser said last (its stderr), for the line logged when it dies. */
	private readonly last: () => string;

	constructor(launch: () => Promise<B>, log: (line: string) => void, last: () => string = () => '') {
		this.launch = launch;
		this.log = log;
		this.last = last;
	}

	/** Launches the first browser. */
	async start(): Promise<this> {
		await this.live();
		return this;
	}

	/** The browser for work outside any scope (a capture read back from its file): launched again if it died. */
	get shared(): B {
		return this.proxy(undefined);
	}

	private live(): Promise<B> {
		if (this.closing) return Promise.reject(new Error('the browser was closed at the end of the run'));
		if (!this.current) {
			const launching = this.launch().then((browser) => {
				this.latest = browser;
				if (this.launches++) this.log('browser launched again');
				browser.on('disconnected', () => {
					if (this.closing || this.current !== launching) return;
					this.current = undefined;
					const said = this.last();
					this.log(`the browser closed unexpectedly${said ? ` (its last output: ${said})` : ''}`);
				});
				return browser;
			});
			launching.catch(() => {
				if (this.current === launching) this.current = undefined;
			});
			this.current = launching;
		}
		return this.current;
	}

	private proxy(scope: Scope | undefined): B {
		const newContext = async (...args: never[]): Promise<ContextLike> => {
			if (scope?.lost) throw new Error(`not started: ${scope.lost}`);
			const browser = await this.live();
			let context: ContextLike;
			try {
				context = await browser.newContext(...args);
			} catch (error) {
				if (scope && !this.closing && (!browser.isConnected() || /has been closed/.test(String(error)))) scope.lost ??= 'the browser closed while it was opening a page';
				throw error;
			}
			if (!scope) return context;
			let ours = false;
			const close = context.close.bind(context);
			context.close = (...a: never[]) => {
				ours = true;
				return close(...a);
			};
			context.on('close', () => {
				if (!ours && !this.closing) scope.lost ??= 'the browser closed under it';
			});
			return context;
		};
		const latest = () => {
			if (!this.latest) throw new Error('the browser is read before it is launched (Relauncher.start)');
			return this.latest;
		};
		return new Proxy({} as B, {
			get(_, name) {
				if (name === 'newContext') return newContext;
				const value = Reflect.get(latest(), name) as unknown;
				return typeof value === 'function' ? value.bind(latest()) : value;
			},
		});
	}

	/**
	 * Runs `work` on the browser; if the browser died under it, `discard` removes what it wrote and it runs once more on
	 * a new browser. An error with the browser alive is the work's own and is thrown as it is.
	 */
	async retried<T>(label: string, work: (browser: B) => Promise<T>, discard: (since: number) => Promise<void>): Promise<Retried<T>> {
		for (let attempt = 1; ; attempt++) {
			const scope: Scope = {};
			const since = Date.now();
			let outcome: { value: T } | { error: unknown };
			try {
				outcome = { value: await work(this.proxy(scope)) };
			} catch (error) {
				outcome = { error };
			}
			if (!scope.lost) {
				if ('error' in outcome) throw outcome.error;
				if (attempt > 1) this.log(`${label}: done again on a new browser`);
				return outcome;
			}
			await discard(since);
			if (attempt === 2) {
				this.log(`${label}: failed twice, ${scope.lost}`);
				return { failed: scope.lost };
			}
			this.log(`${label}: ${scope.lost}; what it did is thrown away and it runs again on a new browser`);
		}
	}

	async close(): Promise<void> {
		this.closing = true;
		const current = this.current;
		this.current = undefined;
		if (current) await (await current.catch(() => undefined))?.close();
	}
}
