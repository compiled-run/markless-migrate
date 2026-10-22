// Radix RovingFocusGroup over a tablist: arrows (by orientation and direction), Home and End move focus between the
// enabled triggers, looping; the trigger focused activates itself (Radix Tabs' automatic activation). Focus only.
export function roving(event: KeyboardEvent): void {
	const tab = (event.target as Element | null)?.closest<HTMLElement>('[role="tab"]');
	const list = tab?.closest<HTMLElement>('[role="tablist"]');
	if (!tab || !list) return;
	const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter((t) => t.closest('[role="tablist"]') === list && !t.hasAttribute('disabled'));
	const vertical = list.getAttribute('aria-orientation') === 'vertical';
	const rtl = getComputedStyle(list).direction === 'rtl';
	const step = { ArrowRight: vertical ? 0 : rtl ? -1 : 1, ArrowLeft: vertical ? 0 : rtl ? 1 : -1, ArrowDown: vertical ? 1 : 0, ArrowUp: vertical ? -1 : 0 }[event.key];
	const at = tabs.indexOf(tab);
	const to = step ? tabs[(at + step + tabs.length) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : undefined;
	if (!to) return;
	event.preventDefault();
	to.focus();
}

/** The value of the enabled tab an event on a tab list happened on (Radix's `…-content-<value>` in aria-controls). */
export function tabValue(event: Event): string | undefined {
	const tab = (event.target as Element | null)?.closest('[role="tab"]');
	// The handler sits on the list the tab belongs to (Markless dispatches it for events inside that element).
	if (!tab || tab.hasAttribute('disabled') || tab.hasAttribute('data-disabled')) return undefined;
	return /-content-(.+)$/.exec(tab.getAttribute('aria-controls') ?? '')?.[1];
}

// RovingFocusGroup's own focus: Tab landing on the group (tabindex 0) moves on to its current item (the selected tab, the
// pressed or checked toggle, else the first enabled item); Shift+Tab from an item takes the group out of the tab order
// for that step, so focus leaves the group instead of landing on it.
const GROUP = '[role="tablist"][tabindex="0"], [role="group"][data-slot="toggle-group"][tabindex="0"], [role="radiogroup"][tabindex="0"]';
const ITEM = '[role="tab"], [role="radio"], button[aria-pressed], [data-slot="toggle-group-item"]';

export function focusin(target: Element, event: FocusEvent): boolean {
	if (!(target instanceof HTMLElement) || !target.matches(GROUP)) return false;
	const from = event.relatedTarget instanceof Node ? event.relatedTarget : null;
	if (from && target.contains(from)) return false;
	const items = [...target.querySelectorAll<HTMLElement>(ITEM)].filter((i) => !i.hasAttribute('disabled') && i.getAttribute('aria-disabled') !== 'true' && !i.hasAttribute('data-disabled'));
	const current = items.find((i) => i.getAttribute('aria-selected') === 'true' || i.getAttribute('aria-checked') === 'true' || i.getAttribute('data-state') === 'on' || i.getAttribute('aria-pressed') === 'true') ?? items[0];
	if (!current) return false;
	current.focus({ preventScroll: true });
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (event.key !== 'Tab' || !event.shiftKey) return false;
	const group = target.closest<HTMLElement>(GROUP);
	if (!group || group === target) return false;
	group.setAttribute('tabindex', '-1');
	setTimeout(() => group.setAttribute('tabindex', '0'));
	return false;
}
