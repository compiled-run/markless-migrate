// A radio group's arrows (Base UI RadioGroup, Radix RadioGroup) move focus to the next enabled radio, looping, and
// choose it; a single-choice toggle group's (Radix ToggleGroup's roving focus) only move focus.
export function radioKeys(event: KeyboardEvent, choose: boolean): void {
	const radio = (event.target as Element | null)?.closest<HTMLElement>('[role="radio"]');
	const group = radio?.closest<HTMLElement>('[role="radiogroup"]') ?? radio?.closest<HTMLElement>('[role="group"]');
	if (!radio || !group) return;
	const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')].filter((r) => (r.closest('[role="radiogroup"]') ?? r.closest('[role="group"]')) === group && !r.hasAttribute('disabled') && r.getAttribute('aria-disabled') !== 'true' && !r.hasAttribute('data-disabled'));
	const rtl = getComputedStyle(group).direction === 'rtl';
	const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
	const at = radios.indexOf(radio);
	// Base UI's RadioGroup has no Home or End: the key goes on to the page (scrolling it), the choice stays.
	const ends = !/^base-ui-/.test(radio.id);
	const to = step ? radios[(at + step + radios.length) % radios.length] : ends && event.key === 'Home' ? radios[0] : ends && event.key === 'End' ? radios[radios.length - 1] : undefined;
	if (!to) return;
	event.preventDefault();
	to.focus();
	if (choose) to.click();
}

// Radix RovingFocusGroup, as ToggleGroup and RadioGroup use it: an item's arrows (along its data-orientation, Left and
// Right swapped right to left), Home, End, PageUp and PageDown move focus in a timeout to the next focusable item,
// looping; the item focused is the group's tab stop. A RadioGroup item focused while an arrow is held is chosen, and
// Enter does nothing on it or on a Checkbox.
const RADIX_ITEM = '[data-radix-collection-item][role="radio"], [data-radix-collection-item][aria-pressed]';
const radixGroupOf = (item: Element) => item.closest<HTMLElement>('[role="group"], [role="radiogroup"]');
const radixItems = (group: Element) => [...group.querySelectorAll<HTMLElement>('[data-radix-collection-item]')].filter((i) => radixGroupOf(i) === group);
const INTENT: Readonly<Record<string, 'prev' | 'next' | 'first' | 'last'>> = { ArrowLeft: 'prev', ArrowUp: 'prev', ArrowRight: 'next', ArrowDown: 'next', PageUp: 'first', Home: 'first', PageDown: 'last', End: 'last' };
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
let arrowHeld = false;
if (typeof document !== 'undefined') {
	document.addEventListener('keydown', (event) => {
		if (ARROWS.includes(event.key)) arrowHeld = true;
	});
	document.addEventListener('keyup', (event) => {
		if (ARROWS.includes(event.key)) arrowHeld = false;
	});
}

function radixKeys(item: HTMLElement, event: KeyboardEvent): boolean {
	const group = radixGroupOf(item);
	if (event.key === 'Enter' && group?.getAttribute('role') === 'radiogroup') {
		event.preventDefault();
		return true;
	}
	if (!group || event.target !== item) return false;
	const orientation = item.getAttribute('data-orientation');
	const rtl = (group.getAttribute('dir') ?? getComputedStyle(group).direction) === 'rtl';
	const key = rtl && event.key === 'ArrowLeft' ? 'ArrowRight' : rtl && event.key === 'ArrowRight' ? 'ArrowLeft' : event.key;
	if ((orientation === 'vertical' && (key === 'ArrowLeft' || key === 'ArrowRight')) || (orientation === 'horizontal' && (key === 'ArrowUp' || key === 'ArrowDown'))) return false;
	const intent = INTENT[key];
	if (!intent || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
	event.preventDefault();
	let candidates = radixItems(group).filter((i) => !i.hasAttribute('disabled') && !i.hasAttribute('data-disabled'));
	if (intent === 'last') candidates.reverse();
	else if (intent === 'prev' || intent === 'next') {
		if (intent === 'prev') candidates.reverse();
		const at = candidates.indexOf(item);
		candidates = candidates.map((_, k) => candidates[(at + 1 + k) % candidates.length]!);
	}
	setTimeout(() => {
		const previous = document.activeElement;
		for (const candidate of candidates) {
			if (candidate === previous) return;
			candidate.focus();
			if (document.activeElement !== previous) return;
		}
	});
	return true;
}

function radixTabStop(item: HTMLElement): void {
	const group = radixGroupOf(item);
	if (!group) return;
	for (const i of radixItems(group)) {
		const value = i === item ? '0' : '-1';
		if (i.getAttribute('tabindex') !== value) i.setAttribute('tabindex', value);
	}
	if (arrowHeld && item.getAttribute('role') === 'radio' && group.getAttribute('role') === 'radiogroup' && item.getAttribute('aria-checked') !== 'true') item.click();
}

// Base UI ToggleGroup's CompositeRoot: arrows along its orientation (Left and Right swapped right to left), Home and End
// move focus in a microtask to the next item that is not disabled or hidden, looping; the item focused is the tab stop.
const BASE_ITEM = 'button[aria-pressed]:not([data-radix-collection-item]):not([data-rac])';
const baseGroupOf = (item: Element) => item.closest<HTMLElement>('[role="group"][data-orientation]');
const baseItems = (group: Element) => [...group.querySelectorAll<HTMLElement>(BASE_ITEM)].filter((i) => baseGroupOf(i) === group);
const baseDisabled = (el: HTMLElement) => !el.checkVisibility() || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

function baseKeys(item: HTMLElement, event: KeyboardEvent): boolean {
	const group = baseGroupOf(item);
	if (!group || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
	const items = baseItems(group);
	// ToggleGroup's own orientation prop (horizontal unless the source passes one), not the data-orientation it renders.
	const orientation = group.getAttribute('data-mm-orientation') ?? 'horizontal';
	const rtl = getComputedStyle(group).direction === 'rtl';
	const forward = orientation === 'vertical' ? ['ArrowDown'] : orientation === 'both' ? [rtl ? 'ArrowLeft' : 'ArrowRight', 'ArrowDown'] : [rtl ? 'ArrowLeft' : 'ArrowRight'];
	const backward = orientation === 'vertical' ? ['ArrowUp'] : orientation === 'both' ? [rtl ? 'ArrowRight' : 'ArrowLeft', 'ArrowUp'] : [rtl ? 'ArrowRight' : 'ArrowLeft'];
	if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return false;
	const step = (from: number, back: boolean) => {
		let i = from;
		do i += back ? -1 : 1;
		while (i >= 0 && i <= items.length - 1 && baseDisabled(items[i]!));
		return i;
	};
	const min = step(-1, false);
	const max = step(items.length, true);
	const highlighted = Math.max(0, items.findIndex((i) => i.getAttribute('tabindex') === '0'));
	let next = event.key === 'Home' ? min : event.key === 'End' ? max : highlighted;
	if (next === highlighted && (forward.includes(event.key) || backward.includes(event.key))) {
		if (next === max && forward.includes(event.key)) next = min;
		else if (next === min && backward.includes(event.key)) next = max;
		else next = step(next, backward.includes(event.key));
	}
	if (next === highlighted || next < 0 || next > items.length - 1) return false;
	const prevented = orientation === 'vertical' ? ['ArrowUp', 'ArrowDown', 'Home', 'End'] : orientation === 'both' ? ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'] : ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
	if (prevented.includes(event.key)) event.preventDefault();
	const to = items[next]!;
	queueMicrotask(() => to.focus());
	return true;
}

function baseTabStop(item: HTMLElement): void {
	const group = baseGroupOf(item);
	if (!group) return;
	for (const i of baseItems(group)) {
		const value = i === item ? '0' : '-1';
		if (i.getAttribute('tabindex') !== value) i.setAttribute('tabindex', value);
	}
}

/** Base UI Checkbox's Enter: the form around its hidden input is submitted by its default button, once the key has run its course. */
export function submitForm(event: KeyboardEvent): void {
	const input = (event.target as Element).nextElementSibling;
	const form = input instanceof HTMLInputElement ? input.form : null;
	if (!form) return;
	// getDefaultFormSubmitter: the form's first control of type submit.
	const submitter = [...form.elements].find((c): c is HTMLButtonElement | HTMLInputElement => (c instanceof HTMLButtonElement || c instanceof HTMLInputElement) && c.type === 'submit');
	queueMicrotask(() => submitter?.click());
}

/** A Base UI control's hidden input, focused by its label's click, hands focus to the control just before it. */
export function focusControl(event: FocusEvent): void {
	const control = (event.target as Element).previousElementSibling;
	if (control instanceof HTMLElement) control.focus();
}

// React Aria's focusable test (isFocusable): its selector, not inert, and rendered.
const FOCUSABLE = ['input:not([disabled]):not([type=hidden])', 'select:not([disabled])', 'textarea:not([disabled])', 'button:not([disabled])', 'a[href]', 'area[href]', 'summary', 'iframe', 'object', 'embed', 'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable^="false"])', 'permission'].join(':not([hidden]),') + ',[tabindex]:not([disabled]):not([hidden])';
const focusable = (el: Element): el is HTMLElement => el instanceof HTMLElement && el.matches(FOCUSABLE) && !el.closest('[inert]') && el.checkVisibility({ visibilityProperty: true });
const focusablesIn = (root: Element) => [...root.querySelectorAll('*')].filter(focusable);

// React Aria's RadioGroup: a radio input's arrows focus and choose the next focusable radio of the group, wrapping, with
// Left and Right swapped only in a horizontal group read right to left (useRadioGroup); the chosen radio is the group's
// one tab stop, and while none is, the one focus was last on, or every radio before focus enters (useRadio).
const RAC_RADIO_GROUP = '[data-rac][role="radiogroup"]';
const lastRadio = new WeakMap<Element, HTMLInputElement>();
const racRadio = (target: Element) => (target instanceof HTMLInputElement && target.type === 'radio' ? target.closest<HTMLElement>(RAC_RADIO_GROUP) : null);
const radiosIn = (group: Element) => [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter((r) => r.closest(RAC_RADIO_GROUP) === group);

function racTabStops(group: Element): void {
	const radios = radiosIn(group);
	const chosen = radios.some((r) => r.checked);
	const last = lastRadio.get(group);
	for (const r of radios) {
		if (r.disabled) continue;
		const stop = chosen ? r.checked : !last || last === r;
		const value = stop ? '0' : '-1';
		if (r.getAttribute('tabindex') !== value) r.setAttribute('tabindex', value);
	}
}

function racRadioKeys(input: HTMLInputElement, group: HTMLElement, event: KeyboardEvent): boolean {
	if (event.altKey || event.ctrlKey || event.metaKey) return false;
	const horizontalRtl = group.getAttribute('aria-orientation') === 'horizontal' && getComputedStyle(group).direction === 'rtl';
	const dir = { ArrowRight: horizontalRtl ? -1 : 1, ArrowLeft: horizontalRtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
	if (!dir) return false;
	event.preventDefault();
	const radios = focusablesIn(group).filter((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'radio');
	const to = radios[(radios.indexOf(input) + dir + radios.length) % radios.length];
	if (to) {
		to.focus();
		if (!to.checked) to.click();
	}
	racTabStops(group);
	return true;
}

export function click(target: Element): boolean {
	const group = racRadio(target);
	if (group) racTabStops(group);
	return false;
}

// React Aria's Toolbar and ToggleButtonGroup (useToolbar): arrows along the orientation move focus to the next or previous
// focusable item without wrapping (reversed in a horizontal toolbar read right to left), Tab leaves the toolbar from its
// last item (Shift+Tab from its first), and focus coming back from outside returns to the item it left from.
const lastFocused = new WeakMap<Element, HTMLElement>();

function toolbarOf(target: Element): HTMLElement | undefined {
	// A ToggleButtonGroup choosing one item is a radiogroup of buttons; React Aria's RadioGroup holds radio inputs.
	let bar = target.closest<HTMLElement>('[data-rac][role="toolbar"], [data-rac][role="radiogroup"]');
	if (!bar || bar.querySelector('input[type="radio"]')) return undefined;
	// A toolbar inside another is a plain group: the outer one handles its keys.
	for (let outer = bar.parentElement?.closest<HTMLElement>('[data-rac][role="toolbar"]'); outer; outer = outer.parentElement?.closest<HTMLElement>('[data-rac][role="toolbar"]')) bar = outer;
	return bar;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const item = target.closest<HTMLElement>(RADIX_ITEM);
	if (item) return radixKeys(item, event);
	if (target.matches(BASE_ITEM) && baseGroupOf(target)) return baseKeys(target as HTMLElement, event);
	if (event.key === 'Enter' && target.matches('button[role="checkbox"][data-state]')) {
		event.preventDefault();
		return true;
	}
	const group = racRadio(target);
	if (group) return racRadioKeys(target as HTMLInputElement, group, event);
	const bar = toolbarOf(target);
	if (!bar) return false;
	const horizontal = bar.getAttribute('aria-orientation') !== 'vertical';
	const reverse = horizontal && getComputedStyle(bar).direction === 'rtl';
	const items = focusablesIn(bar);
	const active = document.activeElement;
	const at = active ? items.findIndex((i) => i === active) : -1;
	const forward = (horizontal && event.key === 'ArrowRight') || (!horizontal && event.key === 'ArrowDown');
	const back = (horizontal && event.key === 'ArrowLeft') || (!horizontal && event.key === 'ArrowUp');
	if (forward || back) {
		const next = forward !== reverse;
		// focusManager.focusNext/Previous from the focused element; focusPrevious from outside the toolbar lands on its last item.
		const to = at < 0 ? (next ? items[0] : items[items.length - 1]) : items[at + (next ? 1 : -1)];
		to?.focus();
	} else if (event.key === 'Tab') {
		if (active instanceof HTMLElement) lastFocused.set(bar, active);
		(event.shiftKey ? items[0] : items[items.length - 1])?.focus();
		return true;
	} else return false;
	event.preventDefault();
	return true;
}

export function focusin(target: Element, event: FocusEvent): boolean {
	if (target.matches(RADIX_ITEM)) {
		radixTabStop(target as HTMLElement);
		return false;
	}
	if (target.matches(BASE_ITEM) && baseGroupOf(target)) {
		baseTabStop(target as HTMLElement);
		return false;
	}
	const group = racRadio(target);
	if (group) {
		lastRadio.set(group, target as HTMLInputElement);
		racTabStops(group);
		return false;
	}
	const bar = toolbarOf(target);
	if (!bar) return false;
	const from = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	const last = lastFocused.get(bar);
	if (!last || (from && bar.contains(from))) return false;
	lastFocused.delete(bar);
	if (last.isConnected && last !== target) last.focus();
	return true;
}

export function focusout(target: Element, event: FocusEvent): boolean {
	const group = racRadio(target);
	if (group) {
		// useRadioGroup's onBlurWithin: leaving a group with nothing chosen lets either end take focus again.
		const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
		if (!(to && group.contains(to)) && !radiosIn(group).some((r) => r.checked)) {
			lastRadio.delete(group);
			racTabStops(group);
		}
		return false;
	}
	const bar = toolbarOf(target);
	if (!bar) return false;
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	if (!(to && bar.contains(to)) && !lastFocused.has(bar) && target instanceof HTMLElement) lastFocused.set(bar, target);
	return false;
}
