// React Aria's interaction states on the elements its components render (useHover, usePress, useFocusRing, and the
// global modality useFocusVisible tracks): data-hovered while a mouse or pen is over the element, data-pressed while it
// is pressed, data-focused while it (or, for a label, its input) has focus, data-focus-visible when that focus came from
// the keyboard. Its listeners are the document's own, in the capture phase: every React Aria part imports this module,
// and the part that owns a gesture still gets it.

// useFocusVisible: focus is visible unless the last interaction was a pointer's (null before any, as for React Aria). A
// focus no key, pointer or focus() call led to (a screen reader's) is "virtual", and visible.
type Modality = 'keyboard' | 'pointer' | 'virtual';
let modality: Modality | null = null;
let eventBeforeFocus = false;
let blurredWindow = false;
export const keyboardModality = () => modality !== 'pointer';
export const pointerModality = () => modality === 'pointer';
export function setModality(next: Modality): void {
	modality = next;
	changed(next, null);
}

const visibleListeners = new Set<(visible: boolean) => void>();
/** useFocusVisibleListener: called with whether focus is visible each time the modality changes. */
export function onFocusVisibleChange(fn: (visible: boolean) => void): void {
	visibleListeners.add(fn);
}

const NON_TEXT = /^(checkbox|radio|range|color|file|image|button|submit|reset)$/;
const textInput = (el: Element | null) => (el instanceof HTMLInputElement && !NON_TEXT.test(el.type)) || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
// isKeyboardFocusEvent: in a text field only Tab and Escape change whether its focus shows.
const showsFocus = (next: Modality, e: Event | null) => !(textInput(document.activeElement) && next === 'keyboard' && e instanceof KeyboardEvent && e.key !== 'Tab' && e.key !== 'Escape');
function changed(next: Modality, e: Event | null): void {
	if (!showsFocus(next, e)) return;
	const active = document.activeElement;
	if (active instanceof Element && active !== document.body) refocus(active);
	for (const fn of visibleListeners) fn(keyboardModality());
}

const isMac = () => typeof navigator !== 'undefined' && /^Mac/i.test((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform);
const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const validKey = (e: KeyboardEvent) => !(e.metaKey || (!isMac() && e.altKey) || e.ctrlKey || e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta');
const virtualClick = (e: MouseEvent) => {
	const type = (e as PointerEvent).pointerType;
	if (type === '' && e.isTrusted) return true;
	if (isAndroid() && type) return e.type === 'click' && e.buttons === 1;
	return e.detail === 0 && !type;
};
if (typeof document !== 'undefined') {
	const key = (e: KeyboardEvent) => {
		eventBeforeFocus = true;
		if (!validKey(e)) return;
		modality = 'keyboard';
		changed('keyboard', e);
	};
	document.addEventListener('keydown', key, true);
	document.addEventListener('keyup', key, true);
	const pointer = (e: PointerEvent) => {
		modality = 'pointer';
		if (e.type !== 'pointerdown') return;
		eventBeforeFocus = true;
		changed('pointer', e);
	};
	for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) document.addEventListener(type, pointer, true);
	document.addEventListener('click', (e) => {
		if (!virtualClick(e)) return;
		eventBeforeFocus = true;
		modality = 'virtual';
	}, true);
	window.addEventListener('focus', (e) => {
		if (e.target === window || e.target === document || !e.isTrusted) return;
		if (!eventBeforeFocus && !blurredWindow) {
			modality = 'virtual';
			changed('virtual', e);
		}
		eventBeforeFocus = false;
		blurredWindow = false;
	}, true);
	window.addEventListener('blur', () => {
		eventBeforeFocus = false;
		blurredWindow = true;
	});
	// React Aria wraps focus() so that a script moving focus keeps the modality.
	const focus = HTMLElement.prototype.focus;
	Reflect.defineProperty(HTMLElement.prototype, 'focus', {
		configurable: true,
		writable: true,
		value: function (this: HTMLElement, ...args: Parameters<HTMLElement['focus']>) {
			eventBeforeFocus = true;
			focus.apply(this, args);
		},
	});
}

/** The element React Aria marks for a focused node: the node, or the label of a checkbox, radio or switch it sits in. */
function stateful(el: Element): HTMLElement | null {
	// A visually hidden input stands in for the element around it: a checkbox's label, a slider's thumb.
	if (el.matches('input:not([data-rac])')) return el.closest<HTMLElement>('label[data-rac], [data-rac]');
	return el.matches('[data-rac]') ? (el as HTMLElement) : null;
}

function markFocused(el: HTMLElement, on: boolean): void {
	if (on) {
		el.setAttribute('data-focused', 'true');
		if (keyboardModality()) el.setAttribute('data-focus-visible', 'true');
		else el.removeAttribute('data-focus-visible');
	} else {
		el.removeAttribute('data-focused');
		el.removeAttribute('data-focus-visible');
	}
}

// Parts React Aria marks while focus is within them (useFocusRing({ within: true }) and useFocusWithin): Tabs and
// Select with data-focused and data-focus-visible, Group with data-focus-within and data-focus-visible, Disclosure
// with data-focus-visible-within.
const WITHIN: readonly (readonly [selector: string, focused: string | null, visible: string | null])[] = [
	['[data-rac]:has(> [role="tablist"])', 'data-focused', 'data-focus-visible'],
	['[data-rac]:has(> button[aria-haspopup="listbox"]):not([role="group"])', 'data-focused', 'data-focus-visible'],
	['[data-rac]:not(input):not([role="group"]):has(input[role="combobox"])', 'data-focused', null],
	['[data-rac][role="group"]:not(section):not([aria-labelledby]):not(:has(input[type="range"], input[type="checkbox"]))', 'data-focus-within', 'data-focus-visible'],
	['[data-rac]:has(> * > button[slot="trigger"]), [data-rac]:has(> button[slot="trigger"])', null, 'data-focus-visible-within'],
];
function within(target: Element, related: EventTarget | null, on: boolean): void {
	for (const [selector, focused, visible] of WITHIN)
		for (let el = target.closest(selector); el; el = el.parentElement?.closest(selector) ?? null) {
			if (!on && related instanceof Node && el.contains(related)) continue;
			if (focused && on) el.setAttribute(focused, 'true');
			else if (focused) el.removeAttribute(focused);
			if (!visible) continue;
			if (on && keyboardModality()) el.setAttribute(visible, 'true');
			else el.removeAttribute(visible);
		}
}

function refocus(target: Element): void {
	const el = stateful(target);
	if (el) markFocused(el, true);
	within(target, null, true);
}

function focusin(target: Element): boolean {
	const el = stateful(target);
	if (el) markFocused(el, true);
	within(target, null, true);
	return false;
}

function focusout(target: Element, related: EventTarget | null): boolean {
	const el = stateful(target);
	if (el) markFocused(el, false);
	within(target, related, false);
	return false;
}

// Only React Aria Components write these states: a bare usePress element (a context menu's trigger area) has no data-rac.
const HOVERABLE = '[data-react-aria-pressable][data-rac], label[data-rac], input[data-rac], textarea[data-rac], [role="option"][data-rac], [role="menuitem"][data-rac], [role="menuitemcheckbox"][data-rac], [role="menuitemradio"][data-rac], [role="tab"][data-rac], [role="row"][data-rac]';
function pointerover(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch') return false;
	const el = target.closest<HTMLElement>(HOVERABLE);
	// TextArea passes useHover its DOM props, so `disabled` does not turn its hover off.
	if (el && (el instanceof HTMLTextAreaElement || (!el.hasAttribute('data-disabled') && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('disabled')))) el.setAttribute('data-hovered', 'true');
	return false;
}
function pointerout(target: Element, event: PointerEvent): boolean {
	const el = target.closest<HTMLElement>(HOVERABLE);
	if (el && !(event.relatedTarget instanceof Node && el.contains(event.relatedTarget))) el.removeAttribute('data-hovered');
	return false;
}

/** Elements held pressed by their overlay being open (a DialogTrigger's, MenuTrigger's or Select's trigger). */
const heldPressed = new WeakSet<Element>();
function pointerdown(target: Element, event: PointerEvent): boolean {
	const el = target.closest<HTMLElement>('[data-react-aria-pressable][data-rac], label[data-rac]');
	if (!el || event.button !== 0 || el.hasAttribute('disabled') || el.hasAttribute('data-disabled')) return false;
	el.setAttribute('data-pressed', 'true');
	const release = () => {
		document.removeEventListener('pointerup', release, true);
		document.removeEventListener('pointercancel', release, true);
		if (!heldPressed.has(el)) el.removeAttribute('data-pressed');
	};
	document.addEventListener('pointerup', release, true);
	document.addEventListener('pointercancel', release, true);
	return false;
}

/** Marks a trigger pressed while what it opened is open, as DialogTrigger, MenuTrigger and Select do. */
export function holdPressed(el: Element, on: boolean): void {
	if (on) {
		heldPressed.add(el);
		el.setAttribute('data-pressed', 'true');
	} else {
		heldPressed.delete(el);
		el.removeAttribute('data-pressed');
	}
}

if (typeof document !== 'undefined') {
	document.addEventListener('focusin', (e) => e.target instanceof Element && focusin(e.target), true);
	document.addEventListener('focusout', (e) => e.target instanceof Element && focusout(e.target, e.relatedTarget), true);
	document.addEventListener('pointerover', (e) => e.target instanceof Element && pointerover(e.target, e), true);
	document.addEventListener('pointerout', (e) => e.target instanceof Element && pointerout(e.target, e), true);
	document.addEventListener('pointerdown', (e) => e.target instanceof Element && pointerdown(e.target, e), true);
}

// autoFocus (focusSafely): the last visible control convert marked data-mm-autofocus takes focus, without scrolling.
if (typeof document !== 'undefined') {
	const FOCUSABLE = 'input:not([type="hidden"]), textarea, select, button, [tabindex]';
	const marked = [...document.querySelectorAll<HTMLElement>('[data-mm-autofocus]')].filter((el) => !el.closest('[hidden], [data-mm-layer]') && el.getClientRects().length);
	const last = marked[marked.length - 1];
	const target = last && (last.matches(FOCUSABLE) ? last : last.querySelector<HTMLElement>(FOCUSABLE));
	if (target && (document.activeElement === document.body || document.activeElement === null)) target.focus({ preventScroll: true });
}
