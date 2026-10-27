// @qwik-ui/headless Tabs (tabs/tabs.tsx, tab.tsx, tab-panel.tsx): a click (or Enter and Space, through the button)
// selects a tab; arrows along the orientation, Home, End, PageUp and PageDown move focus to an enabled tab, always
// wrapping, without selecting it, unless the old page selected on focus (behavior="automatic", which convert reads off
// the old page as data-mm-automatic). The selected tab and the panel paired with it by order switch their attributes and
// the selected class names the old page gave the selected tab.
const ROOT = '[data-qui-tabs-root]';
const own = (root: Element, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => el.closest(ROOT) === root);
const tabsOf = (root: Element) => own(root, '[role="tab"]');
const panelsOf = (root: Element) => own(root, '[role="tabpanel"]');
const usable = (tab: HTMLElement) => !tab.hasAttribute('disabled') && tab.getAttribute('aria-disabled') !== 'true';

// The classes the selected tab carries that an unselected one lacks (`selected` and the selectedClassName prop), read once
// from the markup as served, before anything was selected here.
const selectedClasses = new WeakMap<Element, string[]>();
function classesOf(root: Element): string[] {
	let found = selectedClasses.get(root);
	if (found) return found;
	const tabs = tabsOf(root);
	const on = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
	const off = tabs.find((t) => t.getAttribute('aria-selected') !== 'true');
	const offClasses = new Set(off?.classList ?? []);
	found = on ? [...on.classList].filter((c) => !offClasses.has(c)) : ['selected'];
	selectedClasses.set(root, found);
	return found;
}

function select(root: Element, tab: HTMLElement): void {
	if (!usable(tab)) return;
	const classes = classesOf(root);
	const tabs = tabsOf(root);
	const at = tabs.indexOf(tab);
	tabs.forEach((t, i) => {
		const on = i === at;
		t.setAttribute('aria-selected', String(on));
		t.setAttribute('data-state', on ? 'selected' : 'unselected');
		t.tabIndex = on ? 0 : -1;
		for (const c of classes) t.classList.toggle(c, on);
	});
	panelsOf(root).forEach((p, i) => (p.hidden = i !== at));
}

const tabAt = (target: Element) => {
	const tab = target.closest<HTMLElement>('[role="tab"]');
	const root = tab?.closest(ROOT);
	return tab && root ? { tab, root } : undefined;
};

export function click(target: Element): boolean {
	const found = tabAt(target);
	if (!found) return false;
	select(found.root, found.tab);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const found = tabAt(target);
	if (!found) return false;
	const { tab, root } = found;
	const vertical = (root as HTMLElement).dataset.mmOrientation === 'vertical';
	const keys: Readonly<Record<string, 'next' | 'prev' | 'first' | 'last'>> = vertical ? { ArrowDown: 'next', ArrowUp: 'prev', Home: 'first', PageUp: 'first', End: 'last', PageDown: 'last' } : { ArrowRight: 'next', ArrowLeft: 'prev', Home: 'first', PageUp: 'first', End: 'last', PageDown: 'last' };
	if (['Home', 'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
	const intent = keys[event.key];
	if (!intent) return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key);
	const tabs = tabsOf(root).filter(usable);
	const at = tabs.indexOf(tab);
	const to = intent === 'first' ? tabs[0] : intent === 'last' ? tabs.at(-1) : tabs[(at + (intent === 'next' ? 1 : -1) + tabs.length) % tabs.length];
	to?.focus();
	if (to && (root as HTMLElement).dataset.mmAutomatic !== undefined) select(root, to);
	return true;
}

export function focusin(target: Element): boolean {
	const found = tabAt(target);
	if (!found || (found.root as HTMLElement).dataset.mmAutomatic === undefined) return false;
	select(found.root, found.tab);
	return true;
}

export function pointerover(target: Element): boolean {
	const found = tabAt(target);
	if (!found || (found.root as HTMLElement).dataset.mmAutomatic === undefined) return false;
	select(found.root, found.tab);
	return true;
}
