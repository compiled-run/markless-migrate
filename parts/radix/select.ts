import { closeLayer, layerOf, openLayer, type Layer } from '../layer.ts';
import { layerKey, layersFor, layersPending, loadLayers } from '../reveal.ts';

// Radix Select (@radix-ui/react-select) with its default item-aligned position: a mouse press on the trigger (or Enter,
// Space, an arrow) opens the listbox over the trigger with the selected option's text where the trigger's value is;
// arrows, Home, End and typing move focus between options, a pointer over an option focuses it; choosing one (a
// mouse release, Enter, Space) marks it checked, shows its indicator, writes its text into the trigger's value
// (mmchoose, the converter's state) and closes. Escape, a press outside, blur and resize close too. In a form, Radix
// renders a hidden native <select> beside the trigger (BubbleSelect): choosing sets it and fires its change, and a
// change made there (autofill, a form restored) chooses the option with the same text.

const TRIGGER = 'button[role="combobox"][aria-controls][data-slot="select-trigger"][data-state]';
const OPTION = '[role="option"]';
const CONTENT_MARGIN = 10;
const OPEN_KEYS = [' ', 'Enter', 'ArrowUp', 'ArrowDown'];
const NATIVE = 'select[aria-hidden="true"]';

interface Open {
	readonly layer: Layer;
	readonly listbox: HTMLElement;
	readonly wrapper: HTMLElement;
	readonly viewport: HTMLElement;
	readonly down: { x: number; y: number } | null;
	search: string;
	searchTimer?: number;
	done: (() => void)[];
}

let current: Open | undefined;
const options = (o: Open) => [...o.listbox.querySelectorAll<HTMLElement>(OPTION)].filter((x) => !x.hasAttribute('data-disabled'));
// Radix's selectedItem: the checked option, else the first enabled one.
const selectedOf = (o: Open) => options(o).find((x) => x.getAttribute('data-state') === 'checked') ?? options(o)[0];
const textOf = (option: HTMLElement) => option.querySelector<HTMLElement>(`[id="${CSS.escape(option.getAttribute('aria-labelledby') ?? '')}"]`) ?? option;

function setTrigger(trigger: HTMLElement, open: boolean): void {
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
}

// SelectItemAlignedPosition's position(): the wrapper (position: fixed) is placed so the selected option's text lies
// over the trigger's value, and sized to the viewport less 10 px margins.
function place(o: Open, trigger: HTMLElement): void {
	const { wrapper, listbox: content, viewport } = o;
	const valueNode = trigger.querySelector<HTMLElement>('[data-slot="select-value"]');
	const selected = selectedOf(o);
	if (!valueNode || !selected) return;
	for (const prop of ['left', 'right', 'top', 'bottom', 'height', 'min-width', 'min-height', 'max-height', 'margin']) wrapper.style.removeProperty(prop);
	const itemText = textOf(selected);
	const triggerRect = trigger.getBoundingClientRect();
	const contentRect = content.getBoundingClientRect();
	const valueNodeRect = valueNode.getBoundingClientRect();
	const itemTextRect = itemText.getBoundingClientRect();
	const clamp = (v: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, v));
	if (getComputedStyle(trigger).direction !== 'rtl') {
		const left = valueNodeRect.left - (itemTextRect.left - contentRect.left);
		const minContentWidth = triggerRect.width + (triggerRect.left - left);
		const contentWidth = Math.max(minContentWidth, contentRect.width);
		wrapper.style.minWidth = `${minContentWidth}px`;
		wrapper.style.left = `${clamp(left, [CONTENT_MARGIN, Math.max(CONTENT_MARGIN, window.innerWidth - CONTENT_MARGIN - contentWidth)])}px`;
	} else {
		const right = window.innerWidth - valueNodeRect.right - (contentRect.right - itemTextRect.right);
		const minContentWidth = triggerRect.width + (window.innerWidth - triggerRect.right - right);
		const contentWidth = Math.max(minContentWidth, contentRect.width);
		wrapper.style.minWidth = `${minContentWidth}px`;
		wrapper.style.right = `${clamp(right, [CONTENT_MARGIN, Math.max(CONTENT_MARGIN, window.innerWidth - CONTENT_MARGIN - contentWidth)])}px`;
	}
	const items = options(o);
	const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
	const cs = getComputedStyle(content);
	const borderTop = parseInt(cs.borderTopWidth, 10);
	const paddingTop = parseInt(cs.paddingTop, 10);
	const borderBottom = parseInt(cs.borderBottomWidth, 10);
	const paddingBottom = parseInt(cs.paddingBottom, 10);
	const fullContentHeight = borderTop + paddingTop + viewport.scrollHeight + paddingBottom + borderBottom;
	const minContentHeight = Math.min(selected.offsetHeight * 5, fullContentHeight);
	const vs = getComputedStyle(viewport);
	const topEdgeToTriggerMiddle = triggerRect.top + triggerRect.height / 2 - CONTENT_MARGIN;
	const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;
	const half = selected.offsetHeight / 2;
	const contentTopToItemMiddle = borderTop + paddingTop + selected.offsetTop + half;
	const itemMiddleToContentBottom = fullContentHeight - contentTopToItemMiddle;
	if (contentTopToItemMiddle <= topEdgeToTriggerMiddle) {
		const isLast = selected === items[items.length - 1];
		wrapper.style.bottom = '0px';
		const viewportOffsetBottom = content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
		const below = Math.max(triggerMiddleToBottomEdge, half + (isLast ? parseInt(vs.paddingBottom, 10) : 0) + viewportOffsetBottom + borderBottom);
		wrapper.style.height = `${contentTopToItemMiddle + below}px`;
	} else {
		const isFirst = selected === items[0];
		wrapper.style.top = '0px';
		const above = Math.max(topEdgeToTriggerMiddle, borderTop + viewport.offsetTop + (isFirst ? parseInt(vs.paddingTop, 10) : 0) + half);
		wrapper.style.height = `${above + itemMiddleToContentBottom}px`;
		viewport.scrollTop = contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
	}
	wrapper.style.margin = `${CONTENT_MARGIN}px 0`;
	wrapper.style.minHeight = `${minContentHeight}px`;
	wrapper.style.maxHeight = `${availableHeight}px`;
}

function focusFirst(o: Open, candidates: readonly (HTMLElement | undefined)[]): void {
	const items = options(o);
	const was = document.activeElement;
	for (const c of candidates) {
		if (!c) continue;
		if (c === was) return;
		c.scrollIntoView({ block: 'nearest' });
		if (c === items[0]) o.viewport.scrollTop = 0;
		if (c === items[items.length - 1]) o.viewport.scrollTop = o.viewport.scrollHeight;
		c.focus();
		if (document.activeElement !== was) return;
	}
}

const optionText = (option: HTMLElement) => (textOf(option).textContent ?? '').trim();
function nativeOf(trigger: HTMLElement): HTMLSelectElement | undefined {
	for (let at = trigger.nextElementSibling; at && !at.matches(TRIGGER); at = at.nextElementSibling) if (at.matches(NATIVE)) return at as HTMLSelectElement;
	return undefined;
}
const placeholders = new WeakMap<HTMLElement, string>();

function mark(trigger: HTMLElement, items: readonly HTMLElement[], option: HTMLElement | undefined): void {
	for (const x of items) {
		const on = x === option;
		x.setAttribute('data-state', on ? 'checked' : 'unchecked');
		// The converter renders every option's indicator, hidden but on the selected one (Radix mounts only that one).
		for (const indicator of x.querySelectorAll<HTMLElement>('[data-mm-indicator]')) indicator.hidden = !on;
	}
	const value = trigger.querySelector('[data-slot="select-value"]');
	if (trigger.hasAttribute('data-placeholder') && value && !placeholders.has(trigger)) placeholders.set(trigger, value.textContent ?? '');
	trigger.toggleAttribute('data-placeholder', !option);
	const text = option ? optionText(option) : placeholders.get(trigger);
	if (text !== undefined) trigger.dispatchEvent(new CustomEvent('mmchoose', { bubbles: true, detail: text }));
}

function choose(o: Open, option: HTMLElement): void {
	const trigger = o.layer.trigger;
	mark(trigger, options(o), option);
	const native = nativeOf(trigger);
	const match = native && [...native.options].find((x) => x.text.trim() === optionText(option));
	if (native && match && native.value !== match.value) {
		native.value = match.value;
		native.dispatchEvent(new Event('change', { bubbles: true }));
	}
	close(o);
}

// A change on the hidden native select: the option of the trigger's listbox with the chosen text, or none for "".
export function input(target: Element): boolean {
	if (!(target instanceof HTMLSelectElement) || !target.matches(NATIVE)) return false;
	const trigger = [...(target.parentElement?.children ?? [])].find((el): el is HTMLElement => el.matches(TRIGGER) && nativeOf(el as HTMLElement) === target);
	if (!trigger) return false;
	const apply = () => {
		const items = layersFor(layerKey(trigger)).flatMap((n) => [...n.querySelectorAll<HTMLElement>(OPTION)]);
		const chosen = target.selectedOptions[0];
		const option = chosen && chosen.value !== '' ? items.find((x) => optionText(x) === chosen.text.trim()) : undefined;
		if (option || !chosen || chosen.value === '') mark(trigger, items, option);
		return Boolean(items.length);
	};
	if (!apply() && layersPending()) void loadLayers().then(apply);
	return true;
}

function close(o: Open): void {
	if (current !== o) return;
	current = undefined;
	for (const d of o.done) d();
	setTrigger(o.layer.trigger, false);
	for (const x of options(o)) {
		x.removeAttribute('data-highlighted');
		x.setAttribute('aria-selected', 'false');
	}
	o.listbox.setAttribute('data-state', 'closed');
	closeLayer(o.layer);
}

function open(trigger: HTMLElement, down: { x: number; y: number } | null): boolean {
	if (current) return true;
	const key = layerKey(trigger);
	const layer = openLayer(trigger, key, { modal: true, onDismiss: () => o && close(o) });
	if (!layer) return false;
	const listbox = layer.content;
	const wrapper = (layer.nodes.find((n) => n.contains(listbox) && n !== listbox) ?? listbox.parentElement) as HTMLElement;
	const viewport = listbox.querySelector<HTMLElement>('[data-radix-select-viewport]') ?? listbox;
	const o: Open = { layer, listbox, wrapper, viewport, down, search: '', done: [] };
	current = o;
	setTrigger(trigger, true);
	listbox.setAttribute('data-state', 'open');
	place(o, trigger);
	const onFocus = (event: FocusEvent) => {
		const option = (event.target as Element).closest<HTMLElement>(OPTION);
		if (!option) return;
		option.setAttribute('data-highlighted', '');
		option.setAttribute('aria-selected', String(option.getAttribute('data-state') === 'checked'));
	};
	const onBlur = (event: FocusEvent) => {
		const option = (event.target as Element).closest<HTMLElement>(OPTION);
		if (!option) return;
		option.removeAttribute('data-highlighted');
		option.setAttribute('aria-selected', 'false');
	};
	let moved = { x: 0, y: 0 };
	const onMove = (event: PointerEvent) => {
		if (o.down) moved = { x: Math.abs(Math.round(event.pageX) - o.down.x), y: Math.abs(Math.round(event.pageY) - o.down.y) };
		const option = (event.target as Element).closest<HTMLElement>(OPTION);
		if (event.pointerType !== 'mouse') return;
		if (option && listbox.contains(option) && !option.hasAttribute('data-disabled')) option.focus({ preventScroll: true });
		else if (option?.hasAttribute('data-disabled')) listbox.focus();
	};
	const onLeave = (event: PointerEvent) => {
		const option = (event.target as Element).closest<HTMLElement>(OPTION);
		if (option && option === document.activeElement) listbox.focus();
	};
	// The release of the press that opened it does not choose: within 10 px it is ignored, beyond and outside it closes.
	let first = Boolean(down);
	const onUp = (event: PointerEvent) => {
		if (first) {
			first = false;
			if (moved.x <= 10 && moved.y <= 10) return;
			if (!listbox.contains(event.target as Node)) return close(o);
		}
		const option = (event.target as Element).closest<HTMLElement>(OPTION);
		if (event.pointerType === 'mouse' && option && listbox.contains(option) && !option.hasAttribute('data-disabled')) choose(o, option);
	};
	const onKey = (event: KeyboardEvent) => {
		if (current !== o) return;
		const items = options(o);
		const at = document.activeElement as HTMLElement | null;
		if (event.key === 'Tab') event.preventDefault();
		if ((event.key === 'Enter' || (event.key === ' ' && !o.search)) && at && items.includes(at)) {
			event.preventDefault();
			choose(o, at);
			return;
		}
		if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
			let list = ['ArrowUp', 'End'].includes(event.key) ? items.slice().reverse() : items;
			if (['ArrowUp', 'ArrowDown'].includes(event.key) && at) list = list.slice(list.indexOf(at) + 1);
			event.preventDefault();
			setTimeout(() => focusFirst(o, list));
			return;
		}
		if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
			o.search += event.key;
			clearTimeout(o.searchTimer);
			o.searchTimer = window.setTimeout(() => (o.search = ''), 1000);
			const same = o.search.length > 1 && [...o.search].every((c) => c === o.search[0]);
			const needle = (same ? o.search[0]! : o.search).toLowerCase();
			const from = at ? items.indexOf(at) : -1;
			const wrapped = [...items.slice(from + 1), ...items.slice(0, from + 1)];
			const next = (same || o.search.length === 1 ? wrapped : items).find((x) => (x.textContent ?? '').trim().toLowerCase().startsWith(needle));
			if (next) setTimeout(() => next.focus());
		}
	};
	const onWindow = () => close(o);
	listbox.addEventListener('focusin', onFocus);
	listbox.addEventListener('focusout', onBlur);
	document.addEventListener('pointermove', onMove);
	listbox.addEventListener('pointerout', onLeave);
	document.addEventListener('pointerup', onUp, true);
	// On the content, as Radix's onKeyDown: the key that opened it, pressed on the trigger, never reaches it.
	listbox.addEventListener('keydown', onKey);
	window.addEventListener('blur', onWindow);
	window.addEventListener('resize', onWindow);
	o.done.push(() => {
		listbox.removeEventListener('focusin', onFocus);
		listbox.removeEventListener('focusout', onBlur);
		document.removeEventListener('pointermove', onMove);
		listbox.removeEventListener('pointerout', onLeave);
		document.removeEventListener('pointerup', onUp, true);
		listbox.removeEventListener('keydown', onKey);
		window.removeEventListener('blur', onWindow);
		window.removeEventListener('resize', onWindow);
	});
	focusFirst(o, [selectedOf(o), listbox]);
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || trigger.hasAttribute('disabled')) return false;
	if (event.button !== 0 || event.ctrlKey || event.pointerType !== 'mouse') return true;
	event.preventDefault();
	return open(trigger, { x: Math.round(event.pageX), y: Math.round(event.pageY) });
}

export function click(target: Element, event: MouseEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger) {
		trigger.focus();
		// A touch or pen press opens on click; a mouse press opened on pointerdown.
		if ((event as PointerEvent).pointerType !== 'mouse' && event.detail !== 0) open(trigger, null);
		return true;
	}
	const option = target.closest<HTMLElement>(OPTION);
	const layer = option && layerOf(option);
	if (!option || !current || layer !== current.layer) return false;
	if ((event as PointerEvent).pointerType !== 'mouse') choose(current, option);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || current) return false;
	if (!OPEN_KEYS.includes(event.key)) return false;
	event.preventDefault();
	return open(trigger, null);
}
