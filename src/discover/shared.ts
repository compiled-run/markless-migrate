// Which route owns each group of the same control across routes, and which routes spot-check a count: part of what a kept recording means.
import type { PressedControl, Shared } from './record.ts';

export const UNSHARED = 'unshared';
/** One route in this many checks a counted control of each group: on the sample, one press per group per 10 routes, under 2% of its presses. */
const SPOT_EVERY = 10;

/** Whether a route spot-checks its counts: chosen by its path, so the same routes do it whatever the shards hold. */
export function isSpot(route: string): boolean {
	let h = 2166136261;
	for (const ch of route) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return (h >>> 0) % SPOT_EVERY === 0;
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
}
const deferred = <T>(): Deferred<T> => {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
};

/** The groups shared across routes, owned in the convert's route order so the same routes own them every run. */
export function sharedControls(order: readonly string[], unshared: ReadonlySet<string>): (route: string) => Shared {
	const announced = new Map<string, Deferred<ReadonlySet<string>>>();
	const results = new Map<string, Deferred<PressedControl | undefined>>();
	const finished = new Set<string>();
	const announce = (route: string) => announced.get(route) ?? announced.set(route, deferred()).get(route) ?? deferred();
	const result = (route: string, group: string) => {
		const key = `${route}\u0000${group}`;
		let got = results.get(key);
		if (!got) {
			got = deferred();
			results.set(key, got);
			if (finished.has(route)) got.resolve(undefined);
		}
		return got;
	};
	return (route) => {
		const index = order.indexOf(route);
		const earlier = index < 0 ? [] : order.slice(0, index);
		return {
			spot: isSpot(route),
			inRun: (other) => order.includes(other),
			earlier: (other) => earlier.includes(other),
			counts: (group) => !unshared.has(group),
			owners: async (groups) => {
				announce(route).resolve(new Set(groups));
				const sets = await Promise.all(earlier.map((r) => announce(r).promise));
				const out = new Map<string, string>();
				for (const g of groups) {
					if (unshared.has(g)) continue;
					const i = sets.findIndex((set) => set.has(g));
					const owner = earlier[i];
					if (owner) out.set(g, owner);
				}
				return out;
			},
			result: (owner, group) => result(owner, group).promise,
			publish: (group, control) => result(route, group).resolve(control),
			done: () => {
				announce(route).resolve(new Set());
				finished.add(route);
				for (const [key, got] of results) if (key.startsWith(`${route}\u0000`)) got.resolve(undefined);
			},
		};
	};
}

