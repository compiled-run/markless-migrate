import { showCompanions } from '../reveal.ts';

// Radix NavigationMenu: a trigger opens its content in the menu's viewport, on a press or after the pointer rests on it
// (delayDuration 200 ms, none while another is open); leaving the menu closes it after 150 ms, as do Escape and a second
// press. The viewport with each trigger's content is rendered hidden beside the list (convert's companions, keyed by
// the trigger's id); this shows it, sizes the viewport from its content (--radix-navigation-menu-viewport-width and
// -height) and sets data-state, and data-motion on the contents when moving from one trigger to another. From the
// keyboard: the entry key on an open trigger (ArrowDown, horizontal) focuses the content's first tabbable; the arrows,
// Home and End move focus between the list's triggers and links, and between the links of a content (Radix's
// FocusGroup, not looping); the hidden focus proxy after an open trigger passes Tab into the content, and Tab past the
// content's last tabbable goes on from the proxy.

const TRIGGER = '[data-slot="navigation-menu-trigger"][aria-controls]';
const ROOT = '[data-slot="navigation-menu"]';
const opened = new Map<Element, HTMLElement>();
const timers = new WeakMap<Element, number>();

const companionsOf = (trigger: HTMLElement) => [...document.querySelectorAll<HTMLElement>(`[data-mm-shown-with="${CSS.escape(trigger.id)}"]`)];
const triggersOf = (root: Element) => [...root.querySelectorAll<HTMLElement>(TRIGGER)].filter((t) => t.closest(ROOT) === root);

function parts(trigger: HTMLElement): { viewport?: HTMLElement; content?: HTMLElement } {
	for (const c of companionsOf(trigger)) {
		const viewport = c.matches('[data-slot="navigation-menu-viewport"]') ? c : (c.querySelector<HTMLElement>('[data-slot="navigation-menu-viewport"]') ?? undefined);
		const content = c.querySelector<HTMLElement>('[data-slot="navigation-menu-content"]') ?? undefined;
		if (viewport || content) return { viewport, content };
	}
	return {};
}

function setTrigger(trigger: HTMLElement, open: boolean): void {
	trigger.setAttribute('aria-expanded', String(open));
	trigger.setAttribute('data-state', open ? 'open' : 'closed');
}

function open(trigger: HTMLElement): void {
	const root = trigger.closest(ROOT);
	if (!root || opened.get(root) === trigger) return;
	clearTimeout(timers.get(root));
	const previous = opened.get(root);
	const all = triggersOf(root);
	if (previous) {
		const forward = all.indexOf(trigger) > all.indexOf(previous);
		const before = parts(previous);
		before.content?.setAttribute('data-motion', forward ? 'to-start' : 'to-end');
		setTrigger(previous, false);
		showCompanions(previous.id, false);
		const next = parts(trigger);
		next.content?.setAttribute('data-motion', forward ? 'from-end' : 'from-start');
	}
	opened.set(root, trigger);
	setTrigger(trigger, true);
	showCompanions(trigger.id, true);
	const { viewport, content } = parts(trigger);
	// A content shown in the viewport carries no data-state of its own (NavigationMenuViewport renders it).
	for (const el of viewport ? [viewport] : [content]) el?.setAttribute('data-state', 'open');
	if (viewport && content) {
		viewport.style.setProperty('--radix-navigation-menu-viewport-width', `${content.offsetWidth}px`);
		viewport.style.setProperty('--radix-navigation-menu-viewport-height', `${content.offsetHeight}px`);
	}
}

function close(root: Element, focus = false): void {
	const trigger = opened.get(root);
	if (!trigger) return;
	opened.delete(root);
	setTrigger(trigger, false);
	const { viewport, content } = parts(trigger);
	for (const el of viewport ? [viewport] : [content]) el?.setAttribute('data-state', 'closed');
	const hide = () => opened.get(root) !== trigger && showCompanions(trigger.id, false);
	const animated = viewport && getComputedStyle(viewport).animationName !== 'none';
	if (animated) viewport!.addEventListener('animationend', hide, { once: true });
	else hide();
	if (focus) trigger.focus();
}

function schedule(root: Element, run: () => void, ms: number): void {
	clearTimeout(timers.get(root));
	timers.set(root, window.setTimeout(run, ms));
}

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const root = trigger?.closest(ROOT);
	if (!trigger || !root) return false;
	if (opened.get(root) === trigger) close(root);
	else open(trigger);
	return true;
}

export function pointerover(target: Element, event: PointerEvent): boolean {
	if (event.pointerType === 'touch') return false;
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const root = trigger?.closest(ROOT);
	if (trigger && root) {
		schedule(root, () => open(trigger), opened.has(root) ? 0 : 200);
		return true;
	}
	const inside = [...opened].find(([r, t]) => r.contains(target) || companionsOf(t).some((c) => c.contains(target)));
	if (inside) clearTimeout(timers.get(inside[0]));
	return false;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	for (const [root, trigger] of opened) {
		if (!root.contains(target) && !companionsOf(trigger).some((c) => c.contains(target))) continue;
		const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
		if (to && (root.contains(to) || companionsOf(trigger).some((c) => c.contains(to)))) return false;
		schedule(root, () => close(root), 150);
		return false;
	}
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const root = trigger?.closest(ROOT);
	if (root && !opened.has(root)) clearTimeout(timers.get(root));
	return false;
}

const tabbables = (container: Element) => [...container.querySelectorAll<HTMLElement>('*')].filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && !el.closest('[hidden]') && !(el instanceof HTMLInputElement && el.type === 'hidden'));

function focusFirst(candidates: readonly HTMLElement[]): boolean {
	const was = document.activeElement;
	return candidates.some((c) => {
		if (c === was) return true;
		c.focus();
		return document.activeElement !== was;
	});
}

const proxyOf = (trigger: HTMLElement) => {
	const next = trigger.nextElementSibling;
	return next instanceof HTMLElement && next.matches('[aria-hidden="true"][tabindex="0"]') && next.dataset.mmShownWith === trigger.id ? next : undefined;
};

// Radix's FocusGroup: the list's triggers and links, or the links of one content.
const LINK = '[data-slot="navigation-menu-link"]';
function groupOf(item: HTMLElement): HTMLElement[] | undefined {
	const content = item.closest('[data-slot="navigation-menu-content"]');
	if (content) return item.matches(LINK) ? [...content.querySelectorAll<HTMLElement>(LINK)] : undefined;
	const root = item.closest(ROOT);
	if (!root || !item.matches(`${TRIGGER}, ${LINK}`)) return undefined;
	return [...root.querySelectorAll<HTMLElement>(`${TRIGGER}, ${LINK}`)].filter((i) => i.closest(ROOT) === root && !i.closest('[data-slot="navigation-menu-content"]'));
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (event.key === 'Escape') {
		for (const [root, trigger] of opened) {
			if (!root.contains(target) && !companionsOf(trigger).some((c) => c.contains(target))) continue;
			close(root, true);
			return true;
		}
		return false;
	}
	const root = target.closest(ROOT);
	const rtl = root ? getComputedStyle(root).direction === 'rtl' : false;
	const vertical = root?.getAttribute('data-orientation') === 'vertical';
	if (target.matches(TRIGGER) && root && opened.get(root) === target && event.key === (vertical ? (rtl ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown')) {
		const { content } = parts(target as HTMLElement);
		if (content) focusFirst(tabbables(content));
		event.preventDefault();
		return true;
	}
	if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
		for (const [, trigger] of opened) {
			const { content } = parts(trigger);
			if (!content?.contains(target)) continue;
			const list = tabbables(content);
			const at = list.indexOf(document.activeElement as HTMLElement);
			if (focusFirst(event.shiftKey ? list.slice(0, at).reverse() : list.slice(at + 1))) event.preventDefault();
			else proxyOf(trigger)?.focus();
			return true;
		}
	}
	const item = target instanceof HTMLElement ? target : null;
	const group = item && groupOf(item);
	if (!item || !group || !['Home', 'End', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return false;
	let candidates = [...group];
	if ([rtl ? 'ArrowRight' : 'ArrowLeft', 'ArrowUp', 'End'].includes(event.key)) candidates.reverse();
	if (event.key.startsWith('Arrow')) candidates = candidates.slice(candidates.indexOf(item) + 1);
	event.preventDefault();
	setTimeout(() => focusFirst(candidates));
	return true;
}

// The focus proxy: Tab from the trigger enters the content at its first tabbable, Shift+Tab from after it at its last.
export function focusin(target: Element, event: FocusEvent): boolean {
	const trigger = target.previousElementSibling;
	if (!(trigger instanceof HTMLElement) || !trigger.matches(TRIGGER) || proxyOf(trigger) !== target) return false;
	const { content } = parts(trigger);
	if (!content) return false;
	const from = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	if (from !== trigger && from && content.contains(from)) return false;
	const list = tabbables(content);
	focusFirst(from === trigger ? list : list.reverse());
	return true;
}
