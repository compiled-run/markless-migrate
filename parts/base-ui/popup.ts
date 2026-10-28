import { layersFor, showCompanions } from '../reveal.ts';
import { place, type BaseOptions } from './positioner.ts';
import { enter, exit } from './transition.ts';
import { raiseOver } from '../stacking.ts';

// What Base UI's FloatingPortal, FloatingFocusManager and dismissal do around a popover, menu, select or tooltip: the
// portal container appended to the body, Escape and a press outside closing the top popup, the trigger marked open.

export interface Popup {
	readonly key: string;
	readonly trigger: HTMLElement;
	readonly portal: HTMLElement;
	readonly positioner: HTMLElement | null;
	readonly popup: HTMLElement;
	readonly backdrop: HTMLElement | null;
	/** The positioner and what lies between it and the popup carrying the open state (Select.Popup around its list). */
	readonly around: readonly HTMLElement[];
	readonly pressable: boolean;
	/** performance.now() when it opened. */
	readonly openedAt: number;
	/** Closes it as its part does (the part's onDismiss). */
	readonly dismiss: (reason: Dismissal) => void;
	stop?: () => void;
	lower?: () => void;
	cleanup: (() => void)[];
}

export type Dismissal = 'escape' | 'outside' | 'tab' | 'item';
const open: Popup[] = [];
let pressedOutside: Popup | undefined;
let tabbedOut: Popup | undefined;
export const popupOf = (el: Element) => open.find((p) => p.portal.contains(el));
export const top = () => open[open.length - 1];
export const isOpen = (key: string) => open.some((p) => p.key === key);

export function setTrigger(trigger: HTMLElement, on: boolean, pressable = false): void {
	// A plain button a page opens a popup from carries no ARIA for it.
	if (!trigger.hasAttribute('aria-haspopup') && !trigger.hasAttribute('data-base-ui-click-trigger') && trigger.hasAttribute('data-mm-key')) return;
	trigger.setAttribute('aria-expanded', String(on));
	for (const name of pressable ? ['data-popup-open', 'data-pressed'] : ['data-popup-open']) {
		if (on) trigger.setAttribute(name, '');
		else trigger.removeAttribute(name);
	}
}

// @base-ui/utils useScrollLock: one lock for every popup that asks, taken and released from a timer.
let locks = 0;
let restore: (() => void) | null = null;
let lockTimer: ReturnType<typeof setTimeout> | undefined;
let unlockTimer: ReturnType<typeof setTimeout> | undefined;
const isOverflowElement = (el: Element) => {
	const { overflow, overflowX, overflowY, display } = getComputedStyle(el);
	return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== 'inline' && display !== 'contents';
};
function supportsStableScrollbarGutter(): boolean {
	if (!CSS.supports('scrollbar-gutter', 'stable')) return false;
	const html = document.documentElement;
	const container = isOverflowElement(html) ? html : document.body;
	const [overflowY, gutter] = [container.style.overflowY, html.style.scrollbarGutter];
	html.style.scrollbarGutter = 'stable';
	container.style.overflowY = 'scroll';
	const before = container.offsetWidth;
	container.style.overflowY = 'hidden';
	const after = container.offsetWidth;
	container.style.overflowY = overflowY;
	html.style.scrollbarGutter = gutter;
	return before === after;
}
function preventScrollOverlayScrollbars(): () => void {
	const el = isOverflowElement(document.documentElement) ? document.documentElement : document.body;
	const before = { overflowY: el.style.overflowY, overflowX: el.style.overflowX };
	Object.assign(el.style, { overflowY: 'hidden', overflowX: 'hidden' });
	return () => Object.assign(el.style, before);
}
function preventScrollInsetScrollbars(): () => void {
	const html = document.documentElement;
	const body = document.body;
	let scrollTop = 0;
	let scrollLeft = 0;
	let gutterOnly = false;
	let frame = 0;
	let htmlBefore: Partial<CSSStyleDeclaration> = {};
	let bodyBefore: Partial<CSSStyleDeclaration> = {};
	let htmlScrollBehavior = '';
	const webkit = CSS.supports('-webkit-backdrop-filter:none');
	if (webkit && (visualViewport?.scale ?? 1) !== 1) return () => {};
	const lock = () => {
		const htmlStyles = getComputedStyle(html);
		const bodyStyles = getComputedStyle(body);
		const gutter = (htmlStyles.scrollbarGutter || '').includes('both-edges') ? 'stable both-edges' : 'stable';
		scrollTop = html.scrollTop;
		scrollLeft = html.scrollLeft;
		htmlBefore = { scrollbarGutter: html.style.scrollbarGutter, overflowY: html.style.overflowY, overflowX: html.style.overflowX };
		htmlScrollBehavior = html.style.scrollBehavior;
		bodyBefore = { position: body.style.position, height: body.style.height, width: body.style.width, boxSizing: body.style.boxSizing, overflowY: body.style.overflowY, overflowX: body.style.overflowX, scrollBehavior: body.style.scrollBehavior };
		const scrollableY = html.scrollHeight > html.clientHeight;
		const scrollableX = html.scrollWidth > html.clientWidth;
		const constantY = htmlStyles.overflowY === 'scroll' || bodyStyles.overflowY === 'scroll';
		const constantX = htmlStyles.overflowX === 'scroll' || bodyStyles.overflowX === 'scroll';
		const barWidth = Math.max(0, innerWidth - body.clientWidth);
		const barHeight = Math.max(0, innerHeight - body.clientHeight);
		const marginY = parseFloat(bodyStyles.marginTop) + parseFloat(bodyStyles.marginBottom);
		const marginX = parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight);
		const el = isOverflowElement(html) ? html : body;
		gutterOnly = supportsStableScrollbarGutter();
		if (gutterOnly) {
			html.style.scrollbarGutter = gutter;
			el.style.overflowY = 'hidden';
			el.style.overflowX = 'hidden';
			return;
		}
		Object.assign(html.style, { scrollbarGutter: gutter, overflowY: 'hidden', overflowX: 'hidden' });
		if (scrollableY || constantY) html.style.overflowY = 'scroll';
		if (scrollableX || constantX) html.style.overflowX = 'scroll';
		Object.assign(body.style, {
			position: 'relative',
			height: marginY || barHeight ? `calc(100dvh - ${marginY + barHeight}px)` : '100dvh',
			width: marginX || barWidth ? `calc(100vw - ${marginX + barWidth}px)` : '100vw',
			boxSizing: 'border-box',
			overflow: 'hidden',
			scrollBehavior: 'unset',
		});
		body.scrollTop = scrollTop;
		body.scrollLeft = scrollLeft;
		html.setAttribute('data-base-ui-scroll-locked', '');
		html.style.scrollBehavior = 'unset';
	};
	const cleanup = () => {
		Object.assign(html.style, htmlBefore);
		Object.assign(body.style, bodyBefore);
		if (gutterOnly) return;
		html.scrollTop = scrollTop;
		html.scrollLeft = scrollLeft;
		html.removeAttribute('data-base-ui-scroll-locked');
		html.style.scrollBehavior = htmlScrollBehavior;
	};
	const onResize = () => {
		cleanup();
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(lock);
	};
	lock();
	addEventListener('resize', onResize);
	return () => {
		cancelAnimationFrame(frame);
		cleanup();
		removeEventListener('resize', onResize);
	};
}
function lockNow(): void {
	if (locks === 0 || restore !== null) return;
	const overflowY = getComputedStyle(document.documentElement).overflowY;
	// The page already hid overflow on <html>: Base UI leaves it.
	if (overflowY === 'hidden' || overflowY === 'clip') {
		restore = () => {};
		return;
	}
	const ios = /^i(os$|p)/.test(navigator.platform.toLowerCase()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	const overlay = ios || !(innerWidth - document.documentElement.clientWidth > 0);
	restore = overlay ? preventScrollOverlayScrollbars() : preventScrollInsetScrollbars();
}
/** Locks page scroll as Base UI's modal popups do; returns the release. */
export function acquireScrollLock(): () => void {
	locks += 1;
	if (locks === 1 && restore === null) {
		clearTimeout(lockTimer);
		lockTimer = setTimeout(lockNow, 0);
	}
	let released = false;
	return () => {
		if (released) return;
		released = true;
		locks -= 1;
		if (locks === 0 && restore) {
			clearTimeout(unlockTimer);
			unlockTimer = setTimeout(() => {
				if (locks !== 0 || !restore) return;
				restore();
				restore = null;
			}, 0);
		}
	};
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const tabbablesIn = (root: Element) => [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert]') && !el.hasAttribute('data-base-ui-focus-guard') && el.getClientRects().length > 0);
// useTriggerFocusGuards: the first tabbable after the trigger that is not in the popup.
function tabbableAfter(trigger: HTMLElement, portal: HTMLElement): HTMLElement | undefined {
	return tabbablesIn(document.body).find((el) => !portal.contains(el) && !trigger.contains(el) && Boolean(trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
}

/** Mounts a trigger's captured portal; `popupSelector` picks the popup inside it. */
// pressable: data-pressed on the trigger while open (pressableTriggerOpenStateMapping); lockScroll: modal; tabOut: Tab leaves.
export function openPopup(trigger: HTMLElement, options: { readonly popupSelector: string; readonly positionMethod?: 'absolute' | 'fixed'; readonly sideOffset?: number; readonly onDismiss: (p: Popup, reason: Dismissal, event?: Event) => void; readonly outsidePress?: boolean; readonly anchored?: boolean; readonly key?: string; readonly anchor?: Element | { getBoundingClientRect(): DOMRect }; readonly anchorOf?: (popup: HTMLElement) => Element | null | undefined; readonly pressable?: boolean; readonly lockScroll?: boolean; readonly tabOut?: boolean; readonly portal?: HTMLElement; readonly shown?: boolean }): Popup | undefined {
	// A context menu's trigger area has no id: its layer key, and the point it opens at.
	const key = options.key || trigger.id;
	if (!key || isOpen(key)) return undefined;
	// `portal` with `shown`: a popup the page already shows open (open at load), taken as it is.
	const portal = options.portal ?? layersFor(key).find((n) => n.hasAttribute('data-base-ui-portal'));
	if (!portal) return undefined;
	const popup = portal.querySelector<HTMLElement>(options.popupSelector);
	if (!popup) return undefined;
	// Portal > Positioner > Popup (> List): the positioner is the portal's child holding the popup.
	let positioner: HTMLElement | null = popup;
	while (positioner && positioner.parentElement !== portal) positioner = positioner.parentElement;
	if (positioner === popup) positioner = null;
	const backdrop = portal.querySelector<HTMLElement>(':scope > [role="presentation"][data-base-ui-inert]');
	portal.hidden = false;
	if (backdrop) {
		backdrop.hidden = false;
		backdrop.removeAttribute('inert');
	}
	for (const el of portal.querySelectorAll<HTMLElement>('[hidden]')) if (el.contains(popup)) el.hidden = false;
	const around: HTMLElement[] = positioner ? [positioner] : [];
	for (let n = popup.parentElement; n && n !== positioner && n !== portal; n = n.parentElement) if (n.hasAttribute('data-open') || n.hasAttribute('data-closed')) around.push(n);
	const pressable = options.pressable ?? (options.anchored !== false && (popup.matches('[role="menu"], [role="listbox"], [role="dialog"], nav') || Boolean(popup.querySelector('[role="listbox"]'))));
	const p: Popup = { key, trigger, portal, positioner, popup, backdrop, around, pressable, openedAt: performance.now(), dismiss: (reason) => options.onDismiss(p, reason), cleanup: [] };
	// A dialog's or drawer's viewport fills the window: only a popup with a positioner is placed off its trigger.
	if (positioner && options.anchored !== false && positioner.getAttribute('data-side') !== 'none') {
		for (const prop of ['left', 'top', 'transform', 'height', 'max-height', 'margin-top', 'margin-bottom']) positioner.style.removeProperty(prop);
		const opts: BaseOptions = { side: popup.getAttribute('data-side') ?? 'bottom', align: popup.getAttribute('data-align') ?? positioner.getAttribute('data-align') ?? 'center', sideOffset: Number(popup.dataset.mmSideOffset ?? portal.dataset.mmSideOffset ?? options.sideOffset ?? 0), alignOffset: Number(popup.dataset.mmAlignOffset ?? portal.dataset.mmAlignOffset ?? 0), positionMethod: options.positionMethod ?? 'absolute' };
		// A Positioner given another anchor than its trigger (an element ref): the portal names that element.
		const named = portal.dataset.mmAnchor ? document.getElementById(portal.dataset.mmAnchor) : null;
		p.stop = place(options.anchor ?? options.anchorOf?.(popup) ?? named ?? trigger, positioner, popup, opts);
	}
	// activeIndex starts null: no item is highlighted as a list opens (one closed by its own part may keep the mark).
	for (const el of popup.querySelectorAll('[data-highlighted]')) el.removeAttribute('data-highlighted');
	// Menu, Select, Popover, Tooltip and Combobox popups start with transitions off; a Dialog's (not anchored) does not.
	if (!options.shown) enter(popup, around, options.anchored !== false);
	setTrigger(trigger, true, pressable);
	showCompanions(key, true);
	const stacked = (q: HTMLElement) => [...q.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
	p.lower = raiseOver(stacked(portal), open.flatMap((o) => stacked(o.portal)));
	open.push(p);
	if (options.lockScroll ?? popup.matches('[role="menu"]')) p.cleanup.push(acquireScrollLock());
	const onKey = (event: KeyboardEvent) => {
		if (top() !== p) return;
		if (event.key === 'Tab' && options.tabOut && popup.contains(document.activeElement)) {
			const inside = tabbablesIn(popup);
			if (!event.shiftKey && inside.length && document.activeElement !== inside[inside.length - 1]) return;
			event.preventDefault();
			if (event.shiftKey) {
				options.onDismiss(p, 'tab');
				trigger.focus({ preventScroll: true });
				return;
			}
			const next = tabbableAfter(trigger, portal);
			tabbedOut = p;
			try {
				options.onDismiss(p, 'tab');
			} finally {
				tabbedOut = undefined;
			}
			(next ?? trigger).focus();
			return;
		}
		if (event.key !== 'Escape') return;
		event.preventDefault();
		options.onDismiss(p, 'escape');
	};
	const onDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (!target || top() !== p || popup.contains(target) || trigger.contains(target)) return;
		pressedOutside = p;
		try {
			options.onDismiss(p, 'outside', event);
		} finally {
			pressedOutside = undefined;
		}
	};
	const timer = options.outsidePress === false ? undefined : setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
	document.addEventListener('keydown', onKey, true);
	p.cleanup.push(() => {
		clearTimeout(timer);
		document.removeEventListener('pointerdown', onDown, true);
		document.removeEventListener('keydown', onKey, true);
	});
	return p;
}

export function closePopup(p: Popup, returnFocus = true, keep = false, focus: FocusOptions = {}): void {
	const at = open.indexOf(p);
	if (at < 0) return;
	open.splice(at, 1);
	for (const c of p.cleanup) c();
	setTrigger(p.trigger, false, p.pressable);
	if (tabbedOut === p) returnFocus = false;
	// InternalBackdrop: inert once the popup closes, unmounted with it.
	p.backdrop?.setAttribute('inert', '');
	showCompanions(p.key, false);
	// FloatingFocusManager returns focus as the popup unmounts, after its exit; a Select's popup stays mounted.
	const refocus = () => {
		const at = document.activeElement;
		if (open.some((o) => o.portal === p.portal)) return;
		if (!at || at === document.body || p.portal.contains(at)) p.trigger.focus({ preventScroll: true });
	};
	if (returnFocus && keep) {
		p.trigger.focus({ preventScroll: true, ...focus });
		// The outside press's own mousedown then blurs to the body: focus comes back after it.
		if (pressedOutside === p) setTimeout(refocus);
	}
	exit(p.popup, p.around, () => {
		p.stop?.();
		// Opened again before this exit ended: it stays mounted, raised as it was.
		const again = open.find((o) => o.portal === p.portal);
		if (again) {
			again.lower ??= p.lower;
			return;
		}
		p.lower?.();
		if (returnFocus && !keep) refocus();
		// Base UI's Select keeps its popup mounted once opened, hidden; other popups leave, here hidden with their portal.
		if (keep) {
			(p.positioner ?? p.popup).hidden = true;
			if (p.backdrop) p.backdrop.hidden = true;
		} else p.portal.hidden = true;
	});
}

/** One list's useTypeahead session (floating-ui's, as Base UI ships it, reset after TYPEAHEAD_RESET_MS). */
export interface Typing {
	text: string;
	prev: number | null;
	match: number | null;
	typing: boolean;
	timer?: ReturnType<typeof setTimeout>;
}
export const newTyping = (): Typing => ({ text: '', prev: null, match: null, typing: false });
export function endTyping(t: Typing): void {
	clearTimeout(t.timer);
	Object.assign(t, newTyping());
}

// floating-ui's stopEvent: the key reaches no listener above the list (the site's document shortcuts).
const stopEvent = (event: Event) => {
	event.preventDefault();
	event.stopPropagation();
};

/** useTypeahead's keydown: the index typed to, or undefined. `skip`: items it passes over (hidden, or Select's disabled). */
export function typeahead(t: Typing, event: KeyboardEvent, items: readonly HTMLElement[], active: number, skip: (i: number) => boolean, open = true, selected: number | null = null): number | undefined {
	const labels = items.map((i) => i.textContent ?? '');
	const available = (i: number) => !skip(i);
	const matching = (text: string, start = 0) => {
		const lower = text.toLowerCase();
		for (let offset = 0; offset < labels.length; offset++) {
			const i = (((start % labels.length) + labels.length) % labels.length + offset) % labels.length;
			if (labels[i]!.toLowerCase().startsWith(lower) && available(i)) return i;
		}
		return -1;
	};
	if (t.text.length > 0 && event.key === ' ') {
		stopEvent(event);
		t.typing = true;
	}
	if (t.text.length > 0 && t.text[0] !== ' ' && matching(t.text) === -1 && event.key !== ' ') t.typing = false;
	if (!labels.length || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return undefined;
	if (open && event.key !== ' ') {
		stopEvent(event);
		t.typing = true;
	}
	const isNew = t.text === '';
	const current = selected ?? (active >= 0 ? active : -1);
	if (isNew) t.prev = current;
	const rapid = labels.every((text, i) => (text && available(i) ? text[0]?.toLowerCase() !== text[1]?.toLowerCase() : true));
	if (rapid && t.text === event.key) {
		t.text = '';
		t.prev = t.match;
	}
	t.text += event.key;
	clearTimeout(t.timer);
	t.timer = setTimeout(() => {
		t.text = '';
		t.prev = t.match;
		t.typing = false;
	}, 500);
	const index = matching(t.text, ((isNew ? current : t.prev) ?? 0) + 1);
	if (index !== -1) {
		t.match = index;
		return index;
	}
	if (event.key !== ' ') {
		t.text = '';
		t.typing = false;
	}
	return undefined;
}
