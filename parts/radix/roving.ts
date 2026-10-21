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
