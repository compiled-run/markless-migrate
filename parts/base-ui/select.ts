import { closePopup, openPopup, popupOf, type Popup } from './popup.ts';
import { place } from './positioner.ts';

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

// SelectPopup's alignItemWithTrigger: the selected item's text is laid over the trigger's value, the positioner given
// the height left beneath the trigger and 10 px margins; near a viewport edge it falls back to placing below the trigger.
function alignOver(trigger: HTMLElement, p: Popup): boolean {
	const positioner = p.positioner;
	if (!positioner || positioner.getAttribute('data-side') !== 'none') return true;
	// The popup is the positioner's child; the listbox inside it is what scrolls.
	const popup = (positioner.firstElementChild as HTMLElement | null) ?? p.popup;
	positioner.style.position = 'fixed';
	for (const prop of ['transform', 'top', 'bottom', 'left', 'height', 'max-height']) positioner.style.removeProperty(prop);
	const triggerRect = trigger.getBoundingClientRect();
	positioner.style.left = `${triggerRect.left}px`;
	positioner.style.top = `${triggerRect.top}px`;
	positioner.style.setProperty('--anchor-width', `${triggerRect.width}px`);
	positioner.style.setProperty('--anchor-height', `${triggerRect.height}px`);
	const positionerRect = positioner.getBoundingClientRect();
	const chosen = options(p).find((o) => o.getAttribute('aria-selected') === 'true') ?? options(p)[0];
	// Select.ItemText renders a plain <div> (the indicator a <span>): the option's own div child.
	const text = (chosen && [...chosen.children].find((c): c is HTMLElement => c.tagName === 'DIV')) ?? chosen;
	const value = trigger.querySelector<HTMLElement>('[data-slot="select-value"]');
	const ps = getComputedStyle(positioner);
	const marginTop = parseFloat(ps.marginTop) || 10;
	const marginBottom = parseFloat(ps.marginBottom) || 10;
	const minHeight = parseFloat(ps.minHeight) || 100;
	const viewportHeight = document.documentElement.clientHeight - marginTop - marginBottom;
	const viewportWidth = document.documentElement.clientWidth;
	const availableBeneath = viewportHeight - triggerRect.bottom + triggerRect.height;
	const rtl = getComputedStyle(trigger).direction === 'rtl';
	let alignedLeft = rtl ? triggerRect.right - positionerRect.width : triggerRect.left;
	let offsetY = 0;
	let textRect: DOMRect | undefined;
	if (text && value) {
		const valueRect = value.getBoundingClientRect();
		textRect = text.getBoundingClientRect();
		alignedLeft = positionerRect.left + (rtl ? valueRect.right - textRect.right : valueRect.left - textRect.left);
		offsetY = textRect.top - positionerRect.top + textRect.height / 2 - (valueRect.top - triggerRect.top + valueRect.height / 2);
	}
	const borderBottom = parseFloat(getComputedStyle(popup).borderBottomWidth) || 0;
	const idealHeight = availableBeneath + offsetY + marginBottom + borderBottom;
	let height = Math.min(viewportHeight, idealHeight);
	const maxHeight = viewportHeight - marginTop - marginBottom;
	const scrollTop = idealHeight - height;
	positioner.style.left = `${Math.min(Math.max(alignedLeft, 5), viewportWidth - 5 - positionerRect.width)}px`;
	positioner.style.height = `${height}px`;
	positioner.style.maxHeight = 'none';
	positioner.style.marginTop = `${marginTop}px`;
	positioner.style.marginBottom = `${marginBottom}px`;
	popup.style.height = '100%';
	const scroller = p.popup;
	const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
	const isTop = scrollTop >= maxScrollTop - 1;
	if (isTop) height = Math.min(viewportHeight, positionerRect.height) - (scrollTop - maxScrollTop);
	if (triggerRect.top < 20 || triggerRect.bottom > viewportHeight - 20 || Math.ceil(height) + 1 < Math.min(scroller.scrollHeight, minHeight)) return false;
	if (isTop) {
		positioner.style.top = positionerRect.height >= maxHeight ? '0' : `${Math.max(0, viewportHeight - idealHeight)}px`;
		positioner.style.height = `${height}px`;
		scroller.scrollTop = maxScrollTop;
	} else {
		positioner.style.removeProperty('top');
		positioner.style.bottom = '0';
		scroller.scrollTop = scrollTop;
	}
	if (textRect) {
		const y = positionerRect.height > 0 ? ((textRect.top + textRect.height / 2 - positionerRect.top) / positionerRect.height) * 100 : 50;
		popup.style.setProperty('--transform-origin', `50% ${Math.min(100, Math.max(0, y))}%`);
	}
	return true;
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
	closePopup(p, true, true);
}

const popupFor = (trigger: HTMLElement) => [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);

function openSelect(trigger: HTMLElement): boolean {
	const p = openPopup(trigger, { popupSelector: '[role="listbox"]', positionMethod: 'fixed', onDismiss: (x) => closePopup(x, true, true) });
	if (!p) return false;
	const label = selectedValue.get(trigger);
	if (label !== undefined) for (const o of p.popup.querySelectorAll<HTMLElement>(OPTION)) {
		const on = (o.textContent ?? '').trim() === label.trim();
		o.setAttribute('aria-selected', String(on));
		if (on) o.setAttribute('data-selected', '');
		else o.removeAttribute('data-selected');
	}
	if (!alignOver(trigger, p) && p.positioner) {
		for (const prop of ['top', 'bottom', 'left', 'height', 'max-height', 'margin-top', 'margin-bottom']) p.positioner.style.removeProperty(prop);
		(p.positioner.firstElementChild as HTMLElement | null)?.style.removeProperty('height');
		p.stop = place(trigger, p.positioner, p.popup, { side: 'bottom', align: 'start', sideOffset: 0, alignOffset: 0, positionMethod: 'fixed' });
	}
	highlight(p, options(p).find((o) => o.getAttribute('aria-selected') === 'true') ?? options(p)[0]);
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || event.button !== 0) return false;
	const p = popupFor(trigger);
	event.preventDefault();
	if (p) closePopup(p, true, true);
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
