// The page's idle and background work, held or waited for so a step or a timing starts from the same point on every run.

/** Init script for a timing's page: idle callbacks and background tasks wait until the press has been timed, as for a visitor who presses before the page has gone idle. Must stay self-contained. */
export function holdIdleWork(): void {
	const g = globalThis as typeof globalThis & { scheduler?: { postTask?: (run: () => unknown, options?: { priority?: string; signal?: AbortSignal; delay?: number }) => Promise<unknown> }; __markless_migrate_release_idle__?: () => void };
	const held: (() => void)[] = [];
	let holding = true;
	const request = g.requestIdleCallback?.bind(g);
	const cancel = g.cancelIdleCallback?.bind(g);
	if (request && cancel) {
		let ids = 0;
		const started = new Map<number, number>();
		const dropped = new Set<number>();
		g.requestIdleCallback = ((run: IdleRequestCallback, options?: IdleRequestOptions) => {
			if (!holding) return request(run, options);
			const id = -++ids;
			held.push(() => {
				if (!dropped.has(id)) started.set(id, request(run, options));
			});
			return id;
		}) as typeof requestIdleCallback;
		g.cancelIdleCallback = ((id: number) => {
			if (id >= 0) return cancel(id);
			dropped.add(id);
			const real = started.get(id);
			if (real !== undefined) cancel(real);
		}) as typeof cancelIdleCallback;
	}
	const post = g.scheduler?.postTask?.bind(g.scheduler);
	if (post && g.scheduler) {
		g.scheduler.postTask = (run, options) => {
			if (!holding || options?.priority !== 'background') return post(run, options);
			return new Promise((resolve, reject) => held.push(() => void post(run, options).then(resolve, reject)));
		};
	}
	Object.defineProperty(g, '__markless_migrate_release_idle__', {
		value: () => {
			holding = false;
			for (const run of held.splice(0)) run();
		},
	});
}

/** Waits for one background task and one idle callback (at most about a second): idle work the page had queued has run. */
export async function idleBarrier(page: { evaluate: <R>(fn: () => R | Promise<R>) => Promise<R> }): Promise<void> {
	await page
		.evaluate(
			() =>
				new Promise<void>((done) => {
					const g = globalThis as typeof globalThis & { scheduler?: { postTask?: (run: () => unknown, options?: { priority?: string }) => Promise<unknown> } };
					const idle = () => (typeof g.requestIdleCallback === 'function' ? g.requestIdleCallback(() => done(), { timeout: 1000 }) : setTimeout(done, 50));
					if (g.scheduler?.postTask) g.scheduler.postTask(idle, { priority: 'background' }).catch(idle);
					else idle();
					setTimeout(done, 1500);
				}),
		)
		.catch(() => {});
}
