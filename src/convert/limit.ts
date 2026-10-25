/** Runs a task when one of a fixed number of slots is free, in the order tasks were given. */
export type Limit = <T>(task: () => Promise<T>) => Promise<T>;

/** A limit of `size` tasks at once. A task must not wait on another task given to the same limit: with every slot held, neither would start. */
export function limiter(size: number): Limit {
	const waiting: (() => void)[] = [];
	let running = 0;
	// A freed slot passes straight to the next waiter, so a task arriving meanwhile cannot take it too.
	const release = () => {
		const next = waiting.shift();
		if (next) next();
		else running--;
	};
	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (running >= Math.max(1, size)) await new Promise<void>((start) => waiting.push(start));
		else running++;
		try {
			return await task();
		} finally {
			release();
		}
	};
}

/** Each item's task under `limit`, every one given at once; the results in the items' order. */
export const eachLimited = <T, R>(limit: Limit, items: readonly T[], task: (item: T, index: number) => Promise<R>): Promise<R[]> => Promise.all(items.map((item, i) => limit(() => task(item, i))));
