import { layersFor } from '../reveal.ts';
import { closePopup, endTyping, newTyping, openPopup, popupOf, typeahead, type Popup, type Typing } from './popup.ts';
import { place } from './positioner.ts';

// Base UI Select with alignItemWithTrigger (data-side="none"): the listbox opens over the trigger with the selected
// option where the trigger's value is; arrows move data-highlighted; choosing an option marks it selected, writes its
// text into the trigger's value and closes. With alignment off it is placed below the trigger like a popover.
// Radix's trigger carries data-state; Base UI's never does (the converter renames generated ids, so they tell neither).
const TRIGGER = '[role="combobox"][data-slot="select-trigger"]:not([data-state])';
const OPTION = '[role="option"]';

const options = (p: Popup) => [...p.popup.querySelectorAll<HTMLElement>(OPTION)];
// isElementDisabled; a captured Base UI item carries data-disabled as well.
const enabled = (o: HTMLElement) => !o.hasAttribute('disabled') && o.getAttribute('aria-disabled') !== 'true' && !o.hasAttribute('data-disabled');
const enabledOptions = (p: Popup) => options(p).filter(enabled);
// A press focuses as a mouse does, without a focus ring (Base UI's trigger takes the mousedown's focus, the option a script's).
const quietly = { preventScroll: true, focusVisible: false } as FocusOptions;
function highlight(p: Popup, option: HTMLElement | undefined, keyboard = false): void {
	for (const o of options(p)) o.removeAttribute('data-highlighted');
	if (!option) return;
	option.setAttribute('data-highlighted', '');
	option.focus(keyboard ? { preventScroll: true } : quietly);
	if (keyboard) option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
	const chosen = options(p).find((o) => o.getAttribute('aria-selected') === 'true') ?? enabledOptions(p)[0];
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

function select(trigger: HTMLElement, root: ParentNode, option: HTMLElement): void {
	for (const o of root.querySelectorAll<HTMLElement>(OPTION)) {
		const on = o === option;
		o.setAttribute('aria-selected', String(on));
		if (on) o.setAttribute('data-selected', '');
		else o.removeAttribute('data-selected');
	}
	const label = ([...option.children].find((c) => c.tagName === 'DIV') ?? option).textContent ?? '';
	// The trigger's value is Markless state (convert's SelectPlan); its handler for this event sets it. Select.Value shows
	// the Root's items' label, which convert recorded where it is not the option's own text.
	trigger.dispatchEvent(new CustomEvent('mmchoose', { bubbles: true, detail: option.dataset.mmText ?? label }));
	selectedValue.set(trigger, label);
	const input = trigger.nextElementSibling;
	const value = option.dataset.mmValue;
	if (input instanceof HTMLInputElement && input.getAttribute('aria-hidden') === 'true' && value !== undefined) {
		input.value = value;
		input.setAttribute('value', value);
	}
}
// Its highlight goes with activeIndex, reset as the popup's exit completes.
function dismiss(p: Popup, focus?: FocusOptions): void {
	highlight(p, undefined);
	closePopup(p, true, true, focus);
}
function choose(p: Popup, option: HTMLElement, pressed = false): void {
	select(p.trigger, p.popup, option);
	dismiss(p, pressed ? quietly : undefined);
}

const popupFor = (trigger: HTMLElement) => [...document.querySelectorAll('[data-base-ui-portal]')].map((n) => popupOf(n)).find((x) => x?.trigger === trigger);
const typings = new WeakMap<HTMLElement, Typing>();
const typingOf = (trigger: HTMLElement) => typings.get(trigger) ?? typings.set(trigger, newTyping()).get(trigger)!;

// SelectIcon (aria-hidden, its default child ▼ kept beside a rendered svg) carries data-popup-open while the select is open.
const iconOf = (trigger: HTMLElement) => [...trigger.children].find((c) => c.getAttribute('aria-hidden') === 'true' && (c.textContent ?? '').includes('▼'));

function openSelect(trigger: HTMLElement, key?: string): boolean {
	const p = openPopup(trigger, { popupSelector: '[role="listbox"]', positionMethod: 'fixed', lockScroll: true, tabOut: true, onDismiss: (q) => dismiss(q) });
	if (!p) return false;
	const icon = iconOf(trigger);
	if (icon) {
		icon.setAttribute('data-popup-open', '');
		p.cleanup.push(() => icon.removeAttribute('data-popup-open'));
	}
	endTyping(typingOf(trigger));
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
	// useListNavigation: the selected item, else from ArrowUp the last enabled one, else the first.
	const list = options(p);
	const selected = list.find((o) => o.getAttribute('aria-selected') === 'true');
	highlight(p, selected ?? (key === 'ArrowUp' ? list.findLast(enabled) : undefined) ?? enabledOptions(p)[0], key !== undefined);
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || event.button !== 0) return false;
	const p = popupFor(trigger);
	event.preventDefault();
	if (p) dismiss(p);
	else {
		trigger.focus(quietly);
		openSelect(trigger);
	}
	return true;
}
export function click(target: Element): boolean {
	if (target.closest(TRIGGER)) return true;
	const option = target.closest<HTMLElement>(OPTION);
	const p = option && popupOf(option);
	if (!option || !p) return false;
	if (enabled(option)) choose(p, option, true);
	return true;
}
export function pointerover(target: Element): boolean {
	const option = target.closest<HTMLElement>(OPTION);
	const p = option && popupOf(option);
	if (!option || !p) return false;
	highlight(p, option);
	return true;
}
// SelectPopup: the focusable element between the positioner and the list (not a focus guard).
const popupElement = (p: Popup) => {
	for (let n = p.popup.parentElement; n && n !== p.positioner && n !== p.portal; n = n.parentElement) if (n.getAttribute('tabindex') === '-1') return n;
	return p.popup;
};
// The keys moved last (useListNavigation's isPointerModality false), until the pointer moves.
let keysMoved = false;
const keysMove = () => {
	if (!keysMoved) document.addEventListener('pointermove', () => (keysMoved = false), { once: true, capture: true });
	keysMoved = true;
};
// useListNavigation's onPointerLeave: the pointer leaving an option for no other unhighlights it and focuses SelectPopup.
export function pointerout(target: Element, event: PointerEvent): boolean {
	const option = target.closest<HTMLElement>(OPTION);
	const p = option && popupOf(option);
	if (!option || !p || !p.popup.matches('[role="listbox"]') || event.pointerType === 'touch' || keysMoved) return false;
	const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest(OPTION) : null;
	if ((to && p.popup.contains(to)) || !option.hasAttribute('data-highlighted')) return false;
	highlight(p, undefined);
	if (p.portal.contains(document.activeElement)) popupElement(p).focus({ preventScroll: true });
	return true;
}
export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger && !popupFor(trigger)) {
		if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key) && !(event.key === ' ' && typingOf(trigger).text)) {
			event.preventDefault();
			return openSelect(trigger, event.key);
		}
		// A closed select's typeahead chooses the matching option outright.
		if (event.key.length !== 1) return false;
		const portal = layersFor(trigger.id).find((n) => n.hasAttribute('data-base-ui-portal'));
		const list = portal ? [...portal.querySelectorAll<HTMLElement>(OPTION)] : [];
		const selected = list.findIndex((o) => o.getAttribute('aria-selected') === 'true');
		const typed = typeahead(typingOf(trigger), event, list, -1, (i) => !enabled(list[i]!), false, selected < 0 ? null : selected);
		if (typed === undefined || !portal) return false;
		select(trigger, portal, list[typed]!);
		return true;
	}
	const p = popupOf(target);
	if (!p || !p.popup.matches('[role="listbox"]')) return false;
	const list = options(p);
	const at = list.indexOf(target.closest<HTMLElement>(OPTION)!);
	const selected = list.findIndex((o) => o.getAttribute('aria-selected') === 'true');
	const typed = typeahead(typingOf(p.trigger), event, list, at, (i) => !enabled(list[i]!), true, selected < 0 ? null : selected);
	if (typed !== undefined) {
		highlight(p, list[typed], true);
		keysMove();
		return true;
	}
	if (event.defaultPrevented) return true;
	// Select's useListNavigation does not loop, and passes no disabledIndices: the arrows stop on disabled options too.
	const to = { ArrowDown: at < 0 ? list[0] : list[Math.min(list.length - 1, at + 1)], ArrowUp: at < 0 ? list[list.length - 1] : list[Math.max(0, at - 1)], Home: list[0], End: list[list.length - 1] }[event.key];
	if (to) {
		event.preventDefault();
		highlight(p, to, true);
		keysMove();
		return true;
	}
	if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
		event.preventDefault();
		if (enabled(list[at]!)) choose(p, list[at]!);
		return true;
	}
	return false;
}
