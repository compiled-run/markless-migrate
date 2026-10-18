// Alpine.js's x-show, x-transition and the Collapse plugin (MIT, Caleb Porzio), driven by the value a handler just wrote.
type Styles = Record<string, string | number>;
type Stage = { during: Styles | string; start: Styles | string; end: Styles | string };

export interface ShowOptions {
	readonly important?: boolean;
	/** x-transition with modifiers, or x-transition:enter="..." class strings, per stage ('' for the bare directive). */
	readonly transition?: { readonly helper?: Readonly<Record<string, readonly string[]>>; readonly classes?: Readonly<Record<string, string>> };
	/** x-collapse's modifiers. */
	readonly collapse?: readonly string[];
}

interface State {
	shown: boolean;
	transitioning?: { cancel: () => void; finish: () => void };
	enter?: Stage;
	leave?: Stage;
	setter: (el: HTMLElement, styles: Styles | string) => () => void;
	collapse?: { floor: number; fullyHide: boolean; duration: number };
	initialised: boolean;
}

const states = new WeakMap<HTMLElement, State>();

function modifierValue(modifiers: readonly string[], key: string, fallback: string | number): string | number {
	if (modifiers.indexOf(key) === -1) return fallback;
	const raw = modifiers[modifiers.indexOf(key) + 1];
	if (!raw) return fallback;
	if (key === 'scale' && Number.isNaN(Number(raw))) return fallback;
	if (key === 'duration' || key === 'delay') {
		const match = raw.match(/([0-9]+)ms/);
		if (match) return match[1]!;
	}
	if (key === 'min') {
		const match = raw.match(/([0-9]+)px/);
		if (match) return match[1]!;
	}
	if (key === 'origin' && ['top', 'right', 'left', 'center', 'bottom'].includes(modifiers[modifiers.indexOf(key) + 2]!)) return [raw, modifiers[modifiers.indexOf(key) + 2]].join(' ');
	return raw;
}

const kebab = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

function setStyles(el: HTMLElement, styles: Styles | string): () => void {
	const previous: Record<string, string> = {};
	for (const [key, value] of Object.entries(styles as Styles)) {
		previous[key] = el.style.getPropertyValue(kebab(key));
		el.style.setProperty(kebab(key), String(value));
	}
	setTimeout(() => {
		if (el.style.length === 0) el.removeAttribute('style');
	});
	return () => setStyles(el, previous);
}

function setClasses(el: HTMLElement, classes: Styles | string): () => void {
	const missing = String(classes || '').split(/\s/).filter((c) => c && !el.classList.contains(c));
	el.classList.add(...missing);
	return () => el.classList.remove(...missing);
}

function helperStages(modifiers: readonly string[], stage: string): { enter?: Stage; leave?: Stage } {
	const doesntSpecify = !modifiers.includes('in') && !modifiers.includes('out') && !stage;
	const transitioningIn = doesntSpecify || modifiers.includes('in') || stage === 'enter';
	const transitioningOut = doesntSpecify || modifiers.includes('out') || stage === 'leave';
	const wantsAll = !modifiers.includes('opacity') && !modifiers.includes('scale');
	const opacity = wantsAll || modifiers.includes('opacity') ? 0 : 1;
	const scale = wantsAll || modifiers.includes('scale') ? Number(modifierValue(modifiers, 'scale', 95)) / 100 : 1;
	const delay = Number(modifierValue(modifiers, 'delay', 0)) / 1000;
	const origin = modifierValue(modifiers, 'origin', 'center');
	const during = (duration: number) => ({ transformOrigin: origin, transitionDelay: `${delay}s`, transitionProperty: 'opacity, transform', transitionDuration: `${duration}s`, transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)' });
	return {
		...(transitioningIn ? { enter: { during: during(Number(modifierValue(modifiers, 'duration', 150)) / 1000), start: { opacity, transform: `scale(${scale})` }, end: { opacity: 1, transform: 'scale(1)' } } } : {}),
		...(transitioningOut ? { leave: { during: during(Number(modifierValue(modifiers, 'duration', 75)) / 1000), start: { opacity: 1, transform: 'scale(1)' }, end: { opacity, transform: `scale(${scale})` } } } : {}),
	};
}

function stateOf(el: HTMLElement, options: ShowOptions): State {
	let state = states.get(el);
	if (state) return state;
	const shown = el.style.display !== 'none' && !el.hidden;
	state = { shown, setter: setStyles, initialised: false };
	const transition = options.transition;
	if (transition?.helper) {
		for (const [stage, modifiers] of Object.entries(transition.helper)) Object.assign(state, helperStages(modifiers, stage));
	}
	if (transition?.classes) {
		state.setter = setClasses;
		const c = transition.classes;
		state.enter = { during: c.enter ?? '', start: c['enter-start'] ?? '', end: c['enter-end'] ?? '' };
		state.leave = { during: c.leave ?? '', start: c['leave-start'] ?? '', end: c['leave-end'] ?? '' };
	}
	if (options.collapse) {
		const m = options.collapse;
		state.collapse = { floor: Number(modifierValue(m, 'min', 0)), fullyHide: !m.includes('min'), duration: Number(modifierValue(m, 'duration', 250)) / 1000 };
	}
	states.set(el, state);
	return state;
}

function once(fn: () => void): () => void {
	let called = false;
	return () => {
		if (called) return;
		called = true;
		fn();
	};
}

function perform(el: HTMLElement, state: State, stages: { start: () => void; during: () => void; before: () => void; end: () => void; after: () => void; cleanup: () => void }): void {
	let interrupted = false;
	let reachedBefore = false;
	let reachedEnd = false;
	const finish = once(() => {
		interrupted = true;
		if (!reachedBefore) stages.before();
		if (!reachedEnd) stages.end();
		stages.after();
		if (el.isConnected) stages.cleanup();
		delete state.transitioning;
	});
	state.transitioning = { cancel: once(finish), finish };
	stages.start();
	stages.during();
	requestAnimationFrame(() => {
		if (interrupted) return;
		let duration = Number(getComputedStyle(el).transitionDuration.replace(/,.*/, '').replace('s', '')) * 1000;
		const delay = Number(getComputedStyle(el).transitionDelay.replace(/,.*/, '').replace('s', '')) * 1000;
		if (duration === 0) duration = Number(getComputedStyle(el).animationDuration.replace('s', '')) * 1000;
		stages.before();
		reachedBefore = true;
		requestAnimationFrame(() => {
			if (interrupted) return;
			stages.end();
			setTimeout(state.transitioning!.finish, duration + delay);
			reachedEnd = true;
		});
	});
}

function transition(el: HTMLElement, state: State, setter: State['setter'], stage: Stage, before: () => void, after: () => void): void {
	state.transitioning?.cancel();
	const empty = (v: Styles | string) => (typeof v === 'string' ? !v : Object.keys(v).length === 0);
	if (empty(stage.during) && empty(stage.start) && empty(stage.end)) {
		before();
		after();
		return;
	}
	let undoStart = () => {};
	let undoDuring = () => {};
	let undoEnd = () => {};
	perform(el, state, {
		start: () => (undoStart = setter(el, stage.start)),
		during: () => (undoDuring = setter(el, stage.during)),
		before,
		end: () => {
			undoStart();
			undoEnd = setter(el, stage.end);
		},
		after,
		cleanup: () => {
			undoDuring();
			undoEnd();
		},
	});
}

function doShow(el: HTMLElement, state: State): void {
	if (state.collapse && !state.collapse.fullyHide) return;
	if (el.style.length === 1 && el.style.display === 'none') el.removeAttribute('style');
	else el.style.removeProperty('display');
}

function doHide(el: HTMLElement, state: State, options: ShowOptions): void {
	if (state.collapse && !state.collapse.fullyHide) return;
	el.style.setProperty('display', 'none', options.important ? 'important' : undefined);
}

function collapseIn(el: HTMLElement, state: State): void {
	const c = state.collapse!;
	if (c.fullyHide) {
		el.hidden = false;
		el.style.removeProperty('display');
	}
	let current = el.getBoundingClientRect().height;
	el.style.height = 'auto';
	const full = el.getBoundingClientRect().height;
	if (current === full) current = c.floor;
	const during = { transitionProperty: 'height', transitionDuration: `${c.duration}s`, transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)' };
	transition(el, state, setStyles, { during, start: { height: `${current}px` }, end: { height: `${full}px` } }, () => (state.shown = true), () => {
		if (Math.abs(el.getBoundingClientRect().height - full) < 1) el.style.removeProperty('overflow');
	});
}

function collapseOut(el: HTMLElement, state: State): void {
	const c = state.collapse!;
	const full = el.getBoundingClientRect().height;
	const keepHeight = (target: HTMLElement, styles: Styles | string) => {
		const revert = setStyles(target, styles);
		return (styles as Styles).height ? () => {} : revert;
	};
	const during = { transitionProperty: 'height', transitionDuration: `${c.duration}s`, transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)' };
	transition(el, state, keepHeight, { during, start: { height: `${full}px` }, end: { height: `${c.floor}px` } }, () => el.style.setProperty('overflow', 'hidden'), () => {
		state.shown = false;
		if (el.style.height === `${c.floor}px` && c.fullyHide) {
			el.style.display = 'none';
			el.hidden = true;
		}
	});
}

/** x-show="value": call after every write the expression reads; repeated values do nothing, as Alpine's effect skips them. */
export function show(el: HTMLElement | undefined, value: unknown, options: ShowOptions = {}): void {
	if (!el) return;
	const state = stateOf(el, options);
	const want = !!value;
	if (state.initialised && want === state.shown && !state.transitioning) return;
	if (!state.initialised && want === state.shown) {
		state.initialised = true;
		return;
	}
	state.initialised = true;
	const nextTick = document.visibilityState === 'visible' ? requestAnimationFrame : (fn: () => void) => setTimeout(fn);
	if (state.collapse) {
		state.shown = want;
		if (want) collapseIn(el, state);
		else collapseOut(el, state);
		return;
	}
	if (want) {
		state.shown = true;
		if (state.enter && !isEmpty(state.enter)) transition(el, state, state.setter, state.enter, () => doShow(el, state), () => {});
		else nextTick(() => doShow(el, state));
		return;
	}
	state.shown = false;
	let transitionDone = !state.leave || isEmpty(state.leave);
	let tickDone = false;
	const hide = () => tickDone && transitionDone && !state.shown && doHide(el, state, options);
	if (!transitionDone) transition(el, state, state.setter, state.leave!, () => {}, () => ((transitionDone = true), hide()));
	queueMicrotask(() => nextTick(() => ((tickDone = true), hide())));
}

function isEmpty(stage: Stage): boolean {
	const empty = (v: Styles | string) => (typeof v === 'string' ? !v : Object.keys(v).length === 0);
	return empty(stage.during) && empty(stage.start) && empty(stage.end);
}

export function isShown(el: HTMLElement | undefined): boolean {
	return !!el && (states.get(el)?.shown ?? (el.style.display !== 'none' && !el.hidden));
}
