// The DOM half of the Markless port of @radix-ui/react-dialog 1.1.15: what Radix's Presence, DismissableLayer,
// FocusScope, FocusGuards, aria-hidden and react-remove-scroll do to the page, keyed off the `data-state` the
// Markless parts render. Each element follows only its own `data-state` and its own animation events.

interface Presence {
	present: boolean;
	state: 'mounted' | 'unmountSuspended' | 'unmounted';
	prevAnimationName: string;
}

interface Dialog {
	readonly triggers: readonly HTMLElement[];
	readonly overlay: HTMLElement | undefined;
	readonly content: HTMLElement;
	/** An alert dialog's Cancel: it takes the opening focus, and a press outside does not close the dialog. */
	readonly cancel: HTMLElement | undefined;
	readonly alert: boolean;
	/** Controls written with `autofocus`, which React's autoFocus focuses as the dialog mounts. */
	readonly autofocus: readonly HTMLElement[];
	contentCleanup?: () => void;
	overlayCleanup?: () => void;
	untrap?: () => void;
}

// Radix's own popper wrapper: a menu, select or popover is a layer above the dialog it opens from.
const POPPER = '[data-radix-popper-content-wrapper]';

const dialogs = new WeakMap<HTMLElement, Dialog>();
const presences = new WeakMap<HTMLElement, Presence>();

/** Wires a dialog's elements once; every later open and close is read off their `data-state`. */
export function installDialog(triggers: readonly HTMLElement[] | undefined, overlay: HTMLElement | undefined, content: HTMLElement | undefined, cancel: HTMLElement | undefined, alert: boolean): void {
	if (!content || dialogs.has(content)) return;
	// React renders no autofocus attribute; it focuses the control when it mounts, so the attribute leaves the page here.
	const autofocus = [...content.querySelectorAll<HTMLElement>('[autofocus]')];
	for (const el of autofocus) el.removeAttribute('autofocus');
	// Markless spreads every prop onto a dynamic tag, so AlertDialogDescription's asChild lands on its element.
	for (const el of content.querySelectorAll('[aschild]')) el.removeAttribute('aschild');
	const dialog: Dialog = { triggers: triggers ?? [], overlay, content, cancel, alert, autofocus };
	dialogs.set(content, dialog);
	if (overlay) watchPresence(overlay, () => mountOverlay(dialog), () => unmountOverlay(dialog));
	watchPresence(content, () => mountContent(dialog), () => unmountContent(dialog), (open) => setTrapped(dialog, open));
}

function animationName(el: HTMLElement): string {
	return getComputedStyle(el).animationName || 'none';
}

// Radix Presence: an element leaving stays shown while an exit animation it did not have before runs, and is hidden when
// that animation of its own ends or is cancelled.
function watchPresence(el: HTMLElement, onMount: () => void, onUnmount: () => void, onPresentChange?: (open: boolean) => void): void {
	const present = el.getAttribute('data-state') === 'open';
	const p: Presence = { present, state: present ? 'mounted' : 'unmounted', prevAnimationName: 'none' };
	presences.set(el, p);
	const send = (event: 'MOUNT' | 'UNMOUNT' | 'ANIMATION_OUT' | 'ANIMATION_END') => {
		const next = transition(p.state, event);
		if (next === p.state) return;
		const was = p.state;
		p.state = next;
		p.prevAnimationName = next === 'mounted' ? animationName(el) : 'none';
		if (next === 'unmounted') {
			el.hidden = true;
			onUnmount();
			// Radix unmounts the part: its pointer-events style goes with it, so a closed part carries none.
			el.style.removeProperty('pointer-events');
			if (!el.style.length) el.removeAttribute('style');
		} else if (was === 'unmounted') {
			forgetMarks(el);
			portal(el);
			el.hidden = false;
			p.prevAnimationName = animationName(el);
			onMount();
		}
	};
	const update = () => {
		const now = el.getAttribute('data-state') === 'open';
		if (now === p.present) return;
		const wasPresent = p.present;
		p.present = now;
		onPresentChange?.(now);
		if (now) {
			send('MOUNT');
			return;
		}
		const current = animationName(el);
		if (current === 'none' || getComputedStyle(el).display === 'none') send('UNMOUNT');
		else if (wasPresent && p.prevAnimationName !== current) send('ANIMATION_OUT');
		else send('UNMOUNT');
	};
	const ended = (event: AnimationEvent) => {
		if (event.target !== el || !animationName(el).includes(CSS.escape(event.animationName))) return;
		send('ANIMATION_END');
	};
	el.addEventListener('animationstart', (event) => {
		if (event.target === el) p.prevAnimationName = animationName(el);
	});
	el.addEventListener('animationend', ended);
	el.addEventListener('animationcancel', ended);
	new MutationObserver(update).observe(el, { attributes: true, attributeFilter: ['data-state'] });
	if (present) {
		portal(el);
		el.hidden = false;
		p.prevAnimationName = animationName(el);
		onMount();
	}
}

// Radix's Portal appends each part to the body as it mounts. Here it moves to the end of the Markless container it is
// rendered in instead, the last place inside the root the runtime delegates events from, so the parts still answer.
// The attribute and the page-end comment are the served markup's own (@markless/web owns both).
const CONTAINER = '[data-async-container]';
const PAGE_END = 'markless:page-end';

function portal(el: HTMLElement): void {
	const host = el.parentElement?.closest(CONTAINER);
	if (!host) return;
	let end: ChildNode | null = null;
	for (let node = host.lastChild; node; node = node.previousSibling) {
		if (node.nodeType === Node.COMMENT_NODE && (node as Comment).data === PAGE_END) {
			end = node;
			break;
		}
	}
	if (el.nextSibling === end && el.parentNode === host) return;
	// Moving a node blurs whatever inside it had focus; it keeps it, as it would have in Radix's portal.
	const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
	// A part mounting while a dialog is up lands after the focus guard Radix put at the end of the body.
	const guard = guardCount > 0 ? document.querySelectorAll('[data-radix-focus-guard]')[1] : undefined;
	if (guard && !host.contains(guard)) host.insertBefore(guard, end);
	host.insertBefore(el, end);
	focused?.focus({ preventScroll: true });
}

function transition(state: Presence['state'], event: 'MOUNT' | 'UNMOUNT' | 'ANIMATION_OUT' | 'ANIMATION_END'): Presence['state'] {
	if (state === 'mounted') return event === 'UNMOUNT' ? 'unmounted' : event === 'ANIMATION_OUT' ? 'unmountSuspended' : state;
	if (state === 'unmountSuspended') return event === 'MOUNT' ? 'mounted' : event === 'ANIMATION_END' ? 'unmounted' : state;
	return event === 'MOUNT' ? 'mounted' : state;
}

// DismissableLayer: the stack of mounted layers, the highest answers Escape, and while any is mounted the body takes no
// pointer input.
const layers: HTMLElement[] = [];
let originalBodyPointerEvents = '';

// Every layer below the highest one takes no pointer input, as DismissableLayer's style on it says.
function restyleLayers(): void {
	for (const [i, layer] of layers.entries()) layer.style.pointerEvents = i === layers.length - 1 ? 'auto' : 'none';
}

// FocusScope's stack: the newest scope traps and loops, the ones under it are paused until it leaves.
const scopes: Dialog[] = [];
const paused = new WeakSet<Dialog>();

function addScope(dialog: Dialog): void {
	const top = scopes[0];
	if (top && top !== dialog) paused.add(top);
	const at = scopes.indexOf(dialog);
	if (at >= 0) scopes.splice(at, 1);
	scopes.unshift(dialog);
}

function removeScope(dialog: Dialog): void {
	const at = scopes.indexOf(dialog);
	if (at >= 0) scopes.splice(at, 1);
	if (scopes[0]) paused.delete(scopes[0]);
}

// FocusGuards: one pair of focusable spans at the edges of the body while any dialog is mounted.
let guardCount = 0;

function createGuard(): HTMLSpanElement {
	const span = document.createElement('span');
	span.setAttribute('data-radix-focus-guard', '');
	span.tabIndex = 0;
	span.style.outline = 'none';
	span.style.opacity = '0';
	span.style.position = 'fixed';
	span.style.pointerEvents = 'none';
	return span;
}

function addGuards(): () => void {
	const edges = document.querySelectorAll('[data-radix-focus-guard]');
	document.body.insertAdjacentElement('afterbegin', edges[0] ?? createGuard());
	document.body.insertAdjacentElement('beforeend', edges[1] ?? createGuard());
	guardCount++;
	return () => {
		if (guardCount === 1) document.querySelectorAll('[data-radix-focus-guard]').forEach((node) => node.remove());
		guardCount--;
	};
}

// aria-hidden's hideOthers: every element beside the chain from the body down to the content is marked hidden from
// assistive technology, except live regions and scripts; counts make nested dialogs undo in any order.
const hiddenCount = new WeakMap<Element, number>();
const markerCount = new WeakMap<Element, number>();
const alreadyHidden = new WeakSet<Element>();

// Radix mounts a fresh node each time, so a part shown again carries none of the marks its last showing collected.
function forgetMarks(el: Element): void {
	if (!hiddenCount.get(el)) return;
	if (!alreadyHidden.has(el)) el.removeAttribute('aria-hidden');
	el.removeAttribute('data-aria-hidden');
	hiddenCount.delete(el);
	markerCount.delete(el);
	alreadyHidden.delete(el);
}

function hideOthers(target: HTMLElement): () => void {
	const body = target.ownerDocument.body;
	// A menu or select open beside the dialog is mounted beside it under Radix, so it is left unmarked like the dialog;
	// a live region a page keeps hidden announces nothing, so it holds nothing open around it.
	const shown = (el: Element) => !el.closest('[hidden]');
	const keep = new Set<Element>([target, ...[...body.querySelectorAll('[aria-live]')].filter(shown), ...body.querySelectorAll('script'), ...[...body.querySelectorAll(POPPER)].filter(shown)]);
	const chain = new Set<Element>();
	for (const el of keep) for (let node: Element | null = el; node && !chain.has(node); node = node.parentElement) chain.add(node);
	const hidden: Element[] = [];
	const walk = (parent: Element) => {
		if (keep.has(parent) && parent !== body) return;
		for (const node of parent.children) {
			// What is not shown yet is not in the page under Radix (it mounts later), so nothing marks it.
			if (node.hasAttribute('hidden')) continue;
			if (chain.has(node)) {
				walk(node);
				continue;
			}
			const attr = node.getAttribute('aria-hidden');
			const was = attr !== null && attr !== 'false';
			const count = (hiddenCount.get(node) ?? 0) + 1;
			const marker = (markerCount.get(node) ?? 0) + 1;
			hiddenCount.set(node, count);
			markerCount.set(node, marker);
			hidden.push(node);
			if (count === 1 && was) alreadyHidden.add(node);
			if (marker === 1) node.setAttribute('data-aria-hidden', 'true');
			if (!was) node.setAttribute('aria-hidden', 'true');
		}
	};
	walk(body);
	return () => {
		for (const node of hidden) {
			if (!hiddenCount.has(node)) continue;
			const count = (hiddenCount.get(node) ?? 1) - 1;
			const marker = (markerCount.get(node) ?? 1) - 1;
			hiddenCount.set(node, count);
			markerCount.set(node, marker);
			if (!count) {
				if (!alreadyHidden.has(node)) node.removeAttribute('aria-hidden');
				alreadyHidden.delete(node);
			}
			if (!marker) node.removeAttribute('data-aria-hidden');
		}
	};
}

// FocusScope's candidate walk and edge search.
function tabbables(container: HTMLElement): HTMLElement[] {
	const nodes: HTMLElement[] = [];
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
		acceptNode: (node) => {
			const el = node as HTMLElement & { disabled?: boolean; type?: string };
			const isHiddenInput = el.tagName === 'INPUT' && el.type === 'hidden';
			if (el.disabled || el.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
			return el.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		},
	});
	while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);
	return nodes;
}

function isHidden(node: HTMLElement, upTo: HTMLElement): boolean {
	if (getComputedStyle(node).visibility === 'hidden') return true;
	for (let el: HTMLElement | null = node; el; el = el.parentElement) {
		if (el === upTo) return false;
		if (getComputedStyle(el).display === 'none') return true;
	}
	return false;
}

function edges(container: HTMLElement): [HTMLElement | undefined, HTMLElement | undefined] {
	const list = tabbables(container);
	return [list.find((el) => !isHidden(el, container)), [...list].reverse().find((el) => !isHidden(el, container))];
}

function focus(el: Element | null | undefined, select = false): void {
	if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;
	const before = document.activeElement;
	el.focus({ preventScroll: true });
	if (select && el !== before && el instanceof HTMLInputElement && 'select' in el) el.select();
}

function focusFirst(candidates: HTMLElement[]): void {
	const before = document.activeElement;
	for (const candidate of candidates) {
		focus(candidate, true);
		if (document.activeElement !== before) return;
	}
}

function setTrapped(dialog: Dialog, open: boolean): void {
	dialog.untrap?.();
	dialog.untrap = undefined;
	if (!open || !isMounted(dialog.content)) return;
	trap(dialog);
}

const isMounted = (el: HTMLElement) => presences.get(el)?.state !== 'unmounted';
const lastFocused = new WeakMap<HTMLElement, HTMLElement | null>();

function trap(dialog: Dialog): void {
	const container = dialog.content;
	const onFocusIn = (event: FocusEvent) => {
		if (paused.has(dialog)) return;
		const target = event.target as HTMLElement | null;
		if (isInnerLayer(target)) return;
		if (target && container.contains(target)) lastFocused.set(container, target);
		else focus(lastFocused.get(container), true);
	};
	const onFocusOut = (event: FocusEvent) => {
		if (paused.has(dialog)) return;
		const related = event.relatedTarget as HTMLElement | null;
		if (related === null || isInnerLayer(related)) return;
		if (!container.contains(related)) focus(lastFocused.get(container), true);
	};
	const observer = new MutationObserver((mutations) => {
		if (document.activeElement !== document.body) return;
		for (const mutation of mutations) if (mutation.removedNodes.length > 0) focus(container);
	});
	document.addEventListener('focusin', onFocusIn);
	document.addEventListener('focusout', onFocusOut);
	observer.observe(container, { childList: true, subtree: true });
	dialog.untrap = () => {
		document.removeEventListener('focusin', onFocusIn);
		document.removeEventListener('focusout', onFocusOut);
		observer.disconnect();
	};
}

// A menu, select or popover opened from the dialog sits outside it in the page; presses, focus and Escape there are its.
const isInnerLayer = (node: EventTarget | null) => node instanceof Element && node.closest(POPPER) !== null;
const innerLayerShown = () => [...document.querySelectorAll<HTMLElement>(POPPER)].some((el) => !el.hidden && !el.closest('[hidden]'));

function dismiss(content: HTMLElement): void {
	content.dispatchEvent(new CustomEvent('radixdismiss', { bubbles: false }));
}

function mountContent(dialog: Dialog): void {
	const { content } = dialog;
	const onLoopKey = (event: KeyboardEvent) => {
		if (paused.has(dialog)) return;
		const isTab = event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;
		const focused = document.activeElement;
		if (!isTab || !focused) return;
		const [first, last] = edges(content);
		if (!first || !last) {
			if (focused === content) event.preventDefault();
		} else if (!event.shiftKey && focused === last) {
			event.preventDefault();
			focus(first, true);
		} else if (event.shiftKey && focused === first) {
			event.preventDefault();
			focus(last, true);
		}
	};
	content.addEventListener('keydown', onLoopKey);
	// DismissableLayer
	if (layers.length === 0) {
		originalBodyPointerEvents = document.body.style.pointerEvents;
		document.body.style.pointerEvents = 'none';
	}
	layers.push(content);
	restyleLayers();
	const onEscape = (event: KeyboardEvent) => {
		if (event.key !== 'Escape' || layers[layers.length - 1] !== content || isInnerLayer(event.target) || innerLayerShown()) return;
		event.preventDefault();
		dismiss(content);
	};
	document.addEventListener('keydown', onEscape, { capture: true });
	let onClick: (() => void) | undefined;
	const onPointerDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (!target || content.contains(target) || isInnerLayer(target)) {
			if (onClick) document.removeEventListener('click', onClick);
			return;
		}
		const outside = () => {
			if (layers.indexOf(content) !== layers.length - 1 || innerLayerShown()) return;
			const isRightClick = event.button === 2 || (event.button === 0 && event.ctrlKey);
			if (isRightClick || dialog.alert) return;
			dismiss(content);
		};
		if (event.pointerType === 'touch') {
			if (onClick) document.removeEventListener('click', onClick);
			onClick = outside;
			document.addEventListener('click', onClick, { once: true });
		} else outside();
	};
	const timer = window.setTimeout(() => document.addEventListener('pointerdown', onPointerDown), 0);
	for (const el of dialog.autofocus) {
		// React's control is new on every opening, its caret after the value it was given.
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
			try {
				el.setSelectionRange(el.value.length, el.value.length);
			} catch {}
		}
		el.focus();
	}
	// FocusScope: trap now, autofocus on mount
	trap(dialog);
	addScope(dialog);
	const before = document.activeElement;
	if (!content.contains(before)) {
		if (dialog.alert) dialog.cancel?.focus({ preventScroll: true });
		else {
			focusFirst(tabbables(content).filter((el) => el.tagName !== 'A'));
			if (document.activeElement === before) focus(content);
		}
	}
	// FocusGuards, then aria-hidden, in the order Radix's effects run.
	const removeGuards = addGuards();
	let showOthers = hideOthers(content);
	// Radix mounts a menu or select opened from the dialog after the page was hidden, beside the dialog; one written in
	// the page instead is shown in place, so the page is hidden again around it each time one shows or hides.
	const poppers = new MutationObserver((records) => {
		const changed = records.flatMap((r) => (r.target instanceof HTMLElement && r.target.matches(POPPER) ? [r.target] : []));
		if (!changed.length) return;
		// Mounted after the dialog, Radix's popper portal is above it; one shown now goes after it the same way.
		for (const el of changed) if (!el.hidden && el.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING) portal(el);
		showOthers();
		showOthers = hideOthers(content);
	});
	poppers.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
	dialog.contentCleanup = () => {
		poppers.disconnect();
		content.removeEventListener('keydown', onLoopKey);
		document.removeEventListener('keydown', onEscape, { capture: true });
		window.clearTimeout(timer);
		document.removeEventListener('pointerdown', onPointerDown);
		if (onClick) document.removeEventListener('click', onClick);
		showOthers();
		removeGuards();
		if (layers.length === 1 && layers[0] === content) document.body.style.pointerEvents = originalBodyPointerEvents;
		layers.splice(layers.indexOf(content), 1);
		restyleLayers();
		content.style.pointerEvents = 'auto';
		dialog.untrap?.();
		dialog.untrap = undefined;
		setTimeout(() => {
			dialog.triggers.find((el) => el.isConnected)?.focus();
			removeScope(dialog);
		}, 0);
	};
}

function unmountContent(dialog: Dialog): void {
	dialog.contentCleanup?.();
	dialog.contentCleanup = undefined;
}

// react-remove-scroll, as Radix's overlay mounts it: the body's scroll bar is removed with its width kept as margin, and
// wheel and touch scrolling outside the content is cancelled.
let scrollLocks = 0;
let scrollStyle: HTMLStyleElement | null = null;

function scrollBarStyle(): string {
	const cs = getComputedStyle(document.body);
	const parse = (x: string) => parseInt(x || '', 10) || 0;
	const [left, top, right] = [parse(cs.marginLeft), parse(cs.marginTop), parse(cs.marginRight)];
	const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth + right - left);
	const important = '!important';
	return `\n  .with-scroll-bars-hidden {\n   overflow: hidden ${important};\n   padding-right: ${gap}px ${important};\n  }\n  body[data-scroll-locked] {\n    overflow: hidden ${important};\n    overscroll-behavior: contain;\n    position: relative ${important};\n    padding-left: ${left}px;\n    padding-top: ${top}px;\n    padding-right: ${right}px;\n    margin-left:0;\n    margin-top:0;\n    margin-right: ${gap}px ${important};\n    \n  }\n  \n  .right-scroll-bar-position {\n    right: ${gap}px ${important};\n  }\n  \n  .width-before-scroll-bar {\n    margin-right: ${gap}px ${important};\n  }\n  \n  .right-scroll-bar-position .right-scroll-bar-position {\n    right: 0 ${important};\n  }\n  \n  .width-before-scroll-bar .width-before-scroll-bar {\n    margin-right: 0 ${important};\n  }\n  \n  body[data-scroll-locked] {\n    --removed-body-scroll-bar-size: ${gap}px;\n  }\n`;
}

function canScroll(el: Element, vertical: boolean, delta: number): boolean {
	const cs = getComputedStyle(el);
	const overflow = vertical ? cs.overflowY : cs.overflowX;
	if (overflow !== 'auto' && overflow !== 'scroll') return false;
	const position = vertical ? el.scrollTop : el.scrollLeft;
	const size = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
	return delta > 0 ? position < size - 1 : position > 0;
}

function mountOverlay(dialog: Dialog): void {
	dialog.overlay?.style.setProperty('pointer-events', 'auto');
	if (scrollLocks === 0 && !scrollStyle) {
		scrollStyle = document.createElement('style');
		scrollStyle.type = 'text/css';
		scrollStyle.appendChild(document.createTextNode(scrollBarStyle()));
		document.head.appendChild(scrollStyle);
	}
	scrollLocks++;
	const counter = parseInt(document.body.getAttribute('data-scroll-locked') || '0', 10);
	document.body.setAttribute('data-scroll-locked', String((isFinite(counter) ? counter : 0) + 1));
	let touchY = 0;
	let touchX = 0;
	const shouldCancel = (event: WheelEvent | TouchEvent, dx: number, dy: number) => {
		const target = event.target as Element | null;
		if (!target || !dialog.content.contains(target)) return true;
		const vertical = Math.abs(dy) >= Math.abs(dx);
		for (let el: Element | null = target; el; el = el.parentElement) {
			if (canScroll(el, vertical, vertical ? dy : dx)) return false;
			if (el === dialog.content) break;
		}
		return true;
	};
	const onWheel = (event: WheelEvent) => {
		if (event.ctrlKey) return;
		if (shouldCancel(event, event.deltaX, event.deltaY) && event.cancelable) event.preventDefault();
	};
	const onTouchStart = (event: TouchEvent) => {
		touchX = event.changedTouches[0]?.clientX ?? 0;
		touchY = event.changedTouches[0]?.clientY ?? 0;
	};
	const onTouchMove = (event: TouchEvent) => {
		if (event.touches.length === 2) return;
		const t = event.changedTouches[0];
		if (shouldCancel(event, touchX - (t?.clientX ?? 0), touchY - (t?.clientY ?? 0)) && event.cancelable) event.preventDefault();
	};
	const options: AddEventListenerOptions = { passive: false };
	document.addEventListener('wheel', onWheel, options);
	document.addEventListener('touchmove', onTouchMove, options);
	document.addEventListener('touchstart', onTouchStart, options);
	dialog.overlayCleanup = () => {
		document.removeEventListener('wheel', onWheel);
		document.removeEventListener('touchmove', onTouchMove);
		document.removeEventListener('touchstart', onTouchStart);
		const next = parseInt(document.body.getAttribute('data-scroll-locked') || '0', 10) - 1;
		if (next <= 0) document.body.removeAttribute('data-scroll-locked');
		else document.body.setAttribute('data-scroll-locked', String(next));
		scrollLocks--;
		if (scrollLocks === 0 && scrollStyle) {
			scrollStyle.remove();
			scrollStyle = null;
		}
	};
}

function unmountOverlay(dialog: Dialog): void {
	dialog.overlayCleanup?.();
	dialog.overlayCleanup = undefined;
}
