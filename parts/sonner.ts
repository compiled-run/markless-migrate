// sonner 2's Toaster and Toast as its source runs them, over a Markless state() per toaster the converter's NotifyPlan
// renders (an <ol> per position in use, an <li> per toast): a use adds its toast at the front, the list stacks and lifts
// toasts by their measured heights, expands on hover or the hotkey, pauses every timer while expanded, pressed or
// hidden, takes a toast out 200 ms after it leaves, and a swipe past the threshold dismisses it. What a toast shows over
// its life (a promise's loading, then its result) is what the old page showed; the converter renders them all, showing the current one.

/** The Toaster's props, as the old page rendered it. */
export interface SonnerToaster {
	readonly id: string;
	readonly position: string;
	readonly gap: number;
	readonly visibleToasts: number;
	readonly expand: boolean;
	readonly hotkey: readonly string[];
	/** Its lists' style after the front toast's height. */
	readonly style: string;
}

/** What a control's use shows: its toast's options and each markup it showed, from when. */
export interface SonnerToast {
	readonly view: number;
	readonly position?: string;
	/** The lifetime the Toast resolved (its own, the Toaster's or 4000 ms); null for Infinity. */
	readonly duration: number | null;
	readonly dismissible: boolean;
	readonly promise: boolean;
	/** The style the toast is given after sonner's own properties. */
	readonly style: string;
	readonly phases: readonly { readonly at: number; readonly type?: string; readonly attrs: Readonly<Record<string, string>> }[];
	/** The text a toast template shows where its capture showed what was copied. */
	readonly text?: string;
}

export interface SonnerItemView {
	readonly id: number;
	/** The arm of what it shows: `<toast>.<phase>`. */
	readonly view: string;
	readonly text: string;
	readonly a: Readonly<Record<string, string | undefined>>;
	/** Text its use gave it (a submitted form's values), by the slot its markup shows it in. */
	readonly t: Readonly<Record<string, string>>;
}
export interface SonnerListView {
	readonly position: string;
	readonly y: string;
	readonly x: string;
	readonly style: string;
	readonly items: readonly SonnerItemView[];
}
export interface SonnerView {
	readonly lists: readonly SonnerListView[];
}
export const SONNER_EMPTY: SonnerView = { lists: [] };
/** The attributes the Toast writes from its own state, not from what it shows. */
export const SONNER_STATE: ReadonlySet<string> = new Set(['data-mounted', 'data-swiped', 'data-removed', 'data-visible', 'data-y-position', 'data-x-position', 'data-index', 'data-front', 'data-swiping', 'data-swipe-out', 'data-swipe-direction', 'data-expanded']);

type Commit = (view: SonnerView) => void;

const TIME_BEFORE_UNMOUNT = 200;
const SWIPE_THRESHOLD = 45;

interface Item {
	readonly id: number;
	readonly toast: SonnerToast;
	phase: number;
	texts: Readonly<Record<string, string>>;
	mounted: boolean;
	removed: boolean;
	offset: number;
	offsetBeforeRemove: number;
	initialHeight: number;
	remaining: number;
	closeTimerStart: number;
	lastCloseTimerStart: number;
	timeout?: ReturnType<typeof setTimeout>;
	timerKey?: string;
	swiping: boolean;
	swiped: boolean;
	swipeOut: boolean;
	swipeDirection: 'x' | 'y' | null;
	swipeOutDirection: string | null;
	swipeX?: number;
	swipeY?: number;
	pointerStart: { x: number; y: number } | null;
	dragStart: number;
}

interface Toaster {
	readonly props: SonnerToaster;
	readonly section: Element | null;
	commit: Commit;
	toasts: Item[];
	heights: { id: number; height: number; position?: string }[];
	expanded: boolean;
	interacting: boolean;
	lastFocused: HTMLElement | null;
	focusWithin: boolean;
	/** What was last rendered, list by list: to find each toast's element. */
	rendered: { position: string; items: Item[] }[];
}

const toasters = new Map<string, Toaster>();
let counter = 1;

const sectionOf = (id: string) => document.querySelector(`[data-mm-toaster="${CSS.escape(id)}"]`);

function toasterFor(props: SonnerToaster, commit: Commit): Toaster {
	const section = sectionOf(props.id);
	let t = toasters.get(props.id);
	// A new page renders the toaster afresh: what the old one held went with it.
	if (!t || t.section !== section) toasters.set(props.id, (t = { props, section, commit, toasts: [], heights: [], expanded: false, interacting: false, lastFocused: null, focusWithin: false, rendered: [] }));
	t.commit = commit;
	return t;
}

const typeOf = (item: Item) => item.toast.phases[item.phase]?.type;
const positionOf = (t: Toaster, item: Item) => item.toast.position ?? t.props.position;

function render(t: Toaster): void {
	const { props } = t;
	const positions = [...new Set([props.position, ...t.toasts.filter((x) => x.toast.position).map((x) => x.toast.position!)])];
	t.rendered = t.toasts.length ? positions.map((position, p) => ({ position, items: t.toasts.filter((x) => (!x.toast.position && p === 0) || x.toast.position === position) })) : [];
	const front = t.heights[0]?.height || 0;
	const lists = t.rendered.map(({ position, items }) => {
		const [y, x] = position.split('-') as [string, string];
		return { position, y, x, style: `--front-toast-height: ${front}px;${props.style ? ` ${props.style}` : ''}`, items: items.map((item, index) => itemView(t, item, index, y, x)) };
	});
	t.commit({ lists });
	for (const item of t.toasts) timer(t, item);
}

function itemView(t: Toaster, item: Item, index: number, y: string, x: string): SonnerItemView {
	const { props } = t;
	const own = t.heights.filter((h) => h.position == item.toast.position);
	const heightIndex = own.findIndex((h) => h.id === item.id) || 0;
	const before = own.reduce((sum, h, k) => (k >= heightIndex ? sum : sum + h.height), 0);
	item.offset = heightIndex * props.gap + before;
	const same = t.toasts.filter((o) => o.toast.position == item.toast.position).length;
	const swipe = `${item.swipeX !== undefined ? ` --swipe-amount-x: ${item.swipeX}px;` : ''}${item.swipeY !== undefined ? ` --swipe-amount-y: ${item.swipeY}px;` : ''}`;
	const style = `--index: ${index}; --toasts-before: ${index}; --z-index: ${same - index}; --offset: ${item.removed ? item.offsetBeforeRemove : item.offset}px; --initial-height: ${props.expand ? 'auto' : `${item.initialHeight}px`};${item.toast.style ? ` ${item.toast.style}` : ''}${swipe}`;
	return {
		id: item.id,
		view: `${item.toast.view}.${item.phase}`,
		text: item.toast.text ?? '',
		t: item.texts,
		a: {
			...item.toast.phases[item.phase]!.attrs,
			'data-mounted': String(item.mounted),
			'data-swiped': String(item.swiped),
			'data-removed': String(item.removed),
			'data-visible': String(index + 1 <= props.visibleToasts),
			'data-y-position': y,
			'data-x-position': x,
			'data-index': String(index),
			'data-front': String(index === 0),
			'data-swiping': String(item.swiping),
			'data-swipe-out': String(item.swipeOut),
			'data-swipe-direction': item.swipeOutDirection ?? undefined,
			'data-expanded': String(Boolean(t.expanded || (props.expand && item.mounted))),
			style,
		},
	};
}

// sonner measures a toast in its effects, after the browser has the markup: the element is found where it was rendered.
function elementOf(t: Toaster, item: Item): HTMLElement | undefined {
	const section = sectionOf(t.props.id);
	if (!section) return undefined;
	const lists = [...section.children].filter((c) => c.tagName === 'OL');
	for (const [i, list] of t.rendered.entries()) {
		const at = list.items.indexOf(item);
		if (at >= 0) return (lists[i]?.children[at] as HTMLElement | undefined) ?? undefined;
	}
	return undefined;
}

function measure(t: Toaster, item: Item, first: boolean): void {
	const el = elementOf(t, item);
	if (!el) return;
	let height: number;
	if (first) height = el.getBoundingClientRect().height;
	else {
		const original = el.style.height;
		el.style.height = 'auto';
		height = el.getBoundingClientRect().height;
		el.style.height = original;
	}
	item.initialHeight = height;
	const known = t.heights.find((h) => h.id === item.id);
	if (known) known.height = height;
	else if (!item.removed) t.heights.unshift({ id: item.id, height, position: item.toast.position });
}

function setToasts(t: Toaster, toasts: Item[]): void {
	t.toasts = toasts;
	if (toasts.length <= 1) t.expanded = false;
	render(t);
}

function setExpanded(t: Toaster, expanded: boolean): void {
	if (t.expanded === expanded) return;
	t.expanded = expanded;
	render(t);
}

function deleteToast(t: Toaster, item: Item): void {
	if (item.removed) return;
	item.removed = true;
	item.offsetBeforeRemove = item.offset;
	t.heights = t.heights.filter((h) => h.id !== item.id);
	render(t);
	setTimeout(() => {
		clearTimeout(item.timeout);
		setToasts(t, t.toasts.filter((x) => x !== item));
	}, TIME_BEFORE_UNMOUNT);
}

function timer(t: Toaster, item: Item): void {
	const paused = t.expanded || t.interacting || document.hidden;
	const key = `${paused}|${item.phase}`;
	if (item.timerKey === key) return;
	item.timerKey = key;
	clearTimeout(item.timeout);
	if ((item.toast.promise && typeOf(item) === 'loading') || item.toast.duration === null || typeOf(item) === 'loading') return;
	if (paused) {
		if (item.lastCloseTimerStart < item.closeTimerStart) item.remaining -= Date.now() - item.closeTimerStart;
		item.lastCloseTimerStart = Date.now();
		return;
	}
	if (item.remaining === Infinity) return;
	item.closeTimerStart = Date.now();
	item.timeout = setTimeout(() => deleteToast(t, item), item.remaining);
}

/** A use of a control that shows a toast: sonner's Toaster takes it in a timeout after the call. */
export function sonnerAdd(props: SonnerToaster, toast: SonnerToast, commit: Commit, texts: Readonly<Record<string, string>> = {}): void {
	const t = toasterFor(props, commit);
	setTimeout(() => {
		const item: Item = { id: counter++, toast, phase: 0, texts, mounted: false, removed: false, offset: 0, offsetBeforeRemove: 0, initialHeight: 0, remaining: toast.duration ?? Infinity, closeTimerStart: 0, lastCloseTimerStart: 0, swiping: false, swiped: false, swipeOut: false, swipeDirection: null, swipeOutDirection: null, pointerStart: null, dragStart: 0 };
		setToasts(t, [item, ...t.toasts]);
		// The Toast's mount effect: its height as it enters goes first in the heights, then it is mounted and measured again.
		setTimeout(() => {
			measure(t, item, true);
			item.mounted = true;
			render(t);
			setTimeout(() => {
				measure(t, item, false);
				render(t);
			}, 0);
		}, 0);
		toast.phases.slice(1).forEach((phase, k) =>
			setTimeout(() => {
				if (!t.toasts.includes(item)) return;
				item.phase = k + 1;
				render(t);
				setTimeout(() => {
					measure(t, item, false);
					render(t);
				}, 0);
			}, phase.at),
		);
	}, 0);
}

/**
 * An event on a toaster's list for `position`, and on the toast it happened in: a list's handlers take its toasts' events
 * too, the toast's own first and the list's after (React's order).
 */
export function sonnerList(props: SonnerToaster, position: string, event: Event, commit: Commit): void {
	const t = toasterFor(props, commit);
	const index = t.rendered.findIndex((r) => r.position === position);
	const list = sectionOf(props.id) && index >= 0 ? [...sectionOf(props.id)!.children].filter((c) => c.tagName === 'OL')[index] : undefined;
	const target = event.target instanceof HTMLElement ? event.target : null;
	const li = target?.closest('li');
	if (li && list?.contains(li) && /^(pointerdown|pointerup|pointermove|click|dragend)$/.test(event.type)) {
		const rendered = t.rendered[index];
		const item = rendered?.items[[...list.children].indexOf(li)];
		if (item) toastEvent(t, item, li, event);
	}
	switch (event.type) {
		case 'mouseenter':
		case 'mousemove':
			return setExpanded(t, true);
		case 'mouseleave':
			if (!t.interacting) setExpanded(t, false);
			return;
		case 'dragend':
			return setExpanded(t, false);
		case 'pointerdown':
			if (target?.dataset.dismissible === 'false') return;
			t.interacting = true;
			return render(t);
		case 'pointerup':
			t.interacting = false;
			return render(t);
		case 'focusin': {
			if (target?.dataset.dismissible === 'false') return;
			if (!t.focusWithin) {
				t.focusWithin = true;
				const from = (event as FocusEvent).relatedTarget;
				t.lastFocused = from instanceof HTMLElement ? from : null;
			}
			return;
		}
		case 'focusout': {
			const to = (event as FocusEvent).relatedTarget;
			if (t.focusWithin && !(to instanceof Node && list?.contains(to))) {
				t.focusWithin = false;
				t.lastFocused?.focus({ preventScroll: true });
				t.lastFocused = null;
			}
			return;
		}
	}
}

function toastEvent(t: Toaster, item: Item, li: Element, event: Event): void {
	const dismissible = item.toast.dismissible;
	if (event.type === 'click') {
		const button = (event.target as Element).closest('button');
		if (!button || !li.contains(button)) return;
		if (button.hasAttribute('data-close-button')) {
			if (typeOf(item) !== 'loading' && dismissible) deleteToast(t, item);
		} else if (button.hasAttribute('data-cancel')) {
			if (dismissible) deleteToast(t, item);
		} else if (button.hasAttribute('data-action') && !event.defaultPrevented) deleteToast(t, item);
		return;
	}
	if (event.type === 'dragend') {
		item.swiping = false;
		item.swipeDirection = null;
		item.pointerStart = null;
		return render(t);
	}
	const pointer = event as PointerEvent;
	if (event.type === 'pointerdown') {
		if (pointer.button === 2 || typeOf(item) === 'loading' || !dismissible) return;
		item.dragStart = Date.now();
		item.offsetBeforeRemove = item.offset;
		(pointer.target as Element).setPointerCapture?.(pointer.pointerId);
		if ((pointer.target as Element).tagName === 'BUTTON') return;
		item.swiping = true;
		item.pointerStart = { x: pointer.clientX, y: pointer.clientY };
		return render(t);
	}
	if (event.type === 'pointerup') {
		if (item.swipeOut || !dismissible) return;
		item.pointerStart = null;
		const amountX = item.swipeX ?? 0;
		const amountY = item.swipeY ?? 0;
		const amount = item.swipeDirection === 'x' ? amountX : amountY;
		const velocity = Math.abs(amount) / (Date.now() - item.dragStart);
		if (Math.abs(amount) >= SWIPE_THRESHOLD || velocity > 0.11) {
			item.offsetBeforeRemove = item.offset;
			item.swipeOutDirection = item.swipeDirection === 'x' ? (amountX > 0 ? 'right' : 'left') : amountY > 0 ? 'down' : 'up';
			deleteToast(t, item);
			item.swipeOut = true;
			return render(t);
		}
		item.swipeX = 0;
		item.swipeY = 0;
		item.swiped = false;
		item.swiping = false;
		item.swipeDirection = null;
		return render(t);
	}
	if (event.type === 'pointermove') {
		if (!item.pointerStart || !dismissible) return;
		if ((window.getSelection()?.toString().length ?? 0) > 0) return;
		const yDelta = pointer.clientY - item.pointerStart.y;
		const xDelta = pointer.clientX - item.pointerStart.x;
		const directions = positionOf(t, item).split('-');
		// The handler reads the direction the toast last rendered with: one locked now applies from the next move.
		const locked = item.swipeDirection;
		if (!locked && (Math.abs(xDelta) > 1 || Math.abs(yDelta) > 1)) item.swipeDirection = Math.abs(xDelta) > Math.abs(yDelta) ? 'x' : 'y';
		const amount = { x: 0, y: 0 };
		const dampen = (delta: number) => {
			const damped = delta * (1 / (1.5 + Math.abs(delta) / 20));
			return Math.abs(damped) < Math.abs(delta) ? damped : delta;
		};
		if (locked === 'y' && (directions.includes('top') || directions.includes('bottom'))) amount.y = (directions.includes('top') && yDelta < 0) || (directions.includes('bottom') && yDelta > 0) ? yDelta : dampen(yDelta);
		else if (locked === 'x' && (directions.includes('left') || directions.includes('right'))) amount.x = (directions.includes('left') && xDelta < 0) || (directions.includes('right') && xDelta > 0) ? xDelta : dampen(xDelta);
		if (Math.abs(amount.x) > 0 || Math.abs(amount.y) > 0) item.swiped = true;
		item.swipeX = amount.x;
		item.swipeY = amount.y;
		return render(t);
	}
}

if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', () => {
		for (const t of toasters.values()) render(t);
	});
	document.addEventListener('keydown', (event) => {
		for (const t of toasters.values()) {
			const section = sectionOf(t.props.id);
			const lists = section ? [...section.children].filter((c): c is HTMLElement => c.tagName === 'OL') : [];
			// sonner's list ref is the list rendered last.
			const listRef = lists[lists.length - 1];
			if (t.props.hotkey.every((key) => (event as unknown as Record<string, unknown>)[key] || event.code === key)) {
				setExpanded(t, true);
				listRef?.focus();
			}
			if (event.code === 'Escape' && listRef && (document.activeElement === listRef || listRef.contains(document.activeElement))) setExpanded(t, false);
		}
	});
}
