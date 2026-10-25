import { layersFor, showCompanions } from '../reveal.ts';
import { place, type BaseOptions } from './positioner.ts';
import { enter, exit } from './transition.ts';

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
	stop?: () => void;
	cleanup: (() => void)[];
}

const open: Popup[] = [];
let pressedOutside: Popup | undefined;
export const popupOf = (el: Element) => open.find((p) => p.portal.contains(el));
export const top = () => open[open.length - 1];
export const isOpen = (key: string) => open.some((p) => p.key === key);

export function setTrigger(trigger: HTMLElement, on: boolean): void {
	// A plain button a page opens a popup from carries no ARIA for it.
	if (!trigger.hasAttribute('aria-haspopup') && !trigger.hasAttribute('data-base-ui-click-trigger') && trigger.hasAttribute('data-mm-key')) return;
	trigger.setAttribute('aria-expanded', String(on));
	if (on) trigger.setAttribute('data-popup-open', '');
	else trigger.removeAttribute('data-popup-open');
}

/** Mounts a trigger's captured portal; `popupSelector` picks the popup inside it. */
export function openPopup(trigger: HTMLElement, options: { readonly popupSelector: string; readonly positionMethod?: 'absolute' | 'fixed'; readonly sideOffset?: number; readonly onDismiss: (p: Popup) => void; readonly outsidePress?: boolean; readonly anchored?: boolean; readonly key?: string; readonly anchor?: Element | { getBoundingClientRect(): DOMRect } }): Popup | undefined {
	// A context menu's trigger area has no id: its layer key, and the point it opens at.
	const key = options.key || trigger.id;
	if (!key || isOpen(key)) return undefined;
	const portal = layersFor(key).find((n) => n.hasAttribute('data-base-ui-portal'));
	if (!portal) return undefined;
	const popup = portal.querySelector<HTMLElement>(options.popupSelector);
	if (!popup) return undefined;
	// Portal > Positioner > Popup (> List): the positioner is the portal's child holding the popup.
	let positioner: HTMLElement | null = popup;
	while (positioner && positioner.parentElement !== portal) positioner = positioner.parentElement;
	if (positioner === popup) positioner = null;
	const backdrop = portal.querySelector<HTMLElement>(':scope > [role="presentation"][data-base-ui-inert]');
	portal.hidden = false;
	for (const el of portal.querySelectorAll<HTMLElement>('[hidden]')) if (el.contains(popup)) el.hidden = false;
	const around: HTMLElement[] = positioner ? [positioner] : [];
	for (let n = popup.parentElement; n && n !== positioner && n !== portal; n = n.parentElement) if (n.hasAttribute('data-open') || n.hasAttribute('data-closed')) around.push(n);
	const p: Popup = { key, trigger, portal, positioner, popup, backdrop, around, cleanup: [] };
	// A dialog's or drawer's viewport fills the window: only a popup with a positioner is placed off its trigger.
	if (positioner && options.anchored !== false && positioner.getAttribute('data-side') !== 'none') {
		for (const prop of ['left', 'top', 'transform', 'height', 'max-height', 'margin-top', 'margin-bottom']) positioner.style.removeProperty(prop);
		const opts: BaseOptions = { side: popup.getAttribute('data-side') ?? 'bottom', align: popup.getAttribute('data-align') ?? 'center', sideOffset: Number(portal.dataset.mmSideOffset ?? options.sideOffset ?? 0), alignOffset: Number(portal.dataset.mmAlignOffset ?? 0), positionMethod: options.positionMethod ?? 'absolute' };
		p.stop = place(options.anchor ?? trigger, positioner, popup, opts);
	}
	enter(popup, around);
	setTrigger(trigger, true);
	showCompanions(key, true);
	open.push(p);
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Escape' || top() !== p) return;
		event.preventDefault();
		options.onDismiss(p);
	};
	const onDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (!target || top() !== p || popup.contains(target) || trigger.contains(target)) return;
		pressedOutside = p;
		try {
			options.onDismiss(p);
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

export function closePopup(p: Popup, returnFocus = true, keep = false): void {
	const at = open.indexOf(p);
	if (at < 0) return;
	open.splice(at, 1);
	for (const c of p.cleanup) c();
	setTrigger(p.trigger, false);
	showCompanions(p.key, false);
	// FloatingFocusManager returns focus as the popup unmounts, after its exit; a Select's popup stays mounted.
	const refocus = () => {
		const at = document.activeElement;
		if (open.some((o) => o.portal === p.portal)) return;
		if (!at || at === document.body || p.portal.contains(at)) p.trigger.focus({ preventScroll: true });
	};
	if (returnFocus && keep) {
		p.trigger.focus({ preventScroll: true });
		// The outside press's own mousedown then blurs to the body: focus comes back after it.
		if (pressedOutside === p) setTimeout(refocus);
	}
	exit(p.popup, p.around, () => {
		p.stop?.();
		if (returnFocus && !keep) refocus();
		// Base UI's Select keeps its popup mounted once opened, hidden; other popups leave, here hidden with their portal.
		if (keep) (p.positioner ?? p.popup).hidden = true;
		else p.portal.hidden = true;
	});
}
