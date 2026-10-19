import { mountIn, unmountIn } from '../reveal.ts';

// Radix Tabs (@radix-ui/react-tabs): roving focus over [role=tab] in a [role=tablist]; automatic activation on focus;
// an inactive panel is hidden and its content unmounted, the active one shown with its content mounted.

const panelOf = (tab: Element) => document.getElementById(tab.getAttribute('aria-controls') ?? '');

function tabsIn(list: Element): HTMLElement[] {
	return [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter((t) => t.closest('[role="tablist"]') === list);
}

export function activate(tab: HTMLElement): void {
	const list = tab.closest('[role="tablist"]');
	if (!list || tab.getAttribute('aria-selected') === 'true' || tab.hasAttribute('disabled')) return;
	for (const other of tabsIn(list)) {
		const on = other === tab;
		other.setAttribute('aria-selected', String(on));
		other.setAttribute('data-state', on ? 'active' : 'inactive');
		const panel = panelOf(other);
		if (!panel) continue;
		panel.setAttribute('data-state', on ? 'active' : 'inactive');
		if (on) {
			panel.removeAttribute('hidden');
			mountIn(panel);
		} else {
			panel.setAttribute('hidden', '');
			unmountIn(panel);
		}
	}
}

export function click(target: Element): boolean {
	const tab = target.closest<HTMLElement>('[role="tab"][data-radix-collection-item]');
	if (!tab) return false;
	activate(tab);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const tab = target.closest<HTMLElement>('[role="tab"][data-radix-collection-item]');
	const list = tab?.closest('[role="tablist"]');
	if (!tab || !list) return false;
	const tabs = tabsIn(list).filter((t) => !t.hasAttribute('disabled'));
	const vertical = list.getAttribute('aria-orientation') === 'vertical';
	const rtl = getComputedStyle(list).direction === 'rtl';
	const at = tabs.indexOf(tab);
	const next = { ArrowRight: vertical ? undefined : rtl ? -1 : 1, ArrowLeft: vertical ? undefined : rtl ? 1 : -1, ArrowDown: vertical ? 1 : undefined, ArrowUp: vertical ? -1 : undefined }[event.key];
	let to: HTMLElement | undefined;
	if (next !== undefined) to = tabs[(at + next + tabs.length) % tabs.length];
	else if (event.key === 'Home') to = tabs[0];
	else if (event.key === 'End') to = tabs[tabs.length - 1];
	if (!to) return false;
	event.preventDefault();
	to.focus();
	activate(to);
	return true;
}
