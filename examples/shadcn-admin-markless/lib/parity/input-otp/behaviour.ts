// Parity port of input-otp (OTPInput as shadcn's input-otp.tsx wraps it): one transparent <input> laid over the
// slots, and the selection rules that decide which slot is active. The page keeps the value, focus and selection
// in its own cells; these functions compute them from the input.
export type Range = readonly [number | null, number | null];

const prev = new WeakMap<HTMLInputElement, [number | null, number | null]>();
const tracked = new WeakSet<HTMLInputElement>();

/** onFocus: the caret goes to the last character (or the end), as the library's focus handler sets it. */
export function focusRange(input: HTMLInputElement, maxLength: number): Range {
	const start = Math.min(input.value.length, maxLength - 1);
	const end = input.value.length;
	input.setSelectionRange(start, end);
	prev.set(input, [start, end]);
	return [start, end];
}

/** The library's selectionchange handler: a collapsed caret inside the value selects the one character it stands on. */
export function normalizeRange(input: HTMLInputElement): Range {
	if (document.activeElement !== input) {
		prev.set(input, [null, null]);
		return [null, null];
	}
	const start = input.selectionStart;
	const end = input.selectionEnd;
	const direction = input.selectionDirection;
	const max = input.maxLength;
	const value = input.value;
	const last = prev.get(input) ?? [null, null];
	let s = -1;
	let e = -1;
	let dir: 'forward' | 'backward' | undefined;
	if (value.length !== 0 && start !== null && end !== null) {
		const collapsed = start === end;
		const atEnd = start === value.length && value.length < max;
		if (collapsed && !atEnd) {
			const at = start;
			if (at === 0) {
				s = 0;
				e = 1;
				dir = 'forward';
			} else if (at === max) {
				s = at - 1;
				e = at;
				dir = 'backward';
			} else if (max > 1 && value.length > 1) {
				let shift = 0;
				if (last[0] !== null && last[1] !== null) {
					dir = at < last[1] ? 'backward' : 'forward';
					const wasCaret = last[0] === last[1] && last[0] < max;
					if (dir === 'backward' && !wasCaret) shift = -1;
				}
				s = shift + at;
				e = shift + at + 1;
			}
		}
		if (s !== -1 && e !== -1 && s !== e) input.setSelectionRange(s, e, dir ?? direction ?? undefined);
	}
	const range: [number | null, number | null] = [s !== -1 ? s : start, e !== -1 ? e : end];
	prev.set(input, range);
	return range;
}

/** Follows the selection while the input has focus (the library listens to selectionchange on the document). */
export function trackSelection(input: HTMLInputElement, onRange: (range: Range) => void): void {
	if (tracked.has(input)) return;
	tracked.add(input);
	document.addEventListener('selectionchange', () => onRange(normalizeRange(input)), { capture: true });
	injectStyle();
}

/** The value as the library's onChange keeps it: cut to maxLength. */
export function accept(input: HTMLInputElement, maxLength: number): string {
	return input.value.slice(0, maxLength);
}

export function slotChar(value: string, index: number): string {
	return value[index] ?? '';
}

export function slotActive(focused: boolean, start: number | null, end: number | null, index: number): boolean {
	return focused && start !== null && end !== null && ((start === end && index === start) || (index >= start && index < end));
}

function injectStyle(): void {
	if (document.getElementById('input-otp-style')) return;
	const style = document.createElement('style');
	style.id = 'input-otp-style';
	document.head.appendChild(style);
	const hide = 'background: transparent !important; color: transparent !important; border-color: transparent !important; opacity: 0 !important; box-shadow: none !important; -webkit-box-shadow: none !important; -webkit-text-fill-color: transparent !important;';
	for (const rule of [
		'[data-input-otp]::selection { background: transparent !important; color: transparent !important; }',
		`[data-input-otp]:autofill { ${hide} }`,
		`[data-input-otp]:-webkit-autofill { ${hide} }`,
		'@supports (-webkit-touch-callout: none) { [data-input-otp] { letter-spacing: -.6em !important; font-weight: 100 !important; font-stretch: ultra-condensed; font-optical-sizing: none !important; left: -1px !important; right: 1px !important; } }',
		'[data-input-otp] + * { pointer-events: all !important; }',
	]) {
		try {
			style.sheet?.insertRule(rule);
		} catch {
			console.error('input-otp could not insert CSS rule:', rule);
		}
	}
}
