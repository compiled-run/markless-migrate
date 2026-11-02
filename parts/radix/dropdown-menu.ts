import { closeLayer, layerOf, openLayer, type Layer } from '../layer.ts';
import { closestTrigger, layerKey } from '../reveal.ts';

// Radix DropdownMenu (@radix-ui/react-dropdown-menu), modal as by default: pressing the trigger (or Enter, Space or
// ArrowDown on it) opens the menu with outside pointer events off; the content takes focus (the first item from the
// keyboard); arrows, Home and End move focus between the items; choosing an item or Escape closes it and focus returns.
// An item is highlighted (data-highlighted) while it has focus: the mouse moving onto it focuses it, leaving it (or
// moving onto a disabled one) focuses the content. A sub-trigger opens its submenu (a layer keyed by its id, not modal)
// 100 ms after the mouse rests on it, on a press, or on Enter, Space or the inline-end arrow (then on its first item);
// the inline-start arrow closes it back to its trigger; Escape or choosing an item in it closes the whole menu, and
// focus moving elsewhere in the parent closes it. The pointer crossing other items on its way to the open submenu
// leaves them alone (Radix's pointer grace area).

// Radix Menubar's triggers are menu buttons too, their menus not modal: the arrows rove focus between the triggers
// (a RovingFocusGroup, looping), the focused one highlighted; with one open, the pointer on another trigger opens that
// one, and the side arrows in an open menu open the neighbouring menu of the bar with its content focused.
const TRIGGER = '[aria-haspopup="menu"]:is([data-slot$="menu-trigger"], [data-mm-part="dropdown-menu-trigger"]), [aria-haspopup="menu"][data-slot="menubar-trigger"][data-state]';
// A trigger rendered through its child (asChild, render) carries the child's data-slot; its layer names the part.
const triggerOf = (target: Element) => target.closest<HTMLElement>(TRIGGER) ?? closestTrigger(target, '[aria-haspopup="menu"][data-state]', (slot) => /menu-trigger$/.test(slot));
const BAR = '[role="menubar"]';
const BAR_TRIGGER = '[role="menuitem"]';
const barTriggers = (bar: Element) => [...bar.querySelectorAll<HTMLElement>(BAR_TRIGGER)].filter((t) => t.closest(BAR) === bar);
const barOf = (trigger: Element) => (trigger.matches(BAR_TRIGGER) ? trigger.closest<HTMLElement>(BAR) : null);
// Menubar's loop (true by default), as convert read it off the instance.
const loops = (bar: Element) => bar.getAttribute('data-mm-loop') !== 'false';
// The item `step` places on from `at` in `list`, wrapping round when the bar loops.
const stepIn = <T,>(list: readonly T[], at: number, step: number, loop: boolean) => (loop ? list[(at + step + list.length) % list.length] : list[at + step]);
const openOf = (trigger: HTMLElement) => layerOf(document.getElementById(trigger.getAttribute('aria-controls') ?? '') ?? trigger);
const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const keyOf = (trigger: HTMLElement) => layerKey(trigger);
const disabled = (el: Element) => el.hasAttribute('data-disabled') || el.hasAttribute('disabled');
const rtl = (el: Element) => getComputedStyle(el).direction === 'rtl';

const isSubTrigger = (el: Element) => el.matches(ITEM) && el.getAttribute('aria-haspopup') === 'menu' && !barOf(el);

function setTrigger(trigger: HTMLElement, open: boolean, layer?: Layer): void {
	// A context menu's trigger area (opened by the context-menu port) is not a menu button.
	if (!trigger.hasAttribute('aria-haspopup')) return;
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
	// A sub-trigger names its content whether or not it is open.
	if (isSubTrigger(trigger)) return;
	if (open && layer?.content.id) trigger.setAttribute('aria-controls', layer.content.id);
	else if (!open) trigger.removeAttribute('aria-controls');
}

// The open submenu of each open menu, and what closes each root menu (a context menu's port registers its own).
const subOf = new Map<Layer, Layer>();
const closers = new WeakMap<Layer, () => void>();
const parentOf = (layer: Layer) => (isSubTrigger(layer.trigger) ? layerOf(layer.trigger) : undefined);

/** The menu a submenu (or a submenu of one) opened from; the layer itself when it is no submenu. */
export function menuRoot(layer: Layer): Layer {
	let root = layer;
	for (let up = parentOf(root); up; up = parentOf(root)) root = up;
	return root;
}

/** How a menu's own port closes it: Escape or a choice in one of its submenus closes it so. */
export function trackMenu(layer: Layer, close: () => void): void {
	closers.set(layer, close);
}

/** Closes the submenus open from `layer`, innermost first. */
export function closeSubs(layer: Layer): void {
	const sub = subOf.get(layer);
	if (!sub) return;
	closeSubs(sub);
	subOf.delete(layer);
	setTrigger(sub.trigger, false);
	clearHighlight(sub);
	closeLayer(sub, true);
}

const closeMenu = (layer: Layer) => {
	const root = menuRoot(layer);
	(closers.get(root) ?? (() => close(root)))();
};

const items = (layer: Layer) => [...layer.content.querySelectorAll<HTMLElement>(ITEM)].filter((i) => !disabled(i));

const marked = new WeakSet<HTMLElement>();
function mark(el: HTMLElement): void {
	el.setAttribute('data-highlighted', '');
	if (marked.has(el)) return;
	marked.add(el);
	el.addEventListener('blur', () => {
		marked.delete(el);
		el.removeAttribute('data-highlighted');
	}, { once: true });
}

/** Clears what a menu marked: Radix unmounts the content on close, so it opens again with nothing highlighted. */
export function clearHighlight(layer: Layer): void {
	for (const el of layer.content.querySelectorAll('[data-highlighted]')) el.removeAttribute('data-highlighted');
}

function highlight(item: HTMLElement | undefined): void {
	if (!item) return;
	item.focus({ preventScroll: true });
	if (document.activeElement === item) mark(item);
}

function close(layer: Layer, keepFocus = false): void {
	closeSubs(layer);
	setTrigger(layer.trigger, false);
	clearHighlight(layer);
	closeLayer(layer, keepFocus);
}

function openMenu(trigger: HTMLElement, first: boolean): boolean {
	const layer = openLayer(trigger, keyOf(trigger), { modal: !barOf(trigger), onDismiss: (l) => close(l) });
	if (!layer) return false;
	setTrigger(trigger, true, layer);
	clearHighlight(layer);
	if (barOf(trigger)) setTabStop(trigger);
	if (first) highlight(items(layer)[0]);
	else layer.content.focus({ preventScroll: true });
	return true;
}

// Menubar's RovingFocusGroup: the trigger last focused is the bar's tab stop.
function setTabStop(trigger: HTMLElement): void {
	const bar = barOf(trigger);
	if (bar) for (const t of barTriggers(bar)) t.setAttribute('tabindex', t === trigger ? '0' : '-1');
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = triggerOf(target);
	if (!trigger || event.button !== 0 || event.ctrlKey || trigger.hasAttribute('disabled')) return false;
	const layer = layerOf(document.getElementById(trigger.getAttribute('aria-controls') ?? '') ?? trigger);
	if (trigger.getAttribute('aria-expanded') === 'true' && layer) close(layer);
	else if (openMenu(trigger, false)) event.preventDefault();
	return true;
}

export function click(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const layer = item && layerOf(item);
	if (!item || !layer || disabled(item)) return false;
	if (isSubTrigger(item)) {
		item.focus();
		if (subOf.get(layer)?.trigger !== item) openSub(item, false);
		return true;
	}
	const shows = item.getAttribute('data-mm-trigger-text');
	if (shows !== null) showOnTrigger(menuRoot(layer).trigger, JSON.parse(shows) as [number, string][]);
	const variants = item.getAttribute('data-mm-trigger-svg');
	if (variants !== null) showVariants(menuRoot(layer).trigger, JSON.parse(variants) as [number, number][]);
	if (item.querySelector(':scope > [data-mm-chosen-mark]')) for (const other of layer.content.querySelectorAll(ITEM)) other.querySelector(':scope > [data-mm-chosen-mark]')?.toggleAttribute('hidden', other !== item);
	closeMenu(layer);
	return true;
}

// What choosing an item showed on its trigger on the old page (a version switcher), recorded by convert as each element's
// text (elements outside SVG by their place, the trigger 0): written into that element's own text nodes, as the scene
// part writes a demo's text.
function showOnTrigger(trigger: HTMLElement, shown: readonly (readonly [number, string])[]): void {
	const elements = [trigger, ...trigger.querySelectorAll('*')].filter((e) => !e.closest('svg'));
	for (const [i, text] of shown) {
		const runs = [...(elements[i]?.childNodes ?? [])].filter((n): n is Text => n.nodeType === Node.TEXT_NODE);
		runs.forEach((t, k) => (t.data = k === 0 ? text : ''));
	}
}

// The trigger's markup that is not text and differs by choice (a team's logo): convert put every variant after it, hidden.
function showVariants(trigger: HTMLElement, picks: readonly (readonly [number, number])[]): void {
	for (const [of, n] of picks) for (const el of trigger.querySelectorAll(`[data-mm-variant-of="${of}"]`)) el.toggleAttribute('hidden', el.getAttribute('data-mm-variant') !== String(n));
}

function openSub(trigger: HTMLElement, keyboard: boolean): Layer | undefined {
	const parent = layerOf(trigger);
	if (!parent) return undefined;
	clearTimeout(openTimer);
	if (subOf.get(parent)?.trigger === trigger) return subOf.get(parent);
	closeSubs(parent);
	const layer = openLayer(trigger, keyOf(trigger), {
		onDismiss: (l, reason, event) => {
			if (reason === 'escape') return closeMenu(l);
			// A press outside every menu of the chain closes the whole menu; one in a parent only this submenu.
			const target = event?.target instanceof Node ? event.target : null;
			let up: Layer | undefined = parentOf(l);
			closeSubs(up ?? l);
			for (; up; up = parentOf(up)) if (target && (up.nodes.some((n) => n.contains(target)) || up.trigger.contains(target))) return;
			closeMenu(l);
		},
	});
	if (!layer) return undefined;
	subOf.set(parent, layer);
	setTrigger(trigger, true, layer);
	clearHighlight(layer);
	if (keyboard) highlight(items(layer)[0]);
	return layer;
}

// Radix's pointer grace area: the polygon from where the pointer left an open sub-trigger to the submenu's near and far
// edges, for 300 ms, while the pointer heads its way.
let grace: { layer: Layer; area: { x: number; y: number }[]; side: string; until: number } | undefined;
let openTimer = 0;

// MenuContent's onPointerMove: the way the mouse last moved across the content, from where it lies inside it.
// An item's handlers run before the content's, so they read the way the pointer headed before the move they answer.
const motion = new WeakMap<Layer, { x: number; dir: string }>();
function track(layer: Layer, event: PointerEvent): void {
	const m = motion.get(layer) ?? { x: 0, dir: 'right' };
	if (event.clientX !== m.x) m.dir = event.clientX > m.x ? 'right' : 'left';
	m.x = event.clientX;
	motion.set(layer, m);
}
let watching = false;
function watchMoves(): void {
	if (watching) return;
	watching = true;
	document.addEventListener(
		'pointermove',
		(event) => {
			if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
			const layer = layerOf(event.target);
			if (!layer?.content.contains(event.target)) return;
			// MenuItem's onPointerMove: an item the pointer moves on takes focus again, though the pointer never left it.
			const item = event.target.closest<HTMLElement>(ITEM);
			if (item && layerOf(item) === layer && !item.contains(document.activeElement)) enter(item, layer, event);
			track(layer, event);
		},
		true,
	);
}

function inPolygon(x: number, y: number, area: readonly { x: number; y: number }[]): boolean {
	let inside = false;
	for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
		const a = area[i]!;
		const b = area[j]!;
		if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
	}
	return inside;
}

const movingToSub = (layer: Layer, event: PointerEvent) => Boolean(grace && grace.layer === layer && Date.now() < grace.until && (motion.get(layer)?.dir ?? 'right') === grace.side && inPolygon(event.clientX, event.clientY, grace.area));

function switchTo(from: HTMLElement, to: HTMLElement | undefined, first: boolean): boolean {
	const open = openOf(from);
	if (!to || to === from) return false;
	if (open) close(open, true);
	return openMenu(to, first);
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	const bar = target.closest<HTMLElement>('[data-slot="menubar-trigger"][data-state]');
	if (bar) {
		const open = barTriggers(bar.closest(BAR) ?? bar).find((t) => t !== bar && t.getAttribute('aria-expanded') === 'true');
		return open ? switchTo(open, bar, false) : false;
	}
	const within = event.pointerType === 'mouse' ? layerOf(target) : undefined;
	if (within?.content.contains(target)) watchMoves();
	const item = target.closest<HTMLElement>(ITEM);
	const layer = item && layerOf(item);
	if (!item || !layer || event.pointerType !== 'mouse') return false;
	enter(item, layer, event);
	return true;
}

function enter(item: HTMLElement, layer: Layer, event: PointerEvent): void {
	if (disabled(item)) {
		if (!movingToSub(layer, event)) layer.content.focus({ preventScroll: true });
		return;
	}
	if (movingToSub(layer, event)) return;
	highlight(item);
	if (isSubTrigger(item) && subOf.get(layer)?.trigger !== item) {
		grace = undefined;
		clearTimeout(openTimer);
		openTimer = window.setTimeout(() => layerOf(item) === layer && openSub(item, false), 100);
	}
}

// MenuItem's onPointerLeave: the content takes focus back from the item.
export function pointerout(target: Element, event: PointerEvent): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const layer = item && layerOf(item);
	if (!item || !layer || event.pointerType !== 'mouse') return false;
	const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	if (to && item.contains(to)) return true;
	const sub = subOf.get(layer);
	if (isSubTrigger(item)) {
		clearTimeout(openTimer);
		if (sub?.trigger === item) {
			const rect = sub.content.getBoundingClientRect();
			const side = sub.content.dataset.side ?? 'right';
			const right = side === 'right';
			const near = rect[right ? 'left' : 'right'];
			const far = rect[right ? 'right' : 'left'];
			grace = { layer, side, until: Date.now() + 300, area: [{ x: event.clientX + (right ? -5 : 5), y: event.clientY }, { x: near, y: rect.top }, { x: far, y: rect.top }, { x: far, y: rect.bottom }, { x: near, y: rect.bottom }] };
		}
	}
	const heading = movingToSub(layer, event);
	if (to && layer.content.contains(to)) track(layer, event);
	if (!heading && item.contains(document.activeElement)) layer.content.focus({ preventScroll: true });
	return true;
}

export function focusin(target: Element, event: FocusEvent): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.matches(BAR)) {
		// RovingFocusGroup's entry focus: a keyboard focus on the bar itself moves on to its tab stop.
		const from = event.relatedTarget instanceof Node ? event.relatedTarget : null;
		if ((from && target.contains(from)) || !target.matches(':focus-visible')) return false;
		const list = barTriggers(target).filter((t) => !disabled(t));
		(list.find((t) => t.getAttribute('tabindex') === '0') ?? list[0])?.focus();
		return true;
	}
	const bar = barOf(target);
	if (bar) {
		setTabStop(target);
		mark(target);
		return false;
	}
	const layer = layerOf(target);
	if (!layer) return false;
	// Focus moving in a menu closes each open submenu it is not in or on the trigger of (their onFocusOutside).
	const sub = subOf.get(layer);
	if (sub && layer.content.contains(target)) closeSubs(sub.trigger === target ? sub : layer);
	if (target.matches(ITEM)) mark(target);
	return false;
}

function rove(trigger: HTMLElement, event: KeyboardEvent): boolean {
	const bar = barOf(trigger)!;
	const key = rtl(bar) ? ({ ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' } as Record<string, string>)[event.key] ?? event.key : event.key;
	const intent = ({ ArrowLeft: 'prev', ArrowRight: 'next', Home: 'first', PageUp: 'first', End: 'last', PageDown: 'last' } as Record<string, string>)[key];
	if (!intent) return false;
	if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return true;
	event.preventDefault();
	const list = barTriggers(bar).filter((t) => !disabled(t));
	const at = list.indexOf(trigger);
	const to = intent === 'first' ? list[0] : intent === 'last' ? list[list.length - 1] : stepIn(list, at, intent === 'next' ? 1 : -1, loops(bar));
	setTimeout(() => to?.focus());
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = triggerOf(target);
	if (trigger && ['Enter', ' ', 'ArrowDown'].includes(event.key) && trigger.getAttribute('aria-expanded') !== 'true') {
		event.preventDefault();
		return openMenu(trigger, true);
	}
	if (trigger === target && barOf(trigger) && rove(trigger, event)) return true;
	if (target instanceof HTMLElement && target.matches(BAR_TRIGGER) && barOf(target) && event.key === 'Tab' && event.shiftKey) {
		// Shift+Tab from a trigger leaves the bar rather than landing on its own tab stop.
		const bar = barOf(target)!;
		bar.setAttribute('tabindex', '-1');
		setTimeout(() => bar.setAttribute('tabindex', '0'));
		return false;
	}
	const layer = layerOf(target);
	if (!layer || !layer.content.contains(target) || !layer.content.matches('[role="menu"]')) return false;
	const root = menuRoot(layer);
	const inlineEnd = rtl(layer.content) ? 'ArrowLeft' : 'ArrowRight';
	const inlineStart = inlineEnd === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
	if (isSubTrigger(target) && !disabled(target) && ['Enter', ' ', inlineEnd].includes(event.key)) {
		event.preventDefault();
		const sub = subOf.get(layer)?.trigger === target ? subOf.get(layer) : openSub(target as HTMLElement, true);
		if (sub && sub.content.contains(document.activeElement) === false) highlight(items(sub)[0]);
		return true;
	}
	if (layer !== root && event.key === inlineStart) {
		event.preventDefault();
		const parent = parentOf(layer)!;
		closeSubs(parent);
		layer.trigger.focus();
		return true;
	}
	if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && barOf(root.trigger)) {
		const all = barTriggers(barOf(root.trigger)!).filter((t) => !disabled(t));
		const step = (event.key === 'ArrowRight') !== rtl(root.trigger) ? 1 : -1;
		event.preventDefault();
		return switchTo(root.trigger, stepIn(all, all.indexOf(root.trigger), step, loops(barOf(root.trigger)!)), false);
	}
	const list = items(layer);
	const at = list.indexOf(target.closest<HTMLElement>(ITEM)!);
	// From the content itself the first keys focus the first item and the last keys the last (MenuContent's onKeyDown).
	const first = list[0];
	const last = list[list.length - 1];
	const to = (
		target === layer.content
			? { ArrowDown: first, PageUp: first, Home: first, ArrowUp: last, PageDown: last, End: last }
			: { ArrowDown: list[at + 1], ArrowUp: list[at - 1], Home: first, PageUp: first, End: last, PageDown: last }
	)[event.key];
	if (to || ['ArrowDown', 'ArrowUp'].includes(event.key)) {
		event.preventDefault();
		highlight(to);
		return true;
	}
	const typing = Boolean(searches.get(layer.content)?.text);
	if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && (typing || event.key !== ' ')) {
		typeahead(layer, list, event.key);
		return true;
	}
	if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
		event.preventDefault();
		list[at]!.click();
		return true;
	}
	if (event.key === 'Tab') {
		event.preventDefault();
		return true;
	}
	return false;
}

// MenuContent's typeahead: the keys typed less than a second apart are one search, matched from the focused item.
const searches = new WeakMap<HTMLElement, { text: string; timer: number }>();
function typeahead(layer: Layer, list: readonly HTMLElement[], key: string): void {
	const own = searches.get(layer.content) ?? { text: '', timer: 0 };
	searches.set(layer.content, own);
	own.text += key;
	clearTimeout(own.timer);
	own.timer = window.setTimeout(() => (own.text = ''), 1000);
	const texts = list.map((i) => (i.textContent ?? '').trim());
	const current = list.findIndex((i) => i === document.activeElement);
	const match = nextMatch(texts, own.text, current < 0 ? undefined : texts[current]);
	highlight(match === undefined ? undefined : list[texts.indexOf(match)]);
}

// Radix's getNextMatch: one key repeated is that key, a single key skips the current match, and none but it is no move.
function nextMatch(values: readonly string[], search: string, current: string | undefined): string | undefined {
	const repeated = search.length > 1 && [...search].every((c) => c === search[0]);
	const wanted = (repeated ? search[0]! : search).toLowerCase();
	const from = Math.max(current === undefined ? -1 : values.indexOf(current), 0);
	let wrapped = [...values.slice(from), ...values.slice(0, from)];
	if (wanted.length === 1) wrapped = wrapped.filter((v) => v !== current);
	const next = wrapped.find((v) => v.toLowerCase().startsWith(wanted));
	return next !== current ? next : undefined;
}
