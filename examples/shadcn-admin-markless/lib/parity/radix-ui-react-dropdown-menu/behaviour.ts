// The DOM half of the dropdown-menu port: placement, focus, and hiding the rest of the page while a modal
// menu is open (Radix's hideOthers). Plain functions over the elements the menu parts bind; the open/closed
// state itself stays in the parts, which write it in their own handlers.
type Side = 'top' | 'right' | 'bottom' | 'left';
type Align = 'start' | 'center' | 'end';

const hidden = new Map<string, HTMLElement[]>();
const restoreFocus = new Map<string, HTMLElement>();
const outside = new Map<string, (event: PointerEvent) => void>();

const find = <T extends HTMLElement>(list: readonly T[] | T | undefined, name: string): T | undefined => {
	const all = Array.isArray(list) ? list : list ? [list as T] : [];
	return all.find((el) => el.dataset.menu === name);
};

export function items(content: HTMLElement): HTMLElement[] {
	return [...content.querySelectorAll<HTMLElement>('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]')].filter((el) => !el.hasAttribute('data-disabled') && el.offsetParent !== null);
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
	const changed: HTMLElement[] = [];
	for (let node: HTMLElement | null = keep; node && node !== document.body; node = node.parentElement) {
		for (const sibling of node.parentElement ? [...node.parentElement.children] : []) {
			if (sibling === node || !(sibling instanceof HTMLElement) || /^(SCRIPT|STYLE|TEMPLATE)$/.test(sibling.tagName) || sibling.getAttribute('aria-hidden') === 'true' || sibling.hasAttribute('aria-live')) continue;
			sibling.setAttribute('aria-hidden', 'true');
			sibling.setAttribute('data-aria-hidden', 'true');
			changed.push(sibling);
		}
	}
	hidden.set(name, changed);
}

export function showOthers(name: string): void {
	for (const el of hidden.get(name) ?? []) {
		el.removeAttribute('aria-hidden');
		el.removeAttribute('data-aria-hidden');
	}
	hidden.delete(name);
}

/** Show the named menu: place it by its trigger, hide everything else from assistive technology, and focus the menu (a pointer open) or its first item (a keyboard open). */
export function openMenu(contents: readonly HTMLElement[] | HTMLElement | undefined, triggers: readonly HTMLElement[] | HTMLElement | undefined, name: string, focus: 'content' | 'first', onOutside?: (refocus: boolean) => void): void {
	const content = find(contents, name);
	const trigger = find(triggers, name);
	const wrapper = content?.parentElement;
	if (!content || !trigger || !wrapper) return;
	const modal = content.dataset.modal !== 'false';
	wrapper.hidden = false;
	place(wrapper, content, trigger);
	if (modal) {
		hideOthers(name, wrapper);
		document.body.style.pointerEvents = 'none';
		content.style.pointerEvents = 'auto';
	}
	restoreFocus.set(name, trigger);
	(focus === 'first' ? (items(content)[0] ?? content) : content).focus();
	const listener = (event: PointerEvent) => {
		if (event.target instanceof Node && (content.contains(event.target) || trigger.contains(event.target))) return;
		onOutside?.(modal);
	};
	outside.set(name, listener);
	document.addEventListener('pointerdown', listener, true);
}

/** Hide the named menu, show the page again, and send focus back to its trigger. */
export function closeMenu(contents: readonly HTMLElement[] | HTMLElement | undefined, triggers: readonly HTMLElement[] | HTMLElement | undefined, name: string, refocus: boolean): void {
	const content = find(contents, name);
	if (content?.parentElement) content.parentElement.hidden = true;
	showOthers(name);
	document.body.style.pointerEvents = '';
	const listener = outside.get(name);
	if (listener) document.removeEventListener('pointerdown', listener, true);
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
