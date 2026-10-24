import { focusItem, itemsOf, navigate, typeahead, typing } from './collection.ts';
import { holdPressed, setModality } from './interactions.ts';
import { closeOverlay, openOverlay, overlayFor, overlayOf, type Overlay } from './overlay.ts';

// React Aria's Select (useSelect, useMenuTrigger with type listbox, useListBox with shouldFocusOnHover and
// shouldSelectOnPressUp): a mouse press on the trigger opens the listbox with focus on the selected option or the
// listbox; Enter, Space and ArrowDown open it on the selected or first option, ArrowUp on the last; ArrowLeft/Right and
// typing choose without opening. In the listbox, hovering an option focuses it, releasing a press on one chooses it,
// arrows, Home/End, PageUp/PageDown and typeahead move focus, Enter and Space choose; choosing closes it.
// A ComboBox's button opens a listbox too; it sits in a group with the combobox's input.
const TRIGGER = 'button[data-rac][aria-haspopup="listbox"]:not([role="group"]:has(input[role="combobox"]) *)';
const LISTBOX = '[role="listbox"]';

const listboxOf = (o: Overlay) => o.content.querySelector<HTMLElement>(LISTBOX);
const selected = (listbox: Element) => itemsOf(listbox).find((el) => el.getAttribute('aria-selected') === 'true');
// The options a closed trigger's typeahead and arrows choose among: its captured listbox, hidden until opened.
const closedListbox = (trigger: HTMLElement) => document.querySelector<HTMLElement>(`[data-mm-layer="${CSS.escape(trigger.id)}"] ${LISTBOX}`);

function choose(trigger: HTMLElement, listbox: Element, option: HTMLElement): void {
	for (const el of itemsOf(listbox, true)) {
		const on = el === option;
		el.setAttribute('aria-selected', String(on));
		if (on) el.setAttribute('data-selected', 'true');
		else el.removeAttribute('data-selected');
		for (const icon of el.querySelectorAll('[data-mm-indicator]')) icon.toggleAttribute('hidden', !on);
	}
	const value = trigger.querySelector<HTMLElement>('[data-slot="select-value"]');
	value?.removeAttribute('data-placeholder');
	const native = trigger.parentElement?.querySelector<HTMLSelectElement>('[data-testid="hidden-select-container"] select');
	const key = option.getAttribute('data-key');
	if (native && key !== null) native.value = key;
	// The trigger's value is Markless state (convert's SelectPlan); its handler for this event sets it.
	trigger.dispatchEvent(new CustomEvent('mmchoose', { detail: (option.firstElementChild ?? option).textContent ?? '', bubbles: true }));
}

// The Select itself is marked open (data-open) while its listbox is, and focused (useSelectState's isFocused) though
// focus is in the listbox.
const rootOf = (trigger: Element) => (trigger.parentElement?.hasAttribute('data-rac') ? trigger.parentElement : null);

function close(o: Overlay, keepFocus = false): void {
	holdPressed(o.trigger, false);
	rootOf(o.trigger)?.removeAttribute('data-open');
	rootOf(o.trigger)?.removeAttribute('data-focused');
	closeOverlay(o, keepFocus);
}

function openSelect(trigger: HTMLElement, strategy: 'first' | 'last' | null): boolean {
	if (trigger.hasAttribute('disabled') || trigger.hasAttribute('data-disabled')) return false;
	const o = openOverlay(trigger, trigger.id, { modal: true, placement: 'bottom start', offset: 8, onDismiss: (x) => close(x), onReady: (x) => ready(x, strategy) });
	if (!o) return false;
	holdPressed(trigger, true);
	rootOf(trigger)?.setAttribute('data-open', 'true');
	rootOf(trigger)?.setAttribute('data-focused', 'true');
	return true;
}

// Focus goes to the selected option, else the first or last for the keys that ask for one, else the listbox itself.
function ready(o: Overlay, strategy: 'first' | 'last' | null): void {
	const listbox = listboxOf(o);
	if (!listbox) return;
	const list = itemsOf(listbox);
	const target = selected(listbox) ?? (strategy === 'first' ? list[0] : strategy === 'last' ? list[list.length - 1] : undefined);
	if (target) focusItem(listbox, target);
	else listbox.focus({ preventScroll: true });
	const onUp = (event: PointerEvent) => {
		const option = (event.target as Element | null)?.closest?.<HTMLElement>('[role="option"]');
		if (!option || !listbox.contains(option) || option.getAttribute('aria-disabled') === 'true') return;
		choose(o.trigger, listbox, option);
		close(o);
	};
	document.addEventListener('pointerup', onUp, true);
	o.cleanup.push(() => document.removeEventListener('pointerup', onUp, true));
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || event.button !== 0 || event.pointerType === 'touch') return false;
	event.preventDefault();
	const o = overlayFor(trigger);
	if (o) close(o);
	else openSelect(trigger, null);
	return true;
}

export function click(target: Element, event: MouseEvent): boolean {
	// An option clicked by script (a searchable select's Enter on its virtually focused option).
	const option = target.closest<HTMLElement>('[role="option"]');
	const open = option && overlayOf(option);
	if (option && open?.trigger.matches(TRIGGER) && option.getAttribute('aria-disabled') !== 'true') {
		const listbox = listboxOf(open);
		if (listbox) {
			choose(open.trigger, listbox, option);
			close(open);
		}
		return true;
	}
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger) return false;
	if ((event as PointerEvent).pointerType === 'touch') {
		const o = overlayFor(trigger);
		if (o) close(o);
		else openSelect(trigger, null);
	}
	return true;
}

export function pointerover(target: Element): boolean {
	const option = target.closest<HTMLElement>('[role="option"]');
	const o = option && overlayOf(option);
	if (!option || !o || !o.trigger.matches(TRIGGER) || option.getAttribute('aria-disabled') === 'true') return false;
	const listbox = listboxOf(o);
	if (listbox && document.activeElement !== option) focusItem(listbox, option);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (trigger && !overlayFor(trigger)) {
		if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			setModality('keyboard');
			return openSelect(trigger, event.key === 'ArrowUp' ? 'last' : 'first');
		}
		const listbox = closedListbox(trigger);
		if (!listbox) return false;
		const list = itemsOf(listbox);
		const current = selected(listbox);
		const to = event.key === 'ArrowLeft' ? (current ? list[list.indexOf(current) - 1] : list[0]) : event.key === 'ArrowRight' ? (current ? list[list.indexOf(current) + 1] : list[0]) : event.ctrlKey || event.metaKey || event.altKey ? undefined : typeahead(listbox, event.key, current);
		if (!to) return false;
		event.preventDefault();
		choose(trigger, listbox, to);
		return true;
	}
	const o = overlayOf(target);
	if (!o || !o.trigger.matches(TRIGGER)) return false;
	const listbox = listboxOf(o);
	if (!listbox || !listbox.contains(target)) return false;
	const option = target.closest<HTMLElement>('[role="option"]') ?? undefined;
	if (event.key === 'Tab') {
		event.preventDefault();
		return true;
	}
	const to = navigate(listbox, event, option);
	if (to) {
		event.preventDefault();
		focusItem(listbox, to);
		return true;
	}
	if ((event.key === 'Enter' || (event.key === ' ' && !typing(listbox))) && option) {
		event.preventDefault();
		choose(o.trigger, listbox, option);
		close(o);
		return true;
	}
	if (!event.ctrlKey && !event.metaKey && !event.altKey) {
		const found = typeahead(listbox, event.key, option);
		if (found) {
			event.preventDefault();
			focusItem(listbox, found);
			return true;
		}
	}
	return false;
}
