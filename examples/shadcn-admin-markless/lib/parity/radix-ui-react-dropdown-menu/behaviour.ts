// The DOM half of the dropdown-menu port: placement, focus, and hiding the rest of the page while a modal
// menu is open (Radix's hideOthers). Plain functions over the elements the menu parts bind; the open/closed
// state itself stays in the parts, which write it in their own handlers.
import { resetIn } from '../cmdk/behaviour.ts';

type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';

const hidden = new Map<string, HTMLElement[]>();
const restoreFocus = new Map<string, HTMLElement>();
const outside = new Map<string, (event: PointerEvent) => void>();
const escapes = new Map<string, (event: KeyboardEvent) => void>();

const find = <T extends HTMLElement>(list: readonly T[] | T | undefined, name: string): T | undefined => {
	const all = Array.isArray(list) ? list : list ? [list as T] : [];
	return all.find((el) => el.dataset.menu === name);
};

export function items(content: HTMLElement): HTMLElement[] {
	return [...content.querySelectorAll<HTMLElement>('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option]')].filter((el) => !el.hasAttribute('data-disabled') && el.offsetParent !== null);
}

function place(wrapper: HTMLElement, content: HTMLElement, trigger: HTMLElement): void {
	const side = (content.dataset.side ?? 'bottom') as Side;
	const align = (content.dataset.align ?? 'center') as Align;
	const offset = Number(content.dataset.sideOffset ?? 4);
	const anchor = trigger.getBoundingClientRect();
	wrapper.style.setProperty('--radix-popper-anchor-width', `${anchor.width}px`);
	wrapper.style.setProperty('--radix-popper-anchor-height', `${anchor.height}px`);
	wrapper.style.setProperty('--radix-popper-available-width', `${innerWidth}px`);
	wrapper.style.setProperty('--radix-popper-available-height', `${innerHeight}px`);
	content.style.setProperty('--radix-dropdown-menu-trigger-width', 'var(--radix-popper-anchor-width)');
	content.style.setProperty('--radix-dropdown-menu-trigger-height', 'var(--radix-popper-anchor-height)');
	content.style.setProperty('--radix-dropdown-menu-content-available-height', 'var(--radix-popper-available-height)');
	content.style.setProperty('--radix-dropdown-menu-content-available-width', 'var(--radix-popper-available-width)');
	const box = content.getBoundingClientRect();
	const along = (start: number, size: number, own: number) => (align === 'start' ? start : align === 'end' ? start + size - own : start + (size - own) / 2);
	let x: number;
	let y: number;
	let actual: Side = side;
	if (side === 'bottom' || side === 'top') {
		x = along(anchor.left, anchor.width, box.width);
		y = side === 'bottom' ? anchor.bottom + offset : anchor.top - offset - box.height;
		if (side === 'bottom' && y + box.height > innerHeight && anchor.top - offset - box.height >= 0) {
			y = anchor.top - offset - box.height;
			actual = 'top';
		}
	} else {
		y = along(anchor.top, anchor.height, box.height);
		x = side === 'right' ? anchor.right + offset : anchor.left - offset - box.width;
		if (y + box.height > innerHeight) y = Math.max(0, innerHeight - box.height);
	}
	x = Math.max(0, Math.min(x, innerWidth - box.width));
	content.dataset.side = actual;
	wrapper.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/** Radix's hideOthers: everything outside `keep` (and outside live regions) is hidden from assistive technology until showOthers. */
export function hideOthers(name: string, keep: HTMLElement): void {
	// As the aria-hidden package does for Radix: live regions and their ancestors stay exposed, everything else outside `keep` is hidden. The @markless/ui tabs mark their panels aria-live=off, which Radix's tabs do not, so those count as no live region.
	const targets = new Set<Element>([keep, ...[...document.body.querySelectorAll('[aria-live]:not([aria-live=off])')].filter((el) => !el.closest('[hidden]'))]);
	const kept = new Set<Element>();
	for (const target of targets) for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) kept.add(node);
	const changed: HTMLElement[] = [];
	const walk = (parent: Element) => {
		for (const child of [...parent.children]) {
			if (targets.has(child) || !(child instanceof HTMLElement)) continue;
			if (kept.has(child)) {
				walk(child);
				continue;
			}
			if (/^(SCRIPT|STYLE|TEMPLATE)$/.test(child.tagName) || child.getAttribute('aria-hidden') === 'true') continue;
			child.setAttribute('aria-hidden', 'true');
			child.setAttribute('data-aria-hidden', 'true');
			changed.push(child);
		}
	};
	walk(document.body);
	hidden.set(name, changed);
}

export function showOthers(name: string): void {
	for (const el of hidden.get(name) ?? []) {
		el.removeAttribute('aria-hidden');
		el.removeAttribute('data-aria-hidden');
	}
	hidden.delete(name);
}

const opened = new Map<string, number>();

/** Show the named menu: place it by its trigger, hide everything else from assistive technology, and focus the menu (a pointer open) or its first item (a keyboard open). */
export function openMenu(contents: readonly HTMLElement[] | HTMLElement | undefined, triggers: readonly HTMLElement[] | HTMLElement | undefined, name: string, focus: 'content' | 'first', onOutside?: (refocus: boolean) => void, source?: EventTarget | null): void {
	const content = find(contents, name);
	// Several triggers may open one menu (a row's actions): the one pressed is the anchor.
	const pressed = source instanceof Element ? (source.closest('[data-menu]') as HTMLElement | null) : null;
	const trigger = pressed && pressed.dataset.menu === name ? pressed : find(triggers, name);
	const wrapper = content?.parentElement;
	if (!content || !trigger || !wrapper) return;
	const modal = content.dataset.modal !== 'false';
	// cmdk inside a Radix Popover mounts afresh on every open: empty query, first item selected.
	opened.set(name, (opened.get(name) ?? 0) + 1);
	wrapper.hidden = false;
	if (content.querySelector('[cmdk-root]')) resetIn(content);
	place(wrapper, content, trigger);
	if (modal) {
		hideOthers(name, wrapper);
		document.body.style.pointerEvents = 'none';
		content.style.pointerEvents = 'auto';
	}
	restoreFocus.set(name, trigger);
	const role = content.getAttribute('role');
	// A popover focuses what it holds first (Radix FocusScope), a select its chosen option.
	const start = role === 'dialog' ? content.querySelector<HTMLElement>('input, button, [tabindex="0"]') : role === 'listbox' ? (content.querySelector<HTMLElement>('[aria-selected="true"]') ?? items(content)[0]) : focus === 'first' ? items(content)[0] : undefined;
	(start ?? content).focus();
	const listener = (event: PointerEvent) => {
		if (event.target instanceof Node && (content.contains(event.target) || trigger.contains(event.target))) return;
		onOutside?.(modal);
	};
	outside.set(name, listener);
	document.addEventListener('pointerdown', listener, true);
	// DismissableLayer: Escape anywhere closes the menu, wherever focus is.
	const escape = (event: KeyboardEvent) => {
		if (event.key !== 'Escape' || content.contains(event.target as Node)) return;
		event.preventDefault();
		onOutside?.(true);
	};
	escapes.get(name) && document.removeEventListener('keydown', escapes.get(name)!);
	escapes.set(name, escape);
	document.addEventListener('keydown', escape);
}

/** Hide the named menu, show the page again, and send focus back to its trigger. */
export function closeMenu(contents: readonly HTMLElement[] | HTMLElement | undefined, triggers: readonly HTMLElement[] | HTMLElement | undefined, name: string, refocus: boolean): void {
	const content = find(contents, name);
	const wrapper = content?.parentElement;
	if (content && wrapper) {
		const shown = (opened.get(name) ?? 0) + 1;
		opened.set(name, shown);
		// Radix Presence keeps a menu or popover mounted until its exit animation ends; a Select's content goes at once.
		content.dataset.state = 'closed';
		if (content.getAttribute('role') !== 'listbox' && getComputedStyle(content).animationName !== 'none') {
			const ended = (event: AnimationEvent) => {
				if (event.target !== content) return;
				content.removeEventListener('animationend', ended);
				if (opened.get(name) === shown) wrapper.hidden = true;
			};
			content.addEventListener('animationend', ended);
		} else wrapper.hidden = true;
	}
	showOthers(name);
	document.body.style.pointerEvents = document.body.hasAttribute('data-scroll-locked') ? 'none' : '';
	const listener = outside.get(name);
	if (listener) document.removeEventListener('pointerdown', listener, true);
	const escape = escapes.get(name);
	if (escape) document.removeEventListener('keydown', escape);
	escapes.delete(name);
	outside.delete(name);
	if (refocus) (restoreFocus.get(name) ?? find(triggers, name))?.focus();
}

export function selectAndClose(contents: readonly HTMLElement[] | HTMLElement | undefined, triggers: readonly HTMLElement[] | HTMLElement | undefined, name: string): void {
	closeMenu(contents, triggers, name, true);
}

/** The item that has focus inside the named menu, if any. */
export function focusItem(contents: readonly HTMLElement[] | HTMLElement | undefined, name: string): HTMLElement | undefined {
	const content = find(contents, name);
	const active = document.activeElement;
	return content && active instanceof HTMLElement && active !== content && content.contains(active) ? active : undefined;
}

/** Arrow keys, Home and End over the menu's items; the arrows stop at the ends (Radix's loop is off). */
export function moveFocus(contents: readonly HTMLElement[] | HTMLElement | undefined, name: string, key: string): void {
	const content = find(contents, name);
	if (!content) return;
	const list = items(content);
	if (!list.length) return;
	const at = list.indexOf(document.activeElement as HTMLElement);
	const next = key === 'Home' ? 0 : key === 'End' ? list.length - 1 : key === 'ArrowDown' ? (at < 0 ? 0 : Math.min(at + 1, list.length - 1)) : at < 0 ? list.length - 1 : Math.max(at - 1, 0);
	list[next]?.focus();
}


/** A pointer press on a trigger: close the menu if this trigger has it open, otherwise open it. */
export function toggleMenu(contents: readonly HTMLElement[] | HTMLElement | undefined, triggers: readonly HTMLElement[] | HTMLElement | undefined, name: string, closing: boolean, source: EventTarget | null, onOutside: (refocus: boolean) => void): void {
	if (closing) return closeMenu(contents, triggers, name, true);
	openMenu(contents, triggers, name, 'content', onOutside, source);
}

export function linkOf(target: EventTarget | null): HTMLAnchorElement | null {
	return target instanceof Element ? target.closest('a[href]') : null;
}

/** The menu an item belongs to. */
export function menuOf(el: Element | null): string {
	return el?.closest('[data-radix-menu-content]')?.getAttribute('data-menu') ?? '';
}

