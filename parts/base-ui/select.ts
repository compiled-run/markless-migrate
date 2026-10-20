import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';

// Base UI Select with alignItemWithTrigger (data-side="none"): the listbox opens over the trigger with the selected
// option where the trigger's value is; arrows move data-highlighted; choosing an option marks it selected, writes its
// text into the trigger's value and closes. With alignment off it is placed below the trigger like a popover.
const TRIGGER = '[role="combobox"][data-slot="select-trigger"][id^="base-ui-"]';
const OPTION = '[role="option"]';

const options = (p: Popup) => [...p.popup.querySelectorAll<HTMLElement>(OPTION)].filter((o) => !o.hasAttribute('data-disabled'));
function highlight(p: Popup, option: HTMLElement | undefined): void {
	for (const o of options(p)) o.removeAttribute('data-highlighted');
	if (!option) return;
	option.setAttribute('data-highlighted', '');
	option.focus({ preventScroll: true });
}
const selectedValue = new WeakMap<HTMLElement, string>();

function alignOver(trigger: HTMLElement, p: Popup): void {
	const positioner = p.positioner;
	if (!positioner || p.popup.getAttribute('data-side') !== 'none') return;
	p.stop?.();
	const rect = trigger.getBoundingClientRect();
	const chosen = options(p).find((o) => o.getAttribute('aria-selected') === 'true') ?? options(p)[0];
	positioner.style.position = 'fixed';
	positioner.style.transform = '';
	positioner.style.opacity = '';
	positioner.style.left = `${rect.left}px`;
	positioner.style.setProperty('--anchor-width', `${rect.width}px`);
	positioner.style.setProperty('--anchor-height', `${rect.height}px`);
	const offset = chosen ? chosen.offsetTop : 0;
	const top = Math.max(10, rect.top - offset);
	positioner.style.top = `${top}px`;
	positioner.style.setProperty('--transform-origin', `${rect.width / 2}px ${rect.top - top + rect.height / 2}px`);
}

function choose(p: Popup, option: HTMLElement): void {
	for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) {
		const on = o === option;
		o.setAttribute('aria-selected', String(on));
		if (on) o.setAttribute('data-selected', '');
		else o.removeAttribute('data-selected');
	}
	const label = option.querySelector('[data-slot="select-item-text"]')?.textContent ?? option.textContent ?? '';
	const value = p.trigger.querySelector('[data-slot="select-value"]');
	if (value) value.textContent = label;
	selectedValue.set(p.trigger, label);
	closePopup(p);
}

const popupFor = (trigger: HTMLElement) => [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);

function openSelect(trigger: HTMLElement): boolean {
	const p = openPopup(trigger, { popupSelector: '[role="listbox"]', positionMethod: 'fixed', onDismiss: (x) => closePopup(x) });
	if (!p) return false;
	const label = selectedValue.get(trigger);
	if (label !== undefined) for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) {
		const on = (o.textContent ?? '').trim() === label.trim();
		o.setAttribute('aria-selected', String(on));
		if (on) o.setAttribute('data-selected', '');
		else o.removeAttribute('data-selected');
	}
	alignOver(trigger, p);
	highlight(p, options(p).find((o) => o.getAttribute('aria-selected') === 'true') ?? options(p)[0]);
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || event.button !== 0) return false;
	const p = popupFor(trigger);
	if (p) closePopup(p);
	else openSelect(trigger);
	return true;
}
export function click(target: Element): boolean {
	if (target.closest(TRIGGER)) return true;
	const option = target.closest<HTMLElement>(OPTION);
	const p = option && popupOf(option);
	if (!option || !p) return false;
	choose(p, option);
	return true;
}
export function pointerover(target: Element): boolean {
	const option = target.closest<HTMLElement>(OPTION);
	const p = option && popupOf(option);
	if (!option || !p) return false;
	highlight(p, option);
	return true;
}
export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key) && !popupFor(trigger)) {
		event.preventDefault();
		return openSelect(trigger);
	}
	const p = popupOf(target);
	if (!p || !p.popup.matches('[role="listbox"]')) return false;
	const list = options(p);
	const at = list.indexOf(target.closest<HTMLElement>(OPTION)!);
	const to = { ArrowDown: list[Math.min(list.length - 1, at + 1)], ArrowUp: list[Math.max(0, at - 1)], Home: list[0], End: list[list.length - 1] }[event.key];
	if (to) {
		event.preventDefault();
		highlight(p, to);
		return true;
	}
	if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
		event.preventDefault();
		choose(p, list[at]!);
		return true;
	}
	return false;
}
