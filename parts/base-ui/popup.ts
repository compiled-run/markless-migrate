import { templatesFor } from '../reveal.ts';
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
	stop?: () => void;
	cleanup: (() => void)[];
}

const open: Popup[] = [];
export const popupOf = (el: Element) => open.find((p) => p.portal.contains(el));
export const top = () => open[open.length - 1];
export const isOpen = (key: string) => open.some((p) => p.key === key);

export function setTrigger(trigger: HTMLElement, on: boolean): void {
	trigger.setAttribute('aria-expanded', String(on));
	if (on) trigger.setAttribute('data-popup-open', '');
	else trigger.removeAttribute('data-popup-open');
}

/** Mounts a trigger's captured portal; `popupSelector` picks the popup inside it. */
export function openPopup(trigger: HTMLElement, options: { readonly popupSelector: string; readonly positionMethod?: 'absolute' | 'fixed'; readonly sideOffset?: number; readonly onDismiss: (p: Popup) => void }): Popup | undefined {
	const key = trigger.id;
	if (!key || isOpen(key)) return undefined;
	const template = templatesFor(key).find((t) => t.dataset.mmInto === 'body');
	if (!template) return undefined;
	const portal = [...template.content.cloneNode(true).childNodes].find((n): n is HTMLElement => n instanceof HTMLElement && n.hasAttribute('data-base-ui-portal'));
	if (!portal) return undefined;
	const popup = portal.querySelector<HTMLElement>(options.popupSelector);
	if (!popup) return undefined;
	const positioner = popup.parentElement !== portal ? (popup.parentElement as HTMLElement) : null;
	const backdrop = portal.querySelector<HTMLElement>(':scope > [role="presentation"][data-base-ui-inert]');
	document.body.appendChild(portal);
	const p: Popup = { key, trigger, portal, positioner, popup, backdrop, cleanup: [] };
	if (positioner) {
		for (const prop of ['left', 'top', 'transform', 'height', 'max-height', 'margin-top', 'margin-bottom']) positioner.style.removeProperty(prop);
		const opts: BaseOptions = { side: popup.getAttribute('data-side') ?? 'bottom', align: popup.getAttribute('data-align') ?? 'center', sideOffset: Number(template.dataset.mmSideOffset ?? options.sideOffset ?? 0), alignOffset: Number(template.dataset.mmAlignOffset ?? 0), positionMethod: options.positionMethod ?? 'absolute' };
		p.stop = place(trigger, positioner, popup, opts);
	}
	enter(popup, [positioner]);
	setTrigger(trigger, true);
	open.push(p);
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Escape' || top() !== p) return;
		event.preventDefault();
		options.onDismiss(p);
	};
	const onDown = (event: PointerEvent) => {
		const target = event.target as Node | null;
		if (!target || top() !== p || popup.contains(target) || trigger.contains(target)) return;
		options.onDismiss(p);
	};
	const timer = setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
	document.addEventListener('keydown', onKey, true);
	p.cleanup.push(() => {
		clearTimeout(timer);
		document.removeEventListener('pointerdown', onDown, true);
		document.removeEventListener('keydown', onKey, true);
	});
	return p;
}

export function closePopup(p: Popup, returnFocus = true): void {
	const at = open.indexOf(p);
	if (at < 0) return;
	open.splice(at, 1);
	for (const c of p.cleanup) c();
	setTrigger(p.trigger, false);
	if (returnFocus) p.trigger.focus({ preventScroll: true });
	exit(p.popup, [p.positioner], () => {
		p.stop?.();
		p.portal.remove();
	});
}
