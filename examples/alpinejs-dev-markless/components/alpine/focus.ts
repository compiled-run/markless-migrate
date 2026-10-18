// Alpine.js's Focus plugin, x-trap and $focus (MIT, Caleb Porzio), on the same focus-trap and tabbable libraries.
import { createFocusTrap, type FocusTrap } from 'focus-trap';
import { focusable, isFocusable } from 'tabbable';

let lastFocused: Element | null = null;
let currentFocused: Element | null = null;
let watching = false;

function watchFocus(): void {
	if (watching) return;
	watching = true;
	window.addEventListener('focusin', () => {
		lastFocused = currentFocused;
		currentFocused = document.activeElement;
	});
}

interface Trap {
	trap: FocusTrap;
	on: boolean;
	undoInert: () => void;
	undoScroll: () => void;
}

const traps = new WeakMap<HTMLElement, Trap>();

function setInert(el: HTMLElement): () => void {
	const undos: (() => void)[] = [];
	const crawl = (node: Element) => {
		if (node === document.body || !node.parentNode) return;
		for (const sibling of Array.from(node.parentNode.children)) {
			if (sibling === node) crawl(node.parentNode as Element);
			else {
				const cache = sibling.hasAttribute('aria-hidden');
				sibling.setAttribute('aria-hidden', 'true');
				undos.push(() => cache || sibling.removeAttribute('aria-hidden'));
			}
		}
	};
	crawl(el);
	return () => {
		while (undos.length) undos.pop()!();
	};
}

function disableScrolling(): () => void {
	const html = document.documentElement;
	const overflow = html.style.overflow;
	const paddingRight = html.style.paddingRight;
	const scrollbarWidth = window.innerWidth - html.clientWidth;
	const gutter = getComputedStyle(html).scrollbarGutter;
	html.style.overflow = 'hidden';
	if (gutter && gutter !== 'auto') return () => void (html.style.overflow = overflow);
	html.style.paddingRight = `${scrollbarWidth}px`;
	return () => {
		html.style.overflow = overflow;
		html.style.paddingRight = paddingRight;
	};
}

/** x-trap="value": call after every write the expression reads. */
export function trap(el: HTMLElement | undefined, value: unknown, modifiers: readonly string[]): void {
	if (!el) return;
	watchFocus();
	let state = traps.get(el);
	if (!state) {
		const options: Parameters<typeof createFocusTrap>[1] = { escapeDeactivates: false, allowOutsideClick: true, fallbackFocus: () => el };
		if (modifiers.includes('noautofocus')) options.initialFocus = false;
		else {
			const autofocus = el.querySelector<HTMLElement>('[autofocus]');
			if (autofocus) options.initialFocus = autofocus;
		}
		const created: Trap = { trap: undefined as never, on: false, undoInert: () => {}, undoScroll: () => {} };
		if (modifiers.includes('inert')) options.onPostActivate = () => void queueMicrotask(() => (created.undoInert = setInert(el)));
		created.trap = createFocusTrap(el, options);
		traps.set(el, created);
		state = created;
	}
	const want = !!value;
	if (want === state.on) return;
	state.on = want;
	if (want) {
		if (modifiers.includes('noscroll')) state.undoScroll = disableScrolling();
		const s = state;
		setTimeout(() => s.on && s.trap.activate(), 15);
		return;
	}
	state.undoInert();
	state.undoInert = () => {};
	state.undoScroll();
	state.undoScroll = () => {};
	state.trap.deactivate({ returnFocus: !modifiers.includes('noreturn') });
}

export interface FocusMagic {
	within(el: Element | Element[] | undefined): FocusMagic;
	wrap(): FocusMagic;
	withWrapAround(): FocusMagic;
	noscroll(): FocusMagic;
	withoutScrolling(): FocusMagic;
	focusable(el: Element): boolean;
	previouslyFocused(): Element | null;
	lastFocused(): Element | null;
	focused(): Element | null;
	focusables(): Element[];
	all(): Element[];
	isFirst(el: Element): boolean;
	isLast(el: Element): boolean;
	getFirst(): Element | undefined;
	getLast(): Element | undefined;
	getNext(): Element | undefined;
	getPrevious(): Element | undefined;
	first(): void;
	last(): void;
	next(): void;
	previous(): void;
	prev(): void;
	focus(el: Element | undefined): void;
}

/** $focus, scoped to the element the expression sits on. */
export function focusMagic(el: HTMLElement | undefined): FocusMagic {
	watchFocus();
	let within: Element | Element[] | undefined = el;
	let noscroll = false;
	let wrapAround = false;
	const magic: FocusMagic = {
		within(target) {
			within = target;
			return magic;
		},
		withoutScrolling: () => ((noscroll = true), magic),
		noscroll: () => ((noscroll = true), magic),
		withWrapAround: () => ((wrapAround = true), magic),
		wrap: () => magic.withWrapAround(),
		focusable: (target) => isFocusable(target),
		previouslyFocused: () => lastFocused,
		lastFocused: () => lastFocused,
		focused: () => currentFocused,
		focusables: () => (Array.isArray(within) ? within : within ? focusable(within, { displayCheck: 'none' }) : []),
		all: () => magic.focusables(),
		isFirst: (target) => !!magic.all()[0]?.isSameNode(target),
		isLast: (target) => !!magic.all().at(-1)?.isSameNode(target),
		getFirst: () => magic.all()[0],
		getLast: () => magic.all().at(-1),
		getNext() {
			const list = magic.all();
			const at = list.indexOf(document.activeElement as Element);
			if (at === -1) return undefined;
			if (wrapAround && at === list.length - 1) return list[0];
			return list[at + 1];
		},
		getPrevious() {
			const list = magic.all();
			const at = list.indexOf(document.activeElement as Element);
			if (at === -1) return undefined;
			if (wrapAround && at === 0) return list.at(-1);
			return list[at - 1];
		},
		first: () => magic.focus(magic.getFirst()),
		last: () => magic.focus(magic.getLast()),
		next: () => magic.focus(magic.getNext()),
		previous: () => magic.focus(magic.getPrevious()),
		prev: () => magic.previous(),
		focus(target) {
			if (!target) return;
			setTimeout(() => {
				if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '0');
				(target as HTMLElement).focus({ preventScroll: noscroll });
			});
		},
	};
	return magic;
}
