import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';

// Base UI Menu: a press on the trigger opens the menu (keyboard: Enter, Space, ArrowDown highlight the first item);
// arrows, Home, End move data-highlighted with focus; choosing an item or Escape closes it, focus back on the trigger.
const TRIGGER = '[aria-haspopup="menu"][data-base-ui-click-trigger], [aria-haspopup="menu"][id^="base-ui-"]';
const ITEM = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

const items = (p: Popup) => [...p.popup.querySelectorAll<HTMLElement>(ITEM)].filter((i) => !i.hasAttribute('data-disabled') && i.getAttribute('aria-disabled') !== 'true');
function highlight(p: Popup, item: HTMLElement | undefined): void {
	for (const i of items(p)) i.removeAttribute('data-highlighted');
	if (!item) return;
	item.setAttribute('data-highlighted', '');
	item.focus({ preventScroll: true });
}
function openMenu(trigger: HTMLElement, first: boolean): boolean {
	const p = openPopup(trigger, { popupSelector: '[role="menu"]', onDismiss: (x) => closePopup(x) });
	if (!p) return false;
	if (first) highlight(p, items(p)[0]);
	else p.popup.focus({ preventScroll: true });
	return true;
}
const popupFor = (trigger: HTMLElement) => [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || event.button !== 0) return false;
	const p = popupFor(trigger);
	if (p) closePopup(p);
	else openMenu(trigger, false);
	return true;
}
export function click(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const p = item && popupOf(item);
	if (!item || !p || item.hasAttribute('data-disabled')) return Boolean(target.closest(TRIGGER));
	closePopup(p);
	return true;
}
export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const p = item && popupOf(item);
	if (!item || !p) return false;
	highlight(p, item);
	return true;
}
export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger && ['Enter', ' ', 'ArrowDown'].includes(event.key) && !popupFor(trigger)) {
		event.preventDefault();
		return openMenu(trigger, true);
	}
	const p = popupOf(target);
	if (!p || !p.popup.matches('[role="menu"]')) return false;
	const list = items(p);
	const at = list.indexOf(target.closest<HTMLElement>(ITEM)!);
	const to = { ArrowDown: list[Math.min(list.length - 1, at + 1)] ?? list[0], ArrowUp: at <= 0 ? list[0] : list[at - 1], Home: list[0], End: list[list.length - 1] }[event.key];
	if (to) {
		event.preventDefault();
		highlight(p, to);
		return true;
	}
	if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
		event.preventDefault();
		list[at]!.click();
		return true;
	}
	return false;
}
