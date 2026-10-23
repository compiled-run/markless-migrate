// What the webring page's _hyperscript did (www/content/webring.md), as plain DOM work: its transition, hide and show
// commands with _hyperscript's defaults, and its handlers' "queue last" (an event that comes while the handler runs
// replaces any queued one and runs 1 ms after it ends).

const DEFAULT_TRANSITION = 'all 500ms ease-in';

type StyleName = 'opacity' | 'height';

/** `transition <el>'s <prop> to <value> [over <ms>ms]`: from the computed value to the new one, then the old `transition`. */
export function transition(el: HTMLElement, prop: StyleName, to: string, over?: number): Promise<void> {
	return new Promise((resolve) => {
		const previous = el.style.transition;
		el.style.transition = over ? `all ${over}ms ease-in` : DEFAULT_TRANSITION;
		el.style[prop] = getComputedStyle(el)[prop];
		let started = false;
		let done = false;
		const finish = () => {
			if (done) return;
			el.style.transition = previous;
			done = true;
			resolve();
		};
		el.addEventListener('transitionend', finish, { once: true });
		el.addEventListener('transitionstart', () => (started = true), { once: true });
		setTimeout(() => {
			if (!started) finish();
		}, 100);
		setTimeout(() => (el.style[prop] = to), 0);
	});
}

// The display each element had before its first hide, as _hyperscript keeps it.
const originalDisplay = new WeakMap<HTMLElement, string>();

export function hide(el: HTMLElement): void {
	if (!originalDisplay.has(el)) originalDisplay.set(el, el.style.display);
	el.style.display = 'none';
}

export function show(el: HTMLElement): void {
	const original = originalDisplay.get(el);
	if (original && original !== 'none') el.style.display = original;
	else el.style.removeProperty('display');
}

const queues = new WeakMap<HTMLElement, Map<string, { executing: boolean; next?: () => Promise<void> }>>();

/** Runs `handler` for the `feature` of `owner` now, or after the run in progress (only the latest waiting one). */
export function queueLast(owner: HTMLElement, feature: string, handler: () => Promise<void>): void {
	let features = queues.get(owner);
	if (!features) queues.set(owner, (features = new Map()));
	let queue = features.get(feature);
	if (!queue) features.set(feature, (queue = { executing: false }));
	if (queue.executing) {
		queue.next = handler;
		return;
	}
	const q = queue;
	q.executing = true;
	handler().finally(() => {
		q.executing = false;
		const next = q.next;
		q.next = undefined;
		if (next) setTimeout(() => queueLast(owner, feature, next), 1);
	});
}

/** The `<a/> in the #ring-table`: one per site, in the table's order. */
export const ringLinks = (ringTable: HTMLElement): HTMLAnchorElement[] => [...ringTable.querySelectorAll('a')];

/** `decrement :index` / `increment :index` on an index that starts unset (0 to _hyperscript). */
export function step(index: number | undefined, by: number, count: number): number {
	const next = (index ? index : 0) + by;
	if (next === -1) return count - 1;
	if (next === count) return 0;
	return next;
}

/** `repeat until the result is not :index`: a random site other than the current one. */
export function randomOther(index: number | undefined, count: number): number {
	let result = index;
	while (result === index) result = Math.floor(Math.random() * count);
	return result!;
}

/** `set the #webring's src to the result's @href`, then the navigator's "on click from .nav-link", which runs after it. */
export function visit(webring: HTMLIFrameElement, ringTable: HTMLElement, navigator: HTMLElement, index: number): void {
	webring.src = ringLinks(ringTable)[index].getAttribute('href')!;
	queueLast(navigator, 'click', async () => {
		console.log('here');
		await transition(navigator, 'opacity', '100%');
	});
}
