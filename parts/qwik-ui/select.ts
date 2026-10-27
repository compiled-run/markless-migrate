// @qwik-ui/headless Select (select/*): the trigger's click toggles the listbox, a manual popover placed by floating-ui;
// Up and Down open it, Enter and Space toggle it, Left and Right choose the previous or next item without opening it;
// opening highlights the selected item, else the first (the last for Up), and focus moves onto it (roving focus, no
// aria-activedescendant). In the list: Up and Down move the highlight (wrapping only with data-mm-loop), Home and End go
// to the ends, Enter and Space choose, Escape and Tab close, a pointer over an item highlights it, a click chooses it;
// typing jumps to an item by its text. Choosing marks the item selected, shows its indicator, sends its text to the
// trigger's value (Markless state, convert's SelectPlan, through `mmchoose`) and syncs the hidden native select.
// A press outside the panel and the trigger closes it. With aria-multiselectable, choosing toggles and keeps it open.
import { enabled, hidePanel, mark, newTyping, outside, place, showPanel, step, typeahead, unplace, type Typing } from './floating.ts';

const ROOT = '[data-qui-select-root]';
const TRIGGER = 'button[aria-haspopup="listbox"]';
const ITEM = '[role="option"][data-item]';
const KEYS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' '];

interface Select {
	readonly root: HTMLElement;
	readonly trigger: HTMLElement;
	readonly panel: HTMLElement;
	readonly value: HTMLElement | null;
}

function selectOf(el: Element | null): Select | undefined {
	const root = el?.closest<HTMLElement>(ROOT);
	const trigger = root?.querySelector<HTMLElement>(TRIGGER);
	const panel = trigger ? document.getElementById(trigger.getAttribute('aria-controls') ?? '') : null;
	if (!root || !trigger || !panel) return undefined;
	return { root, trigger, panel, value: trigger.querySelector<HTMLElement>('[data-value]') };
}

const itemsOf = (s: Select) => [...s.panel.querySelectorAll<HTMLElement>(ITEM)];
const labelOf = (item: Element) => (item.querySelector('span') ?? item).textContent ?? '';
const multiple = (s: Select) => s.panel.getAttribute('aria-multiselectable') === 'true';
const loop = (s: Select) => s.root.dataset.mmLoop !== undefined;
const isOpen = (s: Select) => s.trigger.getAttribute('aria-expanded') === 'true';
const typings = new WeakMap<HTMLElement, Typing>();
const typingOf = (s: Select) => typings.get(s.root) ?? typings.set(s.root, newTyping()).get(s.root)!;
const current = new WeakMap<HTMLElement, Select>();

function highlight(s: Select, item: HTMLElement | undefined, focus = true): void {
	for (const i of itemsOf(s)) i.toggleAttribute('data-highlighted', i === item);
	if (item && focus && isOpen(s)) item.focus({ preventScroll: false });
}

function setOpen(s: Select, on: boolean): void {
	if (on === isOpen(s)) return;
	mark([s.root, s.trigger, s.value, s.panel], on);
	s.trigger.setAttribute('aria-expanded', String(on));
	if (on) {
		s.panel.setAttribute('aria-expanded', 'true');
		showPanel(s.panel);
		place(s.trigger, s.panel);
		current.set(s.root, s);
	} else {
		s.panel.removeAttribute('aria-expanded');
		unplace(s.panel);
		hidePanel(s.panel);
		current.delete(s.root);
	}
}

function indicate(item: HTMLElement, on: boolean): void {
	const indicator = [...item.children].find((c) => c.getAttribute('aria-hidden') === 'true');
	for (const icon of indicator?.children ?? []) (icon as HTMLElement).hidden = !on;
}

// The order a multiple select's items were chosen in: its display value lists them so (selectedIndexSetSig, a Set).
const chosenOrder = new WeakMap<HTMLElement, HTMLElement[]>();

function choose(s: Select, item: HTMLElement): void {
	if (!enabled(item)) return;
	const many = multiple(s);
	const order = (chosenOrder.get(s.root) ?? itemsOf(s).filter((i) => i.getAttribute('aria-selected') === 'true')).filter((i) => i !== item);
	for (const i of itemsOf(s)) {
		const on = i === item ? (many ? i.getAttribute('aria-selected') !== 'true' : true) : many ? i.getAttribute('aria-selected') === 'true' : false;
		i.setAttribute('aria-selected', String(on));
		i.toggleAttribute('data-selected', on);
		indicate(i, on);
	}
	if (item.getAttribute('aria-selected') === 'true') order.push(item);
	chosenOrder.set(s.root, order);
	// A multiple select's DisplayValue is the site's: the docs' examples join the bound display values with ", ".
	s.trigger.dispatchEvent(new CustomEvent('mmchoose', { bubbles: true, detail: many ? order.map(labelOf).join(', ') : labelOf(item) }));
	syncNative(s);
}

// The hidden native select Qwik UI renders for forms follows the chosen items, and hears an input event.
function syncNative(s: Select): void {
	const native = s.root.querySelector<HTMLSelectElement>('select');
	if (!native) return;
	const chosen = new Set(itemsOf(s).filter((i) => i.getAttribute('aria-selected') === 'true').map((i) => labelOf(i).trim()));
	for (const option of native.options) option.selected = option.value !== '' && (chosen.has(option.value) || chosen.has(option.text.trim()));
	native.dispatchEvent(new Event('input'));
}

function openWithHighlight(s: Select, key: string): void {
	setOpen(s, true);
	const items = itemsOf(s);
	const selected = items.find((i) => i.getAttribute('aria-selected') === 'true' && enabled(i));
	const already = items.find((i) => i.hasAttribute('data-highlighted') && enabled(i));
	const first = items.find(enabled);
	const last = [...items].reverse().find(enabled);
	highlight(s, already ?? selected ?? (key === 'ArrowUp' ? last : first));
}

/** What a Root's bind:value writes: the item becomes the chosen one. */
export function chooseItem(item: Element): void {
	const s = selectOf(item.closest(ROOT) ?? document.querySelector(`${ROOT}:has([aria-controls="${CSS.escape(item.parentElement?.id ?? '')}"])`));
	if (s && item instanceof HTMLElement) choose(s, item);
}

/** What a Root's bind:open writes: the list opens as its trigger opens it. */
export function openList(root: Element): void {
	const s = selectOf(root);
	if (s && !isOpen(s)) openWithHighlight(s, 'Enter');
}

export function click(target: Element, event: MouseEvent): boolean {
	const s = selectOf(target);
	if (!s) return false;
	const item = target.closest<HTMLElement>(ITEM);
	if (item && s.panel.contains(item)) {
		choose(s, item);
		if (multiple(s)) s.trigger.focus();
		else setOpen(s, false);
		return true;
	}
	if (target.closest(TRIGGER) === s.trigger) {
		event.preventDefault();
		if (isOpen(s)) setOpen(s, false);
		else openWithHighlight(s, 'Enter');
		return true;
	}
	// The label focuses the trigger.
	if (target.closest(`[id="${s.trigger.id.replace(/-trigger$/, '-label')}"]`)) {
		if (!s.trigger.hasAttribute('disabled')) s.trigger.focus();
		return true;
	}
	return false;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const s = selectOf(target);
	if (!s) return false;
	const item = target.closest<HTMLElement>(ITEM);
	const onTrigger = target.closest(TRIGGER) === s.trigger;
	if (!onTrigger && !(item && s.panel.contains(item))) return false;
	if (KEYS.includes(event.key)) event.preventDefault();
	const items = itemsOf(s);
	const open = isOpen(s);
	const found = typeahead(typingOf(s), event.key, items, labelOf);
	if (found) {
		if (open) highlight(s, found);
		else if (!multiple(s)) {
			choose(s, found);
			highlight(s, found, false);
		}
		return true;
	}
	if (event.key === 'Tab') {
		setOpen(s, false);
		return false;
	}
	if (event.key === 'Escape') {
		if (item) s.trigger.focus();
		setOpen(s, false);
		return true;
	}
	if (onTrigger) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') openWithHighlight(s, event.key);
		else if ((event.key === 'Enter' || event.key === ' ') && open && !multiple(s)) setOpen(s, false);
		else if (event.key === 'Enter' || event.key === ' ') openWithHighlight(s, event.key);
		else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && !multiple(s)) {
			const at = items.findIndex((i) => i.getAttribute('aria-selected') === 'true');
			const to = step(items, at, event.key === 'ArrowRight' ? 1 : -1, loop(s));
			if (to) {
				choose(s, to);
				highlight(s, to, false);
			}
		}
		return true;
	}
	if (!open || !item) return true;
	const at = items.indexOf(item);
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		const to = step(items, at, event.key === 'ArrowDown' ? 1 : -1, loop(s));
		if (to) {
			highlight(s, to);
			if (event.shiftKey && multiple(s)) choose(s, to);
		}
	} else if (event.key === 'Home') highlight(s, items.find(enabled));
	else if (event.key === 'End') highlight(s, [...items].reverse().find(enabled));
	else if (event.key === 'Enter' || event.key === ' ') {
		choose(s, item);
		if (!multiple(s)) {
			s.trigger.focus();
			setOpen(s, false);
		}
	} else if (event.key === 'a' && (event.ctrlKey || event.metaKey) && multiple(s)) for (const i of items) if (enabled(i) && i.getAttribute('aria-selected') !== 'true') choose(s, i);
	return true;
}

export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const s = item ? selectOf(item) : undefined;
	if (!s || !item || !enabled(item) || !s.panel.contains(item)) return false;
	highlight(s, item);
	return true;
}

// A press outside every open select's panel and trigger closes it.
if (typeof window !== 'undefined')
	window.addEventListener('pointerdown', (event) => {
		for (const root of document.querySelectorAll<HTMLElement>(ROOT)) {
			const s = current.get(root);
			if (s && outside(event, [s.panel, s.trigger])) setOpen(s, false);
		}
	});
