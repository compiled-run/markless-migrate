// React Aria's interaction states on the elements its components render (useHover, usePress, useFocusRing, and the
// global modality useFocusVisible tracks): data-hovered while a mouse or pen is over the element, data-pressed while it
// is pressed, data-focused while it (or, for a label, its input) has focus, data-focus-visible when that focus came from
// the keyboard. Its listeners are the document's own, in the capture phase: every React Aria part imports this module,
// and the part that owns a gesture still gets it.

// useFocusVisible: focus is visible unless the last interaction was a pointer's; focus no key or pointer led to (a
// script's) is "virtual", and visible.
let modality: 'keyboard' | 'pointer' | 'virtual' = 'virtual';
let interacted = false;
export const keyboardModality = () => modality !== 'pointer';
/** Whether the last interaction was a pointer's, moving included: a hover that follows from moving the mouse. */
export const pointerModality = () => modality === 'pointer';
export function setModality(next: 'keyboard' | 'pointer' | 'virtual'): void {
	modality = next;
}

const MODIFIER = /^(Meta|Control|Shift|Alt|CapsLock)$/;
if (typeof document !== 'undefined') {
	document.addEventListener('keydown', (e) => {
		interacted = true;
		if (e.metaKey || (e.altKey && !e.ctrlKey) || e.ctrlKey || MODIFIER.test(e.key)) return;
		const was = modality;
		modality = 'keyboard';
		// useFocusRing follows the modality: what has focus shows its ring once the keyboard is used.
		const active = document.activeElement;
		if (was === 'pointer' && active instanceof Element && active !== document.body) refocus(active);
	}, true);
	const press = () => {
		interacted = true;
		modality = 'pointer';
	};
	for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) document.addEventListener(type, press, true);
	// A hover comes from moving the pointer: the pointermove that follows pointerover would say so a moment later.
	for (const type of ['pointermove', 'mousemove']) document.addEventListener(type, () => (modality = 'pointer'), true);
	document.addEventListener('pointerover', (e) => e.pointerType !== 'touch' && (modality = 'pointer'), true);
	document.addEventListener('focus', (e) => {
		if (e.target !== window && e.target !== document && !interacted) modality = 'virtual';
		interacted = false;
	}, true);
}

const RAC = '[data-rac], [data-react-aria-pressable]';
/** The element React Aria marks for a focused node: the node, or the label of a checkbox, radio or switch it sits in. */
function stateful(el: Element): HTMLElement | null {
	// A visually hidden input stands in for the element around it: a checkbox's label, a slider's thumb.
	if (el.matches('input:not([data-rac])')) return el.closest<HTMLElement>('label[data-rac], [data-rac]');
	return el.matches(RAC) ? (el as HTMLElement) : null;
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

const HOVERABLE = '[data-react-aria-pressable], label[data-rac], input[data-rac], textarea[data-rac], [role="option"][data-rac], [role="menuitem"][data-rac], [role="menuitemcheckbox"][data-rac], [role="menuitemradio"][data-rac], [role="tab"][data-rac], [role="row"][data-rac]';
function pointerover(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch') return false;
	const el = target.closest<HTMLElement>(HOVERABLE);
	if (el && !el.hasAttribute('data-disabled') && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('disabled')) el.setAttribute('data-hovered', 'true');
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
	const el = target.closest<HTMLElement>('[data-react-aria-pressable], label[data-rac]');
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
