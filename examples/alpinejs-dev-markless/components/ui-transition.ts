// Alpine's x-show with x-transition (alpinejs src/directives/x-transition.js, x-show.js, utils/styles.js; MIT, Caleb
// Porzio), driven by the element itself: the same inline styles, the same frames and the same durations.
export type Transition = 'default' | 'opacity';
type Styles = Record<string, string | number>;
interface Stage {
	readonly during: Styles;
	readonly start: Styles;
	readonly end: Styles;
}

const EASING = 'cubic-bezier(0.4, 0.0, 0.2, 1)';

// registerTransitionsFromHelper with no modifiers (opacity and scale .95) or with .opacity (scale stays 1).
function stages(kind: Transition): { enter: Stage; leave: Stage } {
	const scale = kind === 'opacity' ? 1 : 0.95;
	const during = (duration: number): Styles => ({ transformOrigin: 'center', transitionDelay: '0s', transitionProperty: 'opacity, transform', transitionDuration: `${duration}s`, transitionTimingFunction: EASING });
	return {
		enter: { during: during(0.15), start: { opacity: 0, transform: `scale(${scale})` }, end: { opacity: 1, transform: 'scale(1)' } },
		leave: { during: during(0.075), start: { opacity: 1, transform: 'scale(1)' }, end: { opacity: 0, transform: `scale(${scale})` } },
	};
}

const kebab = (key: string) => (key.startsWith('--') ? key : key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase());

function setStyles(el: HTMLElement, value: Styles): () => void {
	const previous: Styles = {};
	for (const [key, style] of Object.entries(value)) {
		previous[key] = (el.style as unknown as Record<string, string>)[key] ?? '';
		el.style.setProperty(kebab(key), String(style));
	}
	setTimeout(() => {
		if (el.style.length === 0) el.removeAttribute('style');
	});
	return () => {
		setStyles(el, previous);
	};
}

interface Running {
	cancel(): void;
}
const running = new WeakMap<HTMLElement, Running>();

// performTransition: start and during styles now, `before` on the next frame, end styles on the frame after, then
// `after` once the computed duration has passed. A new transition on the element finishes the old one at once.
function transition(el: HTMLElement, stage: Stage, before: () => void, after: () => void): void {
	running.get(el)?.cancel();
	let interrupted = false;
	let reachedBefore = false;
	let reachedEnd = false;
	let undoStart = () => {};
	let undoDuring = () => {};
	let undoEnd = () => {};
	let done = false;
	const finish = () => {
		if (done) return;
		done = true;
		interrupted = true;
		if (!reachedBefore) before();
		if (!reachedEnd) {
			undoStart();
			undoEnd = setStyles(el, stage.end);
		}
		after();
		if (el.isConnected) {
			undoDuring();
			undoEnd();
		}
		running.delete(el);
	};
	running.set(el, { cancel: finish });
	undoStart = setStyles(el, stage.start);
	undoDuring = setStyles(el, stage.during);
	requestAnimationFrame(() => {
		if (interrupted) return;
		const style = getComputedStyle(el);
		let duration = Number(style.transitionDuration.replace(/,.*/, '').replace('s', '')) * 1000;
		const delay = Number(style.transitionDelay.replace(/,.*/, '').replace('s', '')) * 1000;
		if (duration === 0) duration = Number(style.animationDuration.replace('s', '')) * 1000;
		before();
		reachedBefore = true;
		requestAnimationFrame(() => {
			if (interrupted) return;
			undoStart();
			undoEnd = setStyles(el, stage.end);
			setTimeout(finish, duration + delay);
			reachedEnd = true;
		});
	});
}

function show(el: HTMLElement): void {
	if (el.style.length === 1 && el.style.display === 'none') el.removeAttribute('style');
	else el.style.removeProperty('display');
}

function hide(el: HTMLElement): void {
	el.style.setProperty('display', 'none');
}

export interface Shown {
	readonly el: HTMLElement | undefined;
	readonly transition?: Transition;
}

const shown = new WeakMap<HTMLElement, boolean>();
// A hide that waited on a transition is dropped when the element was shown again meanwhile.
const hideUnlessShown = (el: HTMLElement) => {
	if (shown.get(el) === false) hide(el);
};

// One x-show expression over a group of elements in document order. Showing: an element with a transition runs it in
// (it appears at the transition's first frame), one without appears on the next frame. Hiding: elements with a
// transition run it out and then hide; an element without one hides once every element inside it has finished.
export function toggle(group: readonly Shown[], value: boolean): void {
	const items = group.filter((item): item is Shown & { el: HTMLElement } => !!item.el && (shown.get(item.el) ?? item.el.style.display !== 'none') !== value);
	for (const item of items) shown.set(item.el, value);
	if (value) {
		for (const item of items) {
			if (item.transition) transition(item.el, stages(item.transition).enter, () => show(item.el), () => {});
			else requestAnimationFrame(() => show(item.el));
		}
		return;
	}
	const hidden = new Map<HTMLElement, Promise<void>>();
	for (const item of items) {
		if (!item.transition) continue;
		hidden.set(item.el, new Promise((resolve) => transition(item.el, stages(item.transition!).leave, () => {}, () => resolve())).then(() => hideUnlessShown(item.el)));
	}
	for (const item of items) {
		if (item.transition) continue;
		const inside = [...hidden].filter(([el]) => item.el.contains(el)).map(([, done]) => done);
		requestAnimationFrame(() => void Promise.all(inside).then(() => hideUnlessShown(item.el)));
	}
}
