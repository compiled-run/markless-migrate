// Base UI 1.6's Toast (ToastStore, ToastViewport, ToastRoot, ToastContent) over a Markless state() per viewport that
// convert's NotifyPlan renders (a root per toast, newest first): a use adds its toast at the front; the store gives each
// toast its index among those not leaving, its offset by the heights before it and whether it is past the limit; hover or
// keyboard focus in the viewport expands it and pauses every timer, as does the window losing focus; a toast enters
// from data-starting-style, leaves through data-ending-style and is removed once its animations end; a swipe past 40 px
// down or right, its close or action button, or Escape in it closes it. What a toast shows over its life (a promise's
// loading, then its result) is what the old page showed; the converter renders each, showing the current one.

/** The Provider's props, as the old page rendered it. */
export interface BaseToaster {
	readonly id: string;
	readonly timeout: number;
	readonly limit: number;
}

/** What a control's use shows: its toast's options and each markup it showed, from when. */
export interface BaseToastSpec {
	readonly view: number;
	/** The toast's own timeout, if it gave one. */
	readonly timeout?: number;
	readonly priority?: 'high' | 'low';
	readonly phases: readonly { readonly at: number; readonly type?: string; readonly attrs: Readonly<Record<string, string>> }[];
}

export interface BaseToastItemView {
	readonly id: number;
	/** The arm of what it shows: `<toast>.<phase>`. */
	readonly view: string;
	readonly a: Readonly<Record<string, string | undefined>>;
	/** ToastContent's own state attributes. */
	readonly c: { readonly expanded?: string; readonly behind?: string };
}
export interface BaseToastView {
	readonly style?: string;
	readonly expanded?: string;
	readonly items: readonly BaseToastItemView[];
	/** The high-priority toasts the viewport announces in its hidden alerts, while focus is not in it. */
	readonly alerts: readonly { readonly id: number; readonly view: string }[];
}
export const BASE_TOAST_EMPTY: BaseToastView = { items: [], alerts: [] };
/** The attributes ToastRoot writes from its own state, not from what it shows. */
export const BASE_TOAST_STATE: ReadonlySet<string> = new Set(['data-expanded', 'data-limited', 'data-starting-style', 'data-ending-style', 'data-swiping', 'data-swipe-direction', 'inert', 'aria-hidden', 'style']);

type Commit = (view: BaseToastView) => void;
type Status = 'starting' | 'ending' | undefined;

const SWIPE_THRESHOLD = 40;
const REVERSE_CANCEL_THRESHOLD = 10;
const SWIPE_DIRECTIONS = ['down', 'right'];

interface Item {
	readonly id: number;
	readonly spec: BaseToastSpec;
	phase: number;
	status: Status;
	limited: boolean;
	height: number;
	timer?: { timeout?: ReturnType<typeof setTimeout>; start: number; delay: number; remaining: number };
	swiping: boolean;
	swipeDirection?: string;
	dragDismissed: boolean;
	drag: { x: number; y: number };
	initial: { x: number; y: number; scale: number };
	pointerId: number | null;
	start: { x: number; y: number };
	baseline: { x: number; y: number };
	firstMove: boolean;
	realSwipe: boolean;
	locked: 'horizontal' | 'vertical' | null;
	intended?: string;
	maxDisplacement: number;
	cancelled: boolean;
}

interface Store {
	props: BaseToaster;
	viewport: Element | null;
	commit: Commit;
	toasts: Item[];
	hovering: boolean;
	focused: boolean;
	windowFocused: boolean;
	paused: boolean;
	readyForLeave: boolean;
	touchActive: boolean;
}

const stores = new Map<string, Store>();
let counter = 1;

const viewportOf = (id: string) => document.querySelector(`[data-mm-base-toaster="${CSS.escape(id)}"]`);

function storeFor(props: BaseToaster, commit: Commit): Store {
	const viewport = viewportOf(props.id);
	let s = stores.get(props.id);
	// A new page renders the viewport afresh: what the old one held went with it.
	if (!s || s.viewport !== viewport) stores.set(props.id, (s = { props, viewport, commit, toasts: [], hovering: false, focused: false, windowFocused: true, paused: false, readyForLeave: false, touchActive: false }));
	s.commit = commit;
	return s;
}

const typeOf = (item: Item) => item.spec.phases[item.phase]?.type;
const expanded = (s: Store) => s.hovering || s.focused;
const on = (b: boolean) => (b ? '' : undefined);

function applyLimited(s: Store): void {
	let active = 0;
	for (const t of s.toasts) {
		if (t.status === 'ending') continue;
		t.limited = active >= s.props.limit;
		active++;
	}
}

function render(s: Store): void {
	let visible = 0;
	let offsetY = 0;
	const items = s.toasts.map((item, domIndex): BaseToastItemView => {
		const ending = item.status === 'ending';
		const visibleIndex = ending ? -1 : visible++;
		const offset = offsetY;
		offsetY += item.height;
		const moved = item.swiping || item.drag.x !== item.initial.x || item.drag.y !== item.initial.y || item.dragDismissed;
		const dx = item.drag.x - item.initial.x;
		const dy = item.drag.y - item.initial.y;
		const drag = moved ? `${item.swiping ? `transition: none; transform: translateX(${item.drag.x}px) translateY(${item.drag.y}px) scale(${item.initial.scale}); ` : ''}--toast-swipe-movement-x: ${dx}px; --toast-swipe-movement-y: ${dy}px;` : '--toast-swipe-movement-x: 0px; --toast-swipe-movement-y: 0px;';
		const style = `${drag} --toast-index: ${ending ? domIndex : visibleIndex}; --toast-offset-y: ${offset}px;${item.height ? ` --toast-height: ${item.height}px;` : ''}`;
		const high = item.spec.priority === 'high';
		return {
			id: item.id,
			view: `${item.spec.view}.${item.phase}`,
			a: {
				...item.spec.phases[item.phase]!.attrs,
				'aria-hidden': high && !s.focused ? 'true' : undefined,
				inert: on(item.limited),
				'data-expanded': on(expanded(s)),
				'data-limited': on(item.limited),
				'data-starting-style': on(item.status === 'starting'),
				'data-ending-style': on(ending),
				'data-swiping': on(item.swiping),
				'data-swipe-direction': item.swipeDirection,
				style,
			},
			c: { expanded: on(expanded(s)), behind: on(visibleIndex > 0) },
		};
	});
	const front = s.toasts[0]?.height ?? 0;
	const alerts = s.focused ? [] : s.toasts.filter((t) => t.spec.priority === 'high').map((t) => ({ id: t.id, view: `${t.spec.view}.${t.phase}` }));
	s.commit({ ...(front ? { style: `--toast-frontmost-height: ${front}px;` } : {}), expanded: on(expanded(s)), items, alerts });
}

// ToastRoot measures itself in a layout effect, after the browser has the markup: the element is found where it was rendered.
function elementOf(s: Store, item: Item): HTMLElement | undefined {
	const viewport = viewportOf(s.props.id);
	const roots = viewport ? [...viewport.children].filter((c): c is HTMLElement => c.getAttribute('data-slot') === 'toast') : [];
	return roots[s.toasts.indexOf(item)];
}

// recalculateHeight: the root's natural height, which also ends its starting status.
function measure(s: Store, item: Item): void {
	const el = elementOf(s, item);
	if (!el) return;
	const previous = el.style.height;
	el.style.height = 'auto';
	item.height = el.offsetHeight;
	el.style.height = previous;
	if (item.status === 'starting') item.status = undefined;
}

// The layout effect runs before the browser paints: a toast rendered at once is measured at once, its first frame already
// moving from data-starting-style.
function settle(s: Store, item: Item): void {
	const done = () => {
		measure(s, item);
		render(s);
	};
	if (elementOf(s, item)) done();
	else setTimeout(done);
}

function scheduleTimer(s: Store, item: Item, delay: number): void {
	const active = !(expanded(s) || !s.windowFocused);
	item.timer = { delay, remaining: delay, start: active ? Date.now() : 0, ...(active ? { timeout: setTimeout(() => fired(s, item), delay) } : {}) };
}

function fired(s: Store, item: Item): void {
	item.timer = undefined;
	if (!s.toasts.some((t) => t.timer)) s.paused = false;
	closeToast(s, item);
}

function clearTimer(s: Store, item: Item): void {
	clearTimeout(item.timer?.timeout);
	item.timer = undefined;
	if (!s.toasts.some((t) => t.timer)) s.paused = false;
}

function pauseTimers(s: Store): void {
	if (s.paused) return;
	s.paused = true;
	for (const t of s.toasts) {
		if (!t.timer?.timeout) continue;
		clearTimeout(t.timer.timeout);
		t.timer.timeout = undefined;
		t.timer.remaining = Math.max(0, t.timer.delay - (Date.now() - t.timer.start));
	}
}

function resumeTimers(s: Store): void {
	if (!s.paused) return;
	s.paused = false;
	for (const t of s.toasts) {
		const timer = t.timer;
		if (!timer) continue;
		timer.remaining = timer.remaining > 0 ? timer.remaining : timer.delay;
		clearTimeout(timer.timeout);
		timer.timeout = setTimeout(() => fired(s, t), timer.remaining);
		timer.start = Date.now();
	}
}

function closeToast(s: Store, item: Item): void {
	if (!s.toasts.includes(item) || item.status === 'ending') return;
	clearTimer(s, item);
	item.status = 'ending';
	item.height = 0;
	applyLimited(s);
	if (!s.toasts.some((t) => t.status !== 'ending')) s.hovering = s.focused = false;
	const viewport = viewportOf(s.props.id);
	const focusedIn = Boolean(viewport?.contains(document.activeElement) && document.activeElement?.matches(':focus-visible'));
	const at = s.toasts.indexOf(item);
	render(s);
	if (focusedIn) {
		const next = s.toasts.slice(at + 1).find((t) => t.status !== 'ending') ?? s.toasts.slice(0, at).reverse().find((t) => t.status !== 'ending');
		if (next) elementOf(s, next)?.focus();
	}
	// useOpenChangeComplete: removed once every animation on the root has finished.
	requestAnimationFrame(() => {
		const el = elementOf(s, item);
		Promise.all((el?.getAnimations() ?? []).map((a) => a.finished))
			.catch(() => {})
			.then(() => removeToast(s, item));
	});
}

function removeToast(s: Store, item: Item): void {
	if (!s.toasts.includes(item)) return;
	s.toasts = s.toasts.filter((t) => t !== item);
	if (!s.toasts.length) s.hovering = s.focused = false;
	render(s);
	flushMouseLeave(s);
}

function flushMouseLeave(s: Store): void {
	if (s.toasts.some((t) => t.status === 'ending') || s.touchActive || !s.readyForLeave) return;
	if (s.windowFocused) resumeTimers(s);
	s.hovering = false;
	s.readyForLeave = false;
	render(s);
}

/** A use of a control that shows a toast: the manager's add, and a promise's result at the time the old page showed it. */
export function baseToastAdd(props: BaseToaster, spec: BaseToastSpec, commit: Commit): void {
	const s = storeFor(props, commit);
	const item: Item = { id: counter++, spec, phase: 0, status: 'starting', limited: false, height: 0, swiping: false, dragDismissed: false, drag: { x: 0, y: 0 }, initial: { x: 0, y: 0, scale: 1 }, pointerId: null, start: { x: 0, y: 0 }, baseline: { x: 0, y: 0 }, firstMove: false, realSwipe: false, locked: null, maxDisplacement: 0, cancelled: false };
	s.toasts = [item, ...s.toasts];
	applyLimited(s);
	const timeout = spec.timeout ?? props.timeout;
	if (typeOf(item) !== 'loading' && timeout > 0) scheduleTimer(s, item, timeout);
	if (expanded(s) || !s.windowFocused) pauseTimers(s);
	render(s);
	settle(s, item);
	spec.phases.slice(1).forEach((phase, k) =>
		setTimeout(() => {
			if (!s.toasts.includes(item) || item.status === 'ending') return;
			const wasLoading = typeOf(item) === 'loading';
			item.phase = k + 1;
			if (typeOf(item) !== 'loading' && timeout > 0 && (wasLoading || !item.timer)) {
				clearTimer(s, item);
				scheduleTimer(s, item, timeout);
				if (expanded(s) || !s.windowFocused) pauseTimers(s);
			}
			render(s);
			settle(s, item);
		}, phase.at),
	);
}

const focusVisible = (el: Element | null) => Boolean(el?.matches(':focus-visible'));

/** An event on a viewport, and on the toast it happened in: the toast's own handlers first, the viewport's after (React's order). */
export function baseToastViewport(props: BaseToaster, event: Event, commit: Commit): void {
	const s = storeFor(props, commit);
	const viewport = viewportOf(props.id);
	const target = event.target instanceof Element ? event.target : null;
	const root = target?.closest<HTMLElement>('[data-slot="toast"]');
	const item = root && viewport?.contains(root) ? s.toasts[[...viewport.children].filter((c) => c.getAttribute('data-slot') === 'toast').indexOf(root)] : undefined;
	if (item && root) toastEvent(s, item, root, event);
	switch (event.type) {
		case 'mouseenter':
		case 'mousemove':
			pauseTimers(s);
			s.readyForLeave = false;
			if (!s.hovering) {
				s.hovering = true;
				render(s);
			}
			return;
		case 'mouseleave':
			if (s.toasts.some((t) => t.status === 'ending') || s.touchActive) s.readyForLeave = true;
			else {
				if (s.windowFocused) resumeTimers(s);
				s.hovering = false;
				render(s);
			}
			return;
		case 'focusin':
		case 'click':
			if (!s.focused && focusVisible(document.activeElement)) {
				s.focused = true;
				pauseTimers(s);
				render(s);
			}
			return;
		case 'focusout': {
			const to = (event as FocusEvent).relatedTarget;
			if (!s.focused || (to instanceof Node && viewport?.contains(to))) return;
			s.focused = false;
			if (s.windowFocused) resumeTimers(s);
			render(s);
			return;
		}
		case 'pointerdown':
			if ((event as PointerEvent).pointerType === 'touch') s.touchActive = true;
			return;
		case 'pointerup':
		case 'pointercancel':
			if ((event as PointerEvent).pointerType !== 'touch') return;
			s.touchActive = false;
			flushMouseLeave(s);
			return;
	}
}

// getElementTransform: the root's translate and scale as it stands.
function transformOf(el: HTMLElement): { x: number; y: number; scale: number } {
	const t = getComputedStyle(el).transform;
	if (!t || t === 'none') return { x: 0, y: 0, scale: 1 };
	const m = new DOMMatrixReadOnly(t);
	return { x: m.m41, y: m.m42, scale: Math.hypot(m.m11, m.m12) };
}

const displacement = (direction: string, dx: number, dy: number) => (direction === 'up' ? -dy : direction === 'down' ? dy : direction === 'left' ? -dx : dx);
const damp = (d: number) => (d > 0 ? d ** 0.5 : -(Math.abs(d) ** 0.5));

function toastEvent(s: Store, item: Item, root: HTMLElement, event: Event): void {
	if (event.type === 'click') {
		const button = (event.target as Element).closest('button');
		if (button && root.contains(button) && /^toast-(close|action)$/.test(button.getAttribute('data-slot') ?? '')) closeToast(s, item);
		return;
	}
	if (event.type === 'keydown') {
		if ((event as KeyboardEvent).key === 'Escape' && root.contains(document.activeElement)) closeToast(s, item);
		return;
	}
	const pointer = event as PointerEvent;
	if (event.type === 'pointerdown') {
		if (pointer.button !== 0) return;
		if (pointer.pointerType === 'touch') pauseTimers(s);
		if ((pointer.target as Element).closest('button,a,input,textarea,[role="button"],[data-base-ui-swipe-ignore],[data-swipe-ignore]')) return;
		item.cancelled = false;
		item.intended = undefined;
		item.maxDisplacement = 0;
		item.pointerId = pointer.pointerId;
		item.start = { x: pointer.clientX, y: pointer.clientY };
		item.baseline = item.start;
		item.initial = transformOf(root);
		item.drag = { x: item.initial.x, y: item.initial.y };
		s.hovering = true;
		item.swiping = true;
		item.realSwipe = false;
		item.locked = null;
		item.firstMove = true;
		const end = (e: PointerEvent) => swipeEnd(s, item, e);
		document.addEventListener('pointerup', end, { once: true });
		document.addEventListener('pointercancel', end, { once: true });
		root.setPointerCapture?.(pointer.pointerId);
		render(s);
		return;
	}
	if (event.type === 'pointermove') {
		if (pointer.pointerId !== item.pointerId) return;
		pointer.preventDefault();
		if (item.firstMove) {
			item.start = { x: pointer.clientX, y: pointer.clientY };
			item.firstMove = false;
		}
		const { clientX, clientY, movementX, movementY } = pointer;
		if ((movementY < 0 && clientY > item.baseline.y) || (movementY > 0 && clientY < item.baseline.y)) item.baseline = { x: item.baseline.x, y: clientY };
		if ((movementX < 0 && clientX > item.baseline.x) || (movementX > 0 && clientX < item.baseline.x)) item.baseline = { x: clientX, y: item.baseline.y };
		const dx = clientX - item.start.x;
		const dy = clientY - item.start.y;
		// The handler reads the lock the toast last rendered with: one taken now applies from the next move.
		const locked = item.locked;
		if (!item.realSwipe && Math.hypot(dx, dy) >= 1) {
			item.realSwipe = true;
			if (item.locked === null) item.locked = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
		}
		if (!item.intended) {
			const candidate = locked === 'vertical' ? (dy > 0 ? 'down' : dy < 0 ? 'up' : undefined) : locked === 'horizontal' ? (dx > 0 ? 'right' : dx < 0 ? 'left' : undefined) : Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
			if (candidate && SWIPE_DIRECTIONS.includes(candidate)) {
				item.intended = candidate;
				item.maxDisplacement = displacement(candidate, dx, dy);
				item.swipeDirection = candidate;
			}
		} else {
			const current = displacement(item.intended, clientX - item.baseline.x, clientY - item.baseline.y);
			if (current > SWIPE_THRESHOLD) {
				item.cancelled = false;
				item.swipeDirection = item.intended;
			} else if (item.maxDisplacement - current >= REVERSE_CANCEL_THRESHOLD) item.cancelled = true;
		}
		const x = dx < 0 ? damp(dx) : dx;
		const y = dy < 0 ? damp(dy) : dy;
		item.drag = { x: item.initial.x + (locked !== 'vertical' ? x : 0), y: item.initial.y + (locked !== 'horizontal' ? y : 0) };
		render(s);
	}
}

function swipeEnd(s: Store, item: Item, event: PointerEvent): void {
	if (event.pointerId !== item.pointerId) return;
	item.pointerId = null;
	item.swiping = false;
	item.realSwipe = false;
	item.locked = null;
	const reset = () => {
		item.drag = { x: item.initial.x, y: item.initial.y };
		item.swipeDirection = undefined;
		render(s);
	};
	if (event.type === 'pointercancel' || item.cancelled) return reset();
	const dx = item.drag.x - item.initial.x;
	const dy = item.drag.y - item.initial.y;
	const direction = SWIPE_DIRECTIONS.find((d) => (d === 'right' ? dx > SWIPE_THRESHOLD : d === 'left' ? dx < -SWIPE_THRESHOLD : d === 'down' ? dy > SWIPE_THRESHOLD : dy < -SWIPE_THRESHOLD));
	if (!direction) return reset();
	item.swipeDirection = direction;
	item.dragDismissed = true;
	closeToast(s, item);
}

if (typeof window !== 'undefined') {
	window.addEventListener('blur', (event) => {
		if (event.target !== window) return;
		for (const s of stores.values()) {
			s.windowFocused = false;
			pauseTimers(s);
		}
	}, true);
	window.addEventListener('focus', (event) => {
		if ((event as FocusEvent).relatedTarget) return;
		for (const s of stores.values()) {
			const viewport = viewportOf(s.props.id);
			if (event.target === window || !(event.target instanceof Node && viewport?.contains(event.target)) || !focusVisible(document.activeElement)) resumeTimers(s);
			setTimeout(() => (s.windowFocused = true));
		}
	}, true);
	// The viewport's global F6: focus moves to the viewport, which expands it and pauses its timers.
	window.addEventListener('keydown', (event) => {
		if (event.key !== 'F6') return;
		for (const s of stores.values()) {
			const viewport = viewportOf(s.props.id);
			if (!s.toasts.length || !(viewport instanceof HTMLElement) || event.target === viewport) continue;
			event.preventDefault();
			viewport.focus({ preventScroll: true });
			pauseTimers(s);
			s.focused = true;
			render(s);
		}
	});
}
