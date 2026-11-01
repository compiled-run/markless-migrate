// @qwik-ui/headless Modal (modal/*): the trigger (aria-haspopup="dialog") toggles its dialog, which opens with
// showModal(), locks the page's scroll as @fluejs/noscroll does (an attribute on <body>, its stylesheet, the scrollbar's
// width kept as padding) and keeps Tab inside it (focus-trap, Escape left to the dialog). Escape closes it; a press on the
// backdrop (the dialog element itself, outside its box) closes it unless it is an alert dialog or its Root has
// closeOnBackdropClick false (data-mm-backdrop-close, from the modal's context in the page's paused state). Closing marks
// it data-closing and modal-closing, waits for its animation (else its transition) to end, then closes it.
// A close control has no marker in Qwik UI's markup: convert marks the buttons that closed the dialog on the old page
// (data-mm-close).
const DIALOG = 'dialog[id$="-root"]';
const TRIGGER = 'button[aria-haspopup="dialog"]';
const SCROLL_DISABLED = 'data-noscroll-target-scroll-disabled';
const ADJUSTED = 'data-noscroll-target-scroll-scrollbar-width-adjustment';

const dialogOfTrigger = (trigger: Element) => trigger.parentElement?.querySelector<HTMLDialogElement>(`:scope > ${DIALOG}`) ?? null;
const triggerOfDialog = (dialog: Element) => dialog.parentElement?.querySelector<HTMLElement>(`:scope > ${TRIGGER}`) ?? null;
const openDialogs: HTMLDialogElement[] = [];
// focus-trap's returnFocusOnDeactivate: what had focus when the dialog opened gets it back once it has closed.
const returnTo = new WeakMap<HTMLDialogElement, HTMLElement>();
// @fluejs/noscroll counts per modal: one that locked the page and has not restored it does not lock (or measure) again.
const locking = new Set<HTMLDialogElement>();
// closeModal's end listeners, which outlive a close the browser already made and close the dialog after its next open.
const ending = new Map<HTMLDialogElement, (readonly [string, EventListener])[]>();
const loadedKeydowns = new Set<string>();

function lockStyles(): void {
	if (document.head.querySelector('style[data-noscroll-global-styles]')) return;
	const style = document.createElement('style');
	style.setAttribute('data-noscroll-global-styles', '');
	style.append(document.createTextNode(`[${SCROLL_DISABLED}]{overflow:hidden!important}[${SCROLL_DISABLED}][${ADJUSTED}]{padding-right:calc(var(--noscroll-target-padding-right) + var(--noscroll-target-scrollbar-width))!important}`));
	document.head.appendChild(style);
}

function lock(on: boolean): void {
	const body = document.body;
	if (on) {
		lockStyles();
		// noscroll measures the scrollbar with the page's lock lifted.
		body.removeAttribute(SCROLL_DISABLED);
		body.style.setProperty('--noscroll-target-scrollbar-width', `${window.innerWidth - document.documentElement.clientWidth}px`);
		body.style.setProperty('--noscroll-target-padding-right', getComputedStyle(body).paddingRight);
		body.setAttribute(ADJUSTED, '');
		body.setAttribute(SCROLL_DISABLED, '');
	} else {
		body.removeAttribute(SCROLL_DISABLED);
		body.removeAttribute(ADJUSTED);
		body.style.removeProperty('--noscroll-target-scrollbar-width');
		body.style.removeProperty('--noscroll-target-padding-right');
	}
}

function markState(dialog: HTMLDialogElement, on: boolean): void {
	dialog.setAttribute('data-state', on ? 'open' : 'closed');
	for (const el of [dialog, triggerOfDialog(dialog)]) {
		el?.toggleAttribute('data-open', on);
		el?.toggleAttribute('data-closed', !on);
	}
	triggerOfDialog(dialog)?.setAttribute('aria-expanded', String(on));
}

/** Whether the modal's `show` signal is on: the dialog itself can be closed while it is (see close). */
export const isShown = (dialog: HTMLDialogElement): boolean => dialog.getAttribute('data-state') === 'open';

/** Opens a Qwik UI modal as its trigger does; the site's own controls bound to its `show` signal call it too. */
export function show(dialog: HTMLDialogElement): void {
	if (isShown(dialog)) return;
	const before = document.activeElement;
	if (before instanceof HTMLElement && before !== document.body) returnTo.set(dialog, before);
	markState(dialog, true);
	if (!dialog.open) dialog.showModal();
	if (!locking.has(dialog)) {
		locking.add(dialog);
		lock(true);
	}
	if (!openDialogs.includes(dialog)) openDialogs.push(dialog);
	const auto = dialog.querySelector<HTMLElement>('[autofocus]');
	(auto ?? focusables(dialog)[0])?.focus();
}

function release(dialog: HTMLDialogElement): void {
	const at = openDialogs.indexOf(dialog);
	if (at < 0) return;
	openDialogs.splice(at, 1);
	// modal-panel.tsx: only a root modal restores page scroll; one nested in another's Root (level > 1) leaves it locked.
	if (Number(dialog.dataset.mmLevel) > 1) return;
	locking.delete(dialog);
	if (!openDialogs.length) lock(false);
}

/**
 * Closes a Qwik UI modal as its `show` signal turning off does (supportClosingAnimation): it closes once its animation (else
 * transition) ends, and when the browser closed it already, that listener closes it at the end of its next opening.
 */
export function close(dialog: HTMLDialogElement): void {
	if (!isShown(dialog)) return;
	markState(dialog, false);
	dialog.setAttribute('data-closing', '');
	dialog.classList.add('modal-closing');
	const s = getComputedStyle(dialog);
	const animation = parseFloat(s.animationDuration) > 0;
	const transition = !animation && parseFloat(s.transitionDuration) > 0;
	const wasOpen = dialog.open;
	if (!wasOpen) release(dialog);
	const finish = () => {
		dialog.removeAttribute('data-closing');
		dialog.classList.remove('modal-closing');
		const closing = dialog.open;
		dialog.close();
		if (isShown(dialog) || !closing || !wasOpen) return;
		release(dialog);
		const back = returnTo.get(dialog);
		// After the pointer's own default focus, which a press on the backdrop that closed the dialog still runs.
		if (back) setTimeout(() => back.isConnected && !dialog.open && back.focus());
	};
	if (!animation && !transition) return finish();
	const type = animation ? 'animationend' : 'transitionend';
	const done = (event: Event) => {
		if (event.target !== dialog) return;
		dialog.removeEventListener(type, done);
		ending.set(dialog, (ending.get(dialog) ?? []).filter(([, l]) => l !== done));
		finish();
	};
	dialog.addEventListener(type, done);
	ending.set(dialog, [...(ending.get(dialog) ?? []), [type, done]]);
}

/** What a page load starts afresh: every modal closed with nothing pending, the page unlocked, no handler loaded. */
export function pageLoaded(): void {
	for (const [dialog, listeners] of ending) for (const [type, listener] of listeners) dialog.removeEventListener(type, listener);
	ending.clear();
	loadedKeydowns.clear();
	for (const dialog of document.querySelectorAll<HTMLDialogElement>(DIALOG)) {
		if (dialog.open) continue;
		dialog.removeAttribute('data-closing');
		dialog.classList.remove('modal-closing');
		if (isShown(dialog)) markState(dialog, false);
		const at = openDialogs.indexOf(dialog);
		if (at >= 0) openDialogs.splice(at, 1);
		locking.delete(dialog);
	}
	if (!openDialogs.length) lock(false);
}

// qwikloader awaits each element's handlers on the way up: past a keydown handler whose code has not loaded yet, the
// dialog's preventDefault of Escape comes too late and the browser closes it (data-mm-lazy-keydown: a library's handler).
const lazyKeydowns = (el: Element): string[] => [...(el.getAttribute('data-mm-qwik') ?? '').split(' ').filter((h) => h.startsWith('keydown:')), ...(el.hasAttribute('data-mm-lazy-keydown') ? [`keydown:${el.getAttribute('data-mm-lazy-keydown')}`] : [])];
function firstLoad(target: Element, dialog: HTMLDialogElement): boolean {
	let first = false;
	for (let el: Element | null = target; el && el !== dialog; el = el.parentElement) {
		for (const handler of lazyKeydowns(el)) {
			if (loadedKeydowns.has(handler)) continue;
			loadedKeydowns.add(handler);
			first = true;
		}
	}
	return first;
}

const focusables = (root: Element) => [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary')].filter((el) => el.offsetParent !== null || el === document.activeElement);

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	const dialog = trigger ? dialogOfTrigger(trigger) : null;
	if (trigger && dialog) {
		if (isShown(dialog)) close(dialog);
		else show(dialog);
		return true;
	}
	const closer = target.closest<HTMLElement>('[data-mm-close]');
	const owner = closer?.closest<HTMLDialogElement>(DIALOG);
	if (closer && owner) {
		close(owner);
		return true;
	}
	return false;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	if (!(target instanceof HTMLDialogElement) || !target.matches(DIALOG) || !target.open) return false;
	event.stopPropagation();
	const r = target.getBoundingClientRect();
	const out = event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
	if (out && event.pointerId !== -1 && target.getAttribute('role') !== 'alertdialog' && target.dataset.mmBackdropClose !== 'false') close(target);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const dialog = target.closest<HTMLDialogElement>(DIALOG);
	if (!dialog?.open) return false;
	const late = firstLoad(target, dialog);
	if (event.key === 'Escape') {
		event.stopPropagation();
		if (late) dialog.addEventListener('close', () => close(dialog), { once: true });
		else {
			event.preventDefault();
			close(dialog);
		}
		return true;
	}
	if ((event.key === ' ' || event.key === 'Enter') && target === dialog) {
		event.preventDefault();
		return true;
	}
	if (event.key !== 'Tab') return false;
	const list = focusables(dialog);
	if (!list.length) return false;
	const at = list.indexOf(document.activeElement as HTMLElement);
	if (event.shiftKey && at <= 0) {
		event.preventDefault();
		list.at(-1)!.focus();
	} else if (!event.shiftKey && at === list.length - 1) {
		event.preventDefault();
		list[0]!.focus();
	} else return false;
	return true;
}
