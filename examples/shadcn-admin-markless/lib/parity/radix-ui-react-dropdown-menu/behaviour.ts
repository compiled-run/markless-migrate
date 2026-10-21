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

// Floating UI as Radix's Popper drives it: the wrapper is written only when the content opens (Radix mounts it then),
// with the same properties in the same order, the available space and the transform origin its middleware report.
function place(wrapper: HTMLElement, content: HTMLElement, trigger: HTMLElement): void {
	const side = (content.dataset.side ?? 'bottom') as Side;
	const align = (content.dataset.align ?? 'center') as Align;
	const offset = Number(content.dataset.sideOffset ?? 4);
	const anchor = trigger.getBoundingClientRect();
	const write = (transform: string, origin: string, availableWidth: number, availableHeight: number) =>
		wrapper.setAttribute('style', `position: fixed; left: 0px; top: 0px; transform: ${transform}; min-width: max-content; --radix-popper-transform-origin: ${origin}; z-index: 50; --radix-popper-available-width: ${availableWidth}px; --radix-popper-available-height: ${availableHeight}px; --radix-popper-anchor-width: ${anchor.width}px; --radix-popper-anchor-height: ${anchor.height}px;`);
	write('translate(0px, -200%)', '0% 0px', innerWidth, innerHeight);
	// The part's own prefix (dropdown-menu, popover, select) names its copies of the popper's values.
	const prefix = /origin-\(--radix-([a-z-]+)-content-transform-origin\)/.exec(content.className)?.[1] ?? 'dropdown-menu';
	// SelectPopperPosition lays its content out as a column (the viewport flexes inside it) and keeps 10 px from the viewport's edges.
	const select = prefix === 'select';
	const padding = select ? 10 : 0;
	if (select) {
		content.style.setProperty('box-sizing', 'border-box');
		content.style.setProperty('display', 'flex');
		content.style.setProperty('flex-direction', 'column');
	}
	content.style.setProperty('outline', 'none');
	content.style.setProperty(`--radix-${prefix}-content-transform-origin`, 'var(--radix-popper-transform-origin)');
	content.style.setProperty(`--radix-${prefix}-content-available-width`, 'var(--radix-popper-available-width)');
	content.style.setProperty(`--radix-${prefix}-content-available-height`, 'var(--radix-popper-available-height)');
	content.style.setProperty(`--radix-${prefix}-trigger-width`, 'var(--radix-popper-anchor-width)');
	content.style.setProperty(`--radix-${prefix}-trigger-height`, 'var(--radix-popper-anchor-height)');
	// A Select's viewport is styled as Radix mounts it, on opening.
	for (const viewport of content.querySelectorAll('[data-radix-select-viewport]')) viewport.setAttribute('style', 'position: relative; flex: 1 1 0%; overflow: hidden auto;');
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
	x = Math.max(padding, Math.min(x, innerWidth - box.width - padding));
	content.dataset.side = actual;
	// The transformOrigin middleware with no arrow: the edge facing the trigger, at the aligned end.
	const at = align === 'start' ? '0%' : align === 'end' ? '100%' : '50%';
	const origin = actual === 'bottom' ? `${at} 0px` : actual === 'top' ? `${at} ${box.height}px` : actual === 'right' ? `0px ${at}` : `${box.width}px ${at}`;
	// The size middleware: the room left between the trigger and the viewport's edge on the side the content opens to.
	const availableHeight = (actual === 'bottom' ? innerHeight - anchor.bottom - offset : actual === 'top' ? anchor.top - offset : innerHeight) - padding * (actual === 'bottom' || actual === 'top' ? 1 : 2);
	const availableWidth = (actual === 'right' ? innerWidth - anchor.right - offset : actual === 'left' ? anchor.left - offset : innerWidth) - padding * (actual === 'right' || actual === 'left' ? 1 : 2);
	write(`translate(${Math.round(x)}px, ${Math.round(y)}px)`, origin, availableWidth, availableHeight);
}

// Radix's Portal appends the content to the body as it opens. Here it moves to the end of the Markless container it is
// rendered in instead (as the Radix Dialog port does), the last place inside the root the runtime delegates events
// from, so its items still answer and a menu written inside the page's <main> leaves that landmark to be hidden.
// The attribute and the page-end comment are the served markup's own (@markless/web owns both).
function portal(el: HTMLElement): void {
	const host = el.parentElement?.closest('[data-async-container]');
	if (!host) return;
	let end: ChildNode | null = null;
	for (let node = host.lastChild; node; node = node.previousSibling) {
		if (node.nodeType === Node.COMMENT_NODE && (node as Comment).data === 'markless:page-end') {
			end = node;
			break;
		}
	}
	if (el.nextSibling === end && el.parentNode === host) return;
	host.insertBefore(el, end);
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

// react-remove-scroll, which Radix wraps a modal menu's content in: the body is marked locked (a counter shared with
// any dialog's lock) and its scroll bar removed, with the bar's width kept as margin, while the menu is open.
const scrollLocked = new Set<string>();
let scrollStyle: HTMLStyleElement | null = null;

function scrollBarStyle(): string {
	const cs = getComputedStyle(document.body);
	const parse = (x: string) => parseInt(x || '', 10) || 0;
	const [left, top, right] = [parse(cs.marginLeft), parse(cs.marginTop), parse(cs.marginRight)];
	const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth + right - left);
	const important = '!important';
	return `\n  .with-scroll-bars-hidden {\n   overflow: hidden ${important};\n   padding-right: ${gap}px ${important};\n  }\n  body[data-scroll-locked] {\n    overflow: hidden ${important};\n    overscroll-behavior: contain;\n    position: relative ${important};\n    padding-left: ${left}px;\n    padding-top: ${top}px;\n    padding-right: ${right}px;\n    margin-left:0;\n    margin-top:0;\n    margin-right: ${gap}px ${important};\n    \n  }\n  \n  .right-scroll-bar-position {\n    right: ${gap}px ${important};\n  }\n  \n  .width-before-scroll-bar {\n    margin-right: ${gap}px ${important};\n  }\n  \n  .right-scroll-bar-position .right-scroll-bar-position {\n    right: 0 ${important};\n  }\n  \n  .width-before-scroll-bar .width-before-scroll-bar {\n    margin-right: 0 ${important};\n  }\n  \n  body[data-scroll-locked] {\n    --removed-body-scroll-bar-size: ${gap}px;\n  }\n`;
}

function lockScroll(name: string): void {
	if (scrollLocked.has(name)) return;
	if (!scrollLocked.size && !document.body.hasAttribute('data-scroll-locked')) {
		scrollStyle = document.createElement('style');
		scrollStyle.type = 'text/css';
		scrollStyle.appendChild(document.createTextNode(scrollBarStyle()));
		document.head.appendChild(scrollStyle);
	}
	scrollLocked.add(name);
	const counter = parseInt(document.body.getAttribute('data-scroll-locked') || '0', 10);
	document.body.setAttribute('data-scroll-locked', String((isFinite(counter) ? counter : 0) + 1));
}

function unlockScroll(name: string): void {
	if (!scrollLocked.delete(name)) return;
	const next = parseInt(document.body.getAttribute('data-scroll-locked') || '0', 10) - 1;
	if (next <= 0) document.body.removeAttribute('data-scroll-locked');
	else document.body.setAttribute('data-scroll-locked', String(next));
	if (!scrollLocked.size && scrollStyle) {
		scrollStyle.remove();
		scrollStyle = null;
	}
}

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
	// Floating UI's first frame: fixed and off screen. In the page's flow, cmdk's reset below would scroll the page to its
	// first item, and the content would be placed against a trigger moved by that scroll.
	wrapper.setAttribute('style', 'position: fixed; left: 0px; top: 0px; transform: translate(0px, -200%); min-width: max-content;');
	wrapper.hidden = false;
	portal(wrapper);
	if (content.querySelector('[cmdk-root]')) resetIn(content);
	place(wrapper, content, trigger);
	if (modal) {
		hideOthers(name, wrapper);
		lockScroll(name);
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
	const trigger = refocus ? (restoreFocus.get(name) ?? find(triggers, name)) : undefined;
	// Radix's FocusScope gives focus back as the content unmounts: after its exit animation, when it has one.
	let exiting = false;
	if (content && wrapper) {
		const shown = (opened.get(name) ?? 0) + 1;
		opened.set(name, shown);
		// Radix Presence keeps a menu or popover mounted until its exit animation ends; a Select's content goes at once.
		content.dataset.state = 'closed';
		if (content.getAttribute('role') !== 'listbox' && getComputedStyle(content).animationName !== 'none') {
			exiting = true;
			const ended = (event: AnimationEvent) => {
				if (event.target !== content) return;
				content.removeEventListener('animationend', ended);
				if (opened.get(name) !== shown) return;
				const active = document.activeElement;
				const kept = !active || active === document.body || content.contains(active);
				wrapper.hidden = true;
				if (trigger && kept) giveFocusBack(trigger);
			};
			content.addEventListener('animationend', ended);
		} else wrapper.hidden = true;
	}
	showOthers(name);
	unlockScroll(name);
	document.body.style.pointerEvents = document.body.hasAttribute('data-scroll-locked') ? 'none' : '';
	const listener = outside.get(name);
	if (listener) document.removeEventListener('pointerdown', listener, true);
	const escape = escapes.get(name);
	if (escape) document.removeEventListener('keydown', escape);
	escapes.delete(name);
	outside.delete(name);
	if (trigger && !exiting) giveFocusBack(trigger);
}

function giveFocusBack(trigger: HTMLElement): void {
	trigger.focus();
	// Radix's FocusScope gives focus back after the press that closed the menu has run its own default, which, on a
	// page whose pointer events are off, focuses the body: focus goes back to the trigger once that has happened.
	setTimeout(() => {
		const active = document.activeElement;
		if (!active || active === document.body) trigger.focus();
	});
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

const ITEM = '[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option]';

/** Radix's MenuItem onPointerMove: a mouse over an item focuses it, so a press on it does not move focus again. */
export function pointerFocus(event: PointerEvent): void {
	if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
	const content = event.target.closest<HTMLElement>('[data-radix-menu-content]');
	if (!content) return;
	const item = event.target.closest<HTMLElement>(ITEM);
	if (item && content.contains(item) && !item.hasAttribute('data-disabled')) {
		if (document.activeElement !== item) item.focus({ preventScroll: true });
	} else if (document.activeElement !== content && content.contains(document.activeElement)) content.focus({ preventScroll: true });
}

/** Radix's onItemLeave: the pointer leaving the items gives focus back to the content. */
export function pointerLeave(event: PointerEvent): void {
	if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
	const content = event.target.closest<HTMLElement>('[data-radix-menu-content]');
	if (content && document.activeElement !== content && content.contains(document.activeElement)) content.focus({ preventScroll: true });
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

