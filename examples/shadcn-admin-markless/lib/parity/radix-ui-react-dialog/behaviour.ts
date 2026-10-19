// Parity port of @radix-ui/react-dialog and -alert-dialog (shadcn's dialog.tsx, sheet.tsx, alert-dialog.tsx): the DOM
// half. The page renders the overlay and content once, shown by its own `open` cell, and calls these from the handlers
// that write that cell. What Radix does that the routes rely on: the rest of the page is hidden from assistive
// technology and takes no pointer input, focus moves into the content (an alert dialog's Cancel button, otherwise the
// first tabbable element), Tab stays inside, Escape (and, except for an alert dialog, a press outside) dismisses it,
// and closing sends focus back to what had it before.
import { hideOthers, showOthers } from '../radix-ui-react-dropdown-menu/behaviour.ts';

type Open = { readonly content: HTMLElement; readonly restore: HTMLElement | null; readonly cleanup: () => void };

const stack: Open[] = [];
const exiting = new Map<HTMLElement, () => void>();
let ids = 0;

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function tabbables(root: HTMLElement): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
}

function overlayOf(content: HTMLElement): HTMLElement | null {
	const prev = content.previousElementSibling;
	return prev instanceof HTMLElement && /-overlay$/.test(prev.dataset.slot ?? '') ? prev : null;
}

export interface OpenDialogOptions {
	/** Called when Escape or a press outside dismisses the dialog: the page writes its `open` cell back to false and calls closeDialog. */
	readonly onDismiss: () => void;
	/** An alert dialog ignores presses outside it. */
	readonly alert?: boolean;
	/** What takes focus (an element, or a selector inside the content); by default an alert dialog's `[data-slot=alert-dialog-cancel]`, else the first tabbable element. */
	readonly focus?: HTMLElement | string | null;
}

const resolve = (content: HTMLElement | string | undefined): HTMLElement | undefined => (typeof content === 'string' ? (document.getElementById(content) ?? undefined) : content);

/** Shows the dialog modally (the content element, or its id). Call from the handler that sets the page's `open` cell. */
export function openDialog(target: HTMLElement | string | undefined, options: OpenDialogOptions): void {
	const content = resolve(target);
	exiting.get(content!)?.();
	if (!content || stack.some((d) => d.content === content)) return;
	const key = `dialog-${++ids}`;
	const restore = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
	const overlay = overlayOf(content);
	content.hidden = false;
	content.dataset.state = 'open';
	if (overlay) {
		overlay.hidden = false;
		overlay.dataset.state = 'open';
	}
	hideOthers(key, content);
	// Radix portals a select or menu opened from the dialog after it opens, so those stay visible to assistive technology.
	for (const el of [overlay, ...document.querySelectorAll<HTMLElement>('[data-radix-popper-content-wrapper][data-aria-hidden]')]) {
		el?.removeAttribute('aria-hidden');
		el?.removeAttribute('data-aria-hidden');
	}
	document.body.style.pointerEvents = 'none';
	document.body.setAttribute('data-scroll-locked', '1');
	content.style.pointerEvents = 'auto';
	const onKey = (event: KeyboardEvent) => {
		if (stack[stack.length - 1]?.content !== content) return;
		if (event.target instanceof Element && event.target.closest('[data-radix-popper-content-wrapper]')) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			options.onDismiss();
			return;
		}
		if (event.key !== 'Tab') return;
		const list = tabbables(content);
		if (!list.length) {
			event.preventDefault();
			return;
		}
		const first = list[0];
		const last = list[list.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && (active === first || !content.contains(active))) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (active === last || !content.contains(active))) {
			event.preventDefault();
			first.focus();
		}
	};
	const onPointer = (event: PointerEvent) => {
		if (options.alert || stack[stack.length - 1]?.content !== content) return;
		const target = event.target;
		if (target instanceof Node && content.contains(target)) return;
		// A press inside a menu or popover opened from the dialog belongs to it.
		if (target instanceof Element && target.closest('[data-radix-popper-content-wrapper]')) return;
		options.onDismiss();
	};
	document.addEventListener('keydown', onKey, true);
	document.addEventListener('pointerdown', onPointer, true);
	stack.push({
		content,
		restore,
		cleanup: () => {
			document.removeEventListener('keydown', onKey, true);
			document.removeEventListener('pointerdown', onPointer, true);
			showOthers(key);
		},
	});
	const chosen = typeof options.focus === 'string' ? content.querySelector<HTMLElement>(options.focus) : options.focus;
	const first = chosen ?? (options.alert ? content.querySelector<HTMLElement>('[data-slot=alert-dialog-cancel]') : null) ?? tabbables(content)[0] ?? content;
	first.focus();
}

/** Hides the dialog, gives the page back its pointer and sends focus back. Call from the handler that clears the page's `open` cell. */
export function closeDialog(target: HTMLElement | string | undefined, refocus = true): void {
	const content = resolve(target);
	const at = stack.findIndex((d) => d.content === content);
	if (!content || at < 0) return;
	const [entry] = stack.splice(at, 1);
	content.dataset.state = 'closed';
	const overlay = overlayOf(content);
	if (overlay) overlay.dataset.state = 'closed';
	const unmount = () => {
		exiting.delete(content);
		content.removeEventListener('animationend', ended);
		entry.cleanup();
		content.hidden = true;
		if (overlay) overlay.hidden = true;
		if (!stack.length) {
			document.body.style.pointerEvents = '';
			document.body.removeAttribute('data-scroll-locked');
		}
		if (refocus) entry.restore?.focus();
	};
	// Radix Presence keeps the dialog mounted, and the page hidden behind it, until its exit animation ends.
	const ended = (event: AnimationEvent) => {
		if (event.target === content) unmount();
	};
	if (getComputedStyle(content).animationName !== 'none') {
		exiting.set(content, unmount);
		content.addEventListener('animationend', ended);
	} else unmount();
}
