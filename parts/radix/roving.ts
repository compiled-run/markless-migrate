// Radix RovingFocusGroup over a tablist: arrows (by orientation and direction), Home and End move focus between the
// enabled triggers, looping; the trigger focused activates itself (Radix Tabs' automatic activation). Focus only.
export function roving(event: KeyboardEvent): void {
	const tab = (event.target as Element | null)?.closest<HTMLElement>('[role="tab"]');
	const list = tab?.closest<HTMLElement>('[role="tablist"]');
	if (!tab || !list) return;
	if (tab.hasAttribute('data-rac')) return ariaTabs(event, tab, list);
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

// React Aria's TabsKeyboardDelegate through useSelectableCollection: Left/Right step in either orientation (flipped only
// in a horizontal RTL list), Up/Down only in a vertical one, Home and End go to the ends, always wrapping past disabled tabs.
const isMac = () => /^Mac/i.test(navigator.platform);
function ariaTabs(event: KeyboardEvent, tab: HTMLElement, list: HTMLElement): void {
	if (event.metaKey || (isMac() ? event.ctrlKey : event.altKey)) return;
	const all = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter((t) => t.closest('[role="tablist"]') === list);
	const enabled = (t: HTMLElement) => t.getAttribute('aria-disabled') !== 'true' && !t.hasAttribute('data-disabled');
	const vertical = list.getAttribute('aria-orientation') === 'vertical';
	const flip = !vertical && getComputedStyle(list).direction === 'rtl';
	const step = (dir: 1 | -1): HTMLElement => {
		const at = all.indexOf(tab);
		for (let i = 1; i <= all.length; i++) {
			const t = all[(((at + dir * i) % all.length) + all.length) % all.length]!;
			if (t === tab || enabled(t)) return t;
		}
		return tab;
	};
	const to =
		event.key === 'ArrowRight' ? step(flip ? -1 : 1)
		: event.key === 'ArrowLeft' ? step(flip ? 1 : -1)
		: event.key === 'ArrowDown' ? (vertical ? step(1) : undefined)
		: event.key === 'ArrowUp' ? (vertical ? step(-1) : undefined)
		: event.key === 'Home' ? all.find(enabled)
		: event.key === 'End' ? [...all].reverse().find(enabled)
		: undefined;
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

// Radix redirects only focus that came by keyboard: a press in a group marks it until focus next lands in it.
const pressed = new WeakSet<Element>();
const groupsOf = (el: Element) => {
	const groups: Element[] = [];
	for (let g = el.closest(GROUP); g; g = g.parentElement?.closest(GROUP) ?? null) groups.push(g);
	return groups;
};

// RovingFocusGroupItem: the item last focused or pressed is the group's one tab stop (tabindex 0), the others -1.
const RADIX_ITEM = '[data-radix-collection-item]';
function makeTabStop(target: Element): void {
	const item = target.closest<HTMLElement>(RADIX_ITEM);
	const group = item?.parentElement?.closest('[role="tablist"], [role="radiogroup"], [role="group"]');
	if (!item || !group || item.hasAttribute('disabled') || item.hasAttribute('data-disabled')) return;
	for (const other of group.querySelectorAll<HTMLElement>(RADIX_ITEM)) if (other.parentElement?.closest('[role="tablist"], [role="radiogroup"], [role="group"]') === group) other.tabIndex = other === item ? 0 : -1;
}

export function pointerdown(target: Element): boolean {
	for (const g of groupsOf(target)) pressed.add(g);
	makeTabStop(target);
	return false;
}

export function focusin(target: Element, event: FocusEvent): boolean {
	makeTabStop(target);
	const byPointer = target instanceof HTMLElement && target.matches(GROUP) && pressed.has(target);
	for (const g of groupsOf(target)) pressed.delete(g);
	if (!(target instanceof HTMLElement) || !target.matches(GROUP) || byPointer) return false;
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
