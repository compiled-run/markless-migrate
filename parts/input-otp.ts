// input-otp 1.4.2 (OTPInput): one transparent input over the slots. What the slots show is the converter's state
// (mmotp on the container: the value, the input's mirrored selection and focus); this part runs the library's input,
// focus and selectionchange handling on the real input and dispatches that state.

export interface OtpState {
	readonly v: string;
	/** The mirrored selection start and end, -1 for none (React leaves data-input-otp-mss/mse off). */
	readonly s: number;
	readonly e: number;
	readonly f: boolean;
}

type Direction = 'forward' | 'backward' | 'none';
type Prev = readonly [number | null, number | null, Direction | null];

interface Otp {
	readonly input: HTMLInputElement;
	readonly container: HTMLElement;
	value: string;
	state: OtpState;
	prev: Prev;
	badge: boolean;
	badgeDone: boolean;
}

const INPUT = 'input[data-input-otp]';
const otps = new WeakMap<HTMLInputElement, Otp>();
let listening = false;
const PWM_BADGE_SPACE = 40;
const PWM_BADGE_MARGIN_RIGHT = 18;

function otpOf(el: Element): Otp | undefined {
	if (!(el instanceof HTMLInputElement) || !el.matches(INPUT)) return undefined;
	const known = otps.get(el);
	if (known) return known;
	const container = el.closest<HTMLElement>('[data-input-otp-container]');
	if (!container) return undefined;
	const at = (name: string) => (el.hasAttribute(name) ? Number(el.getAttribute(name)) : -1);
	const otp: Otp = { input: el, container, value: el.value, state: { v: el.value, s: at('data-input-otp-mss'), e: at('data-input-otp-mse'), f: false }, prev: [el.selectionStart, el.selectionEnd, el.selectionDirection], badge: false, badgeDone: false };
	otps.set(el, otp);
	return otp;
}

/**
 * The library's onDocumentSelectionChange for a focused input: a single caret on a filled slot selects that slot (the
 * one before it when moving back), so the slot shows active. Returns the mirrored selection and the range to select.
 */
export function mirror(value: string, s: number | null, e: number | null, dir: Direction | null, maxLength: number, prev: Prev): { start: number | null; end: number | null; direction: Direction | null; select?: readonly [number, number, Direction | undefined] } {
	let start = -1;
	let end = -1;
	let direction: Direction | undefined;
	let select: readonly [number, number, Direction | undefined] | undefined;
	if (value.length !== 0 && s !== null && e !== null) {
		const isSingleCaret = s === e;
		const isInsertMode = s === value.length && value.length < maxLength;
		if (isSingleCaret && !isInsertMode) {
			const c = s;
			if (c === 0) {
				start = 0;
				end = 1;
				direction = 'forward';
			} else if (c === maxLength) {
				start = c - 1;
				end = c;
				direction = 'backward';
			} else if (maxLength > 1 && value.length > 1) {
				let offset = 0;
				if (prev[0] !== null && prev[1] !== null) {
					direction = c < prev[1] ? 'backward' : 'forward';
					const wasPreviouslyInserting = prev[0] === prev[1] && prev[0] < maxLength;
					if (direction === 'backward' && !wasPreviouslyInserting) offset = -1;
				}
				start = offset + c;
				end = offset + c + 1;
			}
		}
		if (start !== -1 && end !== -1 && start !== end) select = [start, end, direction];
	}
	return { start: start !== -1 ? start : s, end: end !== -1 ? end : e, direction: direction ?? dir, ...(select ? { select } : {}) };
}

/** The value an input event leaves: cut to the length, or the previous value when the pattern refuses it. */
export function accept(next: string, previous: string, maxLength: number, pattern: string | null): string {
	const value = next.slice(0, maxLength);
	if (value.length > 0 && pattern && !new RegExp(pattern).test(value)) return previous;
	return value;
}

function publish(o: Otp, next: Partial<OtpState>): void {
	const state = { ...o.state, ...next };
	if (state.v === o.state.v && state.s === o.state.s && state.e === o.state.e && state.f === o.state.f) return;
	o.state = state;
	o.container.dispatchEvent(new CustomEvent<OtpState>('mmotp', { detail: state }));
}

// Every field listens: one that is not focused drops its mirrored selection on any selection change in the page.
function onSelectionChange(): void {
	const active = document.activeElement;
	for (const el of document.querySelectorAll<HTMLInputElement>(INPUT)) {
		if (el === active) continue;
		// A disabled field has no state of its own: its attributes are the old page's markup.
		if (el.disabled) {
			el.removeAttribute('data-input-otp-mss');
			el.removeAttribute('data-input-otp-mse');
			continue;
		}
		const other = otpOf(el);
		if (other) publish(other, { s: -1, e: -1 });
	}
	const o = active instanceof HTMLInputElement ? otps.get(active) : undefined;
	if (!o) return;
	const input = o.input;
	const m = mirror(input.value, input.selectionStart, input.selectionEnd, input.selectionDirection, input.maxLength, o.prev);
	if (m.select) input.setSelectionRange(m.select[0], m.select[1], m.select[2]);
	o.prev = [m.start, m.end, m.direction];
	publish(o, { s: m.start ?? -1, e: m.end ?? -1 });
}

// The library's syncTimeouts after a value or focus change: the mirror follows the input's own selection.
function sync(o: Otp): void {
	const run = () => {
		const s = o.input.selectionStart;
		const e = o.input.selectionEnd;
		if (s === null || e === null) return;
		o.prev = [s, e, o.input.selectionDirection];
		publish(o, { s, e });
	};
	for (const ms of [0, 10, 50]) setTimeout(run, ms);
}

// usePasswordManagerBadge with the default 'increase-width': once focused, a point near the container's right edge that
// is not the container (with its pointer-events: none, the input itself) widens the input by 40px when there is room.
function trackBadge(o: Otp): void {
	if (o.badgeDone) return;
	const check = () => {
		if (o.badge) return;
		const rect = o.container.getBoundingClientRect();
		const found = document.elementFromPoint(rect.left + o.container.offsetWidth - PWM_BADGE_MARGIN_RIGHT, rect.top + o.container.offsetHeight / 2);
		if (found === o.container) return;
		o.badge = true;
		o.badgeDone = true;
		widen(o);
	};
	for (const ms of [0, 2000, 5000]) setTimeout(check, ms);
	setTimeout(() => (o.badgeDone = true), 6000);
}

function widen(o: Otp): void {
	const room = window.innerWidth - o.container.getBoundingClientRect().right >= PWM_BADGE_SPACE;
	const push = o.badge && room;
	o.input.style.width = push ? `calc(100% + ${PWM_BADGE_SPACE}px)` : '100%';
	if (push) o.input.style.clipPath = `inset(0 ${PWM_BADGE_SPACE}px 0 0)`;
	else o.input.style.removeProperty('clip-path');
}

export function input(target: Element): boolean {
	const o = otpOf(target);
	if (!o) return false;
	const input = o.input;
	const value = accept(input.value, o.value, input.maxLength, input.getAttribute('pattern'));
	if (value !== input.value) input.value = value;
	if (value.length < o.value.length) onSelectionChange();
	if (value === o.value) return true;
	o.value = value;
	publish(o, { v: value });
	sync(o);
	return true;
}

export function focusin(target: Element): boolean {
	const o = otpOf(target);
	if (!o) return false;
	if (!listening) {
		listening = true;
		document.addEventListener('selectionchange', onSelectionChange, { capture: true });
		window.addEventListener('resize', () => {
			for (const el of document.querySelectorAll<HTMLInputElement>(INPUT)) {
				const known = otps.get(el);
				if (known?.badge) widen(known);
			}
		});
	}
	const start = Math.min(o.input.value.length, o.input.maxLength - 1);
	const end = o.input.value.length;
	o.input.setSelectionRange(start, end);
	o.prev = [start, end, o.input.selectionDirection];
	publish(o, { s: start, e: end, f: true });
	sync(o);
	trackBadge(o);
	return true;
}

export function focusout(target: Element): boolean {
	const o = otpOf(target);
	if (!o) return false;
	publish(o, { f: false });
	sync(o);
	return true;
}
