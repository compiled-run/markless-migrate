import type { Page } from 'playwright';
import type { Journey, Key, Step, Target } from './journeys.ts';

/**
 * Keyboard journeys after the WAI-ARIA Authoring Practices: each pop-up or composite control is opened, moved through, chosen from,
 * reopened and closed by the keys its pattern defines, in a fixed order, and after every step the highlighted item, the focused
 * element and the value are compared (https://www.w3.org/WAI/ARIA/apg/patterns/).
 */
export type Pattern = 'combobox' | 'editable combobox' | 'menu button' | 'popup button' | 'disclosure' | 'slider' | 'tabs' | 'radio group' | 'listbox' | 'menu' | 'menubar' | 'tree' | 'grid' | 'tooltip';

export interface PatternWidget {
	readonly pattern: Pattern;
	readonly target: Target;
	/** Region, pattern and component slot: widgets of one kind run the same code, so the first few stand for the rest. */
	readonly kind: string;
	readonly vertical?: boolean;
}

/** A step's key: one the pattern names, the first letter of the last item shown (typeahead), Tab either way, or none (`Focus`: the step only focuses). */
export type PatternKey = Key | 'Typeahead' | 'Tab' | 'Shift+Tab' | 'Focus';

/** Widgets of one kind given the journeys, in page order; the rest count as covered by them. */
export const PATTERN_SAMPLES = 2;
/** At most this many widgets of a route get the journeys, in page order. */
export const MAX_PATTERN_WIDGETS = 12;
/** What one pattern journey adds to a route's adaptive budget: it runs alongside 7 others. */
export const PATTERN_BUDGET_MS = 4_000;
/** Controls with no pattern of their own focused at load to see whether a tooltip shows, in page order, and how long each waits for it. */
export const TOOLTIP_PROBES = 24;
export const TOOLTIP_WAIT_MS = 150;

export const COMPOSITE_ROLES = ['tablist', 'radiogroup', 'listbox', 'menu', 'menubar', 'tree', 'grid', 'treegrid'] as const;

const COMPOSITE: Record<(typeof COMPOSITE_ROLES)[number], Pattern> = { tablist: 'tabs', radiogroup: 'radio group', listbox: 'listbox', menu: 'menu', menubar: 'menubar', tree: 'tree', grid: 'grid', treegrid: 'grid' };

/** Runs in the page: the pattern a control follows, by its role and what it says it opens; null for a native <select> (its pop-up is the browser's) and anything else. */
export function controlPattern(el: Element): Pattern | null {
	if (el.localName === 'select' || el.matches(':disabled, [aria-disabled="true"]')) return null;
	const role = el.getAttribute('role') ?? (el.localName === 'summary' ? 'summary' : el.localName === 'button' ? 'button' : el instanceof HTMLInputElement && el.type === 'range' ? 'slider' : '');
	if (role === 'combobox') return el.localName === 'input' || el.localName === 'textarea' || (el as HTMLElement).isContentEditable ? 'editable combobox' : 'combobox';
	if (role === 'slider') return 'slider';
	if (role !== 'button' && role !== 'summary') return null;
	const popup = (el.getAttribute('aria-haspopup') ?? '').toLowerCase();
	if (popup === 'menu' || popup === 'true') return 'menu button';
	if (popup === 'listbox') return 'combobox';
	if (popup === 'dialog' || popup === 'grid' || popup === 'tree') return 'popup button';
	if (el.hasAttribute('aria-expanded') || role === 'summary') return 'disclosure';
	return null;
}

/** Runs in the page: whether a composite widget is its own (not the pop-up of a combobox or button, which that control's journeys open), with something in it to move to. */
export function compositeInfo(el: Element): { own: boolean; vertical: boolean; slot: string } {
	const ITEMS = '[role="tab"], [role="radio"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="treeitem"], [role="gridcell"], [role="row"], input[type="radio"]';
	const id = el.id;
	const controller = id ? document.querySelector(`[aria-controls~="${CSS.escape(id)}"], [aria-owns~="${CSS.escape(id)}"]`) : null;
	const owned = Boolean(controller && /^(combobox|button)$/.test(controller.getAttribute('role') ?? controller.localName) && controller.getAttribute('role') !== 'tab');
	const items = [...el.querySelectorAll(ITEMS)].filter((i) => i.checkVisibility());
	const role = el.getAttribute('role');
	const orientation = el.getAttribute('aria-orientation');
	return { own: !owned && items.length > 0 && !el.matches('[aria-disabled="true"]'), vertical: orientation ? orientation === 'vertical' : role === 'menu' || role === 'listbox' || role === 'tree' || role === 'radiogroup', slot: el.getAttribute('data-slot') ?? '' };
}

/** Runs in the page: focuses where Tab would enter the widget (the widget itself, its roving item, its checked or selected item, its first item, or the control that owns it); false when nothing in it takes focus. */
export function focusEntry(el: Element): boolean {
	const COMPOSITE = ['tablist', 'radiogroup', 'listbox', 'menu', 'menubar', 'tree', 'grid', 'treegrid'];
	const takes = (e: Element | null | undefined): e is HTMLElement => e instanceof HTMLElement && e.tabIndex >= 0 && !e.matches(':disabled') && e.checkVisibility();
	let entry: HTMLElement | undefined;
	if (!COMPOSITE.includes(el.getAttribute('role') ?? '') || takes(el)) entry = el as HTMLElement;
	else {
		const roving = [...el.querySelectorAll('[tabindex="0"], input[type="radio"]:checked, [aria-selected="true"], [aria-checked="true"]')].find(takes);
		const first = [...el.querySelectorAll('[role="tab"], [role="radio"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="treeitem"], [role="gridcell"], [role="row"], input, button')].find(takes);
		const owner = el.id ? document.querySelector(`[aria-controls~="${CSS.escape(el.id)}"], [aria-owns~="${CSS.escape(el.id)}"]`) : null;
		entry = roving ?? first ?? (takes(owner) ? owner : undefined);
	}
	if (!entry) return false;
	entry.focus();
	return document.activeElement === entry || entry.contains(document.activeElement);
}

/** Runs in the page: the first letter of the last item shown in the widget that holds focus, so typeahead moves to an item by its text; '' when no item starts with a letter. */
export function typeaheadLetter(): string {
	const SCOPE = '[role="listbox"], [role="menu"], [role="menubar"], [role="tree"], [role="grid"], [role="treegrid"], [role="tablist"], [role="radiogroup"]';
	const active = document.activeElement;
	if (!active) return '';
	const descendant = active.getAttribute('aria-activedescendant');
	const controlled = (active.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)).find((e) => e?.checkVisibility());
	const scope = active.closest(SCOPE) ?? (descendant ? document.getElementById(descendant)?.closest(SCOPE) : null) ?? controlled ?? null;
	if (!scope) return '';
	const items = [...scope.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="treeitem"], [role="tab"], [role="radio"]')].filter((i) => i.checkVisibility());
	for (const item of items.reverse()) {
		const letter = /^[a-z]/i.exec((item.textContent ?? '').trim())?.[0];
		if (letter) return letter.toLowerCase();
	}
	return '';
}

/** Runs in the page: whether choosing the item that holds focus would leave the page or end the session (a link, Sign out, Delete): it is closed with Escape instead. */
export function unsafeChoice(destructive: string): boolean {
	const active = document.activeElement;
	const descendant = active?.getAttribute('aria-activedescendant');
	const item = (descendant ? document.getElementById(descendant) : null) ?? active;
	if (!item || item === document.body) return false;
	const name = (item.getAttribute('aria-label') ?? item.textContent ?? '').replace(/\s+/g, ' ').trim();
	return Boolean(item.closest('a[href]') || item.querySelector('a[href]') || item.getAttribute('role') === 'link' || new RegExp(destructive, 'i').test(name));
}

/** Runs in the page: a point outside the control and every pop-up shown, on no other control, to click as a visitor dismisses what is open. */
export function outsidePoint(el: Element): { x: number; y: number } | null {
	const shown = [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tree"], [role="grid"], [popover]')].filter((e) => e.checkVisibility() && (!e.hasAttribute('popover') || e.matches(':popover-open')));
	const boxes = [el, ...shown].map((e) => e.getBoundingClientRect());
	const control = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="radio"], [role="combobox"], [role="slider"], [role="menuitem"], [role="option"], [role="treeitem"], [role="gridcell"], [tabindex], [contenteditable=""], [contenteditable="true"]';
	for (const fy of [0.5, 0.9, 0.1, 0.7, 0.3]) {
		for (const fx of [0.05, 0.95, 0.5, 0.25, 0.75]) {
			const x = Math.round(innerWidth * fx);
			const y = Math.round(innerHeight * fy);
			if (boxes.some((b) => x >= b.left - 4 && x <= b.right + 4 && y >= b.top - 4 && y <= b.bottom + 4)) continue;
			const hit = document.elementFromPoint(x, y);
			if (hit && (hit.closest(control) || el.contains(hit))) continue;
			return { x, y };
		}
	}
	return null;
}

/**
 * Runs in the page: what a keyboard user of the widget meets after a step, one line each: its value, whether it is expanded,
 * the item the focused element points at (aria-activedescendant), and the highlighted, selected and expanded items of the
 * widget and of the pop-up it opened.
 */
export function widgetState(el: Element): string[] {
	const ITEMS = '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="treeitem"], [role="gridcell"], [role="row"], [role="tab"], [role="radio"], input[type="radio"]';
	const POPUP = '[role="listbox"], [role="menu"], [role="tree"], [role="grid"], [role="treegrid"], [role="dialog"]';
	const text = (e: Element) => ((e instanceof HTMLElement ? e.innerText : e.textContent) || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
	const describe = (e: Element) => `${e.getAttribute('role') ?? (e instanceof HTMLInputElement ? e.type : e.localName)} "${text(e)}"`;
	const out: string[] = [];
	const role = el.getAttribute('role') ?? el.localName;
	const tips = [...document.querySelectorAll('[role="tooltip"]')].filter((t) => t.checkVisibility()).map((t) => `"${text(t)}"`);
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) out.push(`value: "${el.value}"`);
	else if (role === 'slider') out.push(`value: ${el.getAttribute('aria-valuetext') ?? el.getAttribute('aria-valuenow') ?? '(none)'}`);
	else if (role === 'combobox' || role === 'button' || role === 'summary') out.push(`value: "${text(el)}"`);
	if (el.hasAttribute('aria-expanded')) out.push(`expanded: ${el.getAttribute('aria-expanded')}`);
	const roots = new Set<Element>([el]);
	for (const attr of ['aria-controls', 'aria-owns']) for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
		const owned = document.getElementById(id);
		if (owned) roots.add(owned);
	}
	const active = document.activeElement;
	const holder = active?.closest(POPUP);
	if (holder) roots.add(holder);
	const id = active?.getAttribute('aria-activedescendant');
	const pointed = id ? document.getElementById(id) : null;
	if (pointed) {
		out.push(`active: ${describe(pointed)}`);
		const list = pointed.closest(POPUP);
		if (list) roots.add(list);
	}
	const highlighted = new Set<string>();
	const selected = new Set<string>();
	const expanded = new Set<string>();
	for (const root of roots) {
		if (!root.isConnected || !root.checkVisibility()) continue;
		for (const item of [root, ...root.querySelectorAll(ITEMS)]) {
			if (!item.matches(ITEMS) || !item.checkVisibility()) continue;
			if (item.hasAttribute('data-highlighted') || item.hasAttribute('data-focused') || item.getAttribute('data-active') === 'true') highlighted.add(describe(item));
			const current = item.getAttribute('aria-current');
			const on = item.getAttribute('aria-selected') === 'true' || item.getAttribute('aria-checked') === 'true' || (item instanceof HTMLInputElement && item.checked) || (current !== null && current !== 'false') || item.getAttribute('data-state') === 'checked' || item.getAttribute('data-state') === 'active' || (item.hasAttribute('data-selected') && item.getAttribute('data-selected') !== 'false') || item.hasAttribute('data-checked');
			if (on) selected.add(describe(item));
			if (item.getAttribute('role') === 'treeitem' && item.getAttribute('aria-expanded') === 'true') expanded.add(describe(item));
		}
	}
	const list = (items: Set<string>) => [...items].slice(0, 10).join(', ') || '(none)';
	out.push(`highlighted: ${list(highlighted)}`, `selected: ${list(selected)}`);
	if (expanded.size) out.push(`expanded items: ${list(expanded)}`);
	if (tips.length) out.push(`tooltip: ${tips.join(', ')}`);
	return out;
}

/** The pattern journeys of one widget, each starting from the loaded page (after `prefix`, the steps that reveal it). */
export function patternJourneys(widget: PatternWidget, prefix: readonly Step[], describe: (t: Target) => string): Journey[] {
	const target = widget.target;
	const focus = (key: PatternKey): Step => ({ action: 'key', key, target, focus: true });
	const key = (k: PatternKey): Step => ({ action: 'key', key: k, target });
	const choose: Step = { action: 'key', key: 'Enter', target, choose: true };
	const outside: Step = { action: 'outside', target };
	const next: Key = widget.vertical ? 'ArrowDown' : 'ArrowRight';
	const back: Key = widget.vertical ? 'ArrowUp' : 'ArrowLeft';
	const journeys = (list: readonly (readonly [string, readonly Step[]])[]): Journey[] => list.map(([what, steps]) => ({ name: `${widget.pattern} keys on ${describe(target)}: ${what}`, steps: [...prefix, ...steps], pattern: widget.pattern }));
	switch (widget.pattern) {
		case 'combobox':
			return journeys([
				['open with ArrowDown, choose with Enter, reopen with ArrowDown, then Escape, End, Home and typeahead', [focus('ArrowDown'), key('ArrowDown'), key('ArrowDown'), choose, key('ArrowDown'), key('ArrowDown'), key('Escape'), key('ArrowDown'), key('End'), key('Home'), key('Typeahead'), key('Escape')]],
				['open with Enter and with Space, choose with Enter, reopen with Enter', [focus('Enter'), key('ArrowDown'), key('Escape'), key('Space'), key('ArrowDown'), choose, key('Enter'), key('Escape')]],
				['open with ArrowUp, close by a click outside, reopen with ArrowDown', [focus('ArrowUp'), key('ArrowUp'), outside, focus('ArrowDown'), key('Escape')]],
			]);
		case 'editable combobox':
			return journeys([
				['open with ArrowDown, choose with Enter, reopen with ArrowDown, then Escape', [focus('ArrowDown'), key('ArrowDown'), key('ArrowDown'), choose, key('ArrowDown'), key('ArrowUp'), key('Escape'), key('ArrowDown'), key('Escape')]],
				['open with ArrowUp, close by a click outside, reopen with ArrowDown', [focus('ArrowUp'), outside, focus('ArrowDown'), key('Escape')]],
			]);
		case 'menu button':
			return journeys([
				['open with Enter, move, End, Home, typeahead, Escape, reopen with Space, choose with Enter, reopen with ArrowDown', [focus('Enter'), key('ArrowDown'), key('ArrowDown'), key('ArrowUp'), key('End'), key('Home'), key('Typeahead'), key('Escape'), key('Space'), key('ArrowDown'), choose, key('ArrowDown'), key('Escape')]],
				['open with ArrowDown, close by a click outside, reopen with ArrowUp', [focus('ArrowDown'), key('ArrowUp'), outside, focus('ArrowUp'), key('Escape')]],
			]);
		case 'popup button':
			return journeys([['open with Enter, Tab through it both ways, Escape, reopen with Space, close by a click outside, reopen with Enter', [focus('Enter'), key('Tab'), key('Tab'), key('Shift+Tab'), key('Escape'), key('Space'), outside, focus('Enter'), key('Escape')]]]);
		case 'tooltip':
			return journeys([['show it by focus, hide it with Escape, Tab away, Shift+Tab back to show it again', [focus('Focus'), key('Escape'), key('Tab'), key('Shift+Tab'), key('Escape')]]]);
		case 'disclosure':
			return journeys([['toggle with Enter twice, then with Space twice', [focus('Enter'), key('Enter'), key('Space'), key('Space')]]]);
		case 'slider':
			return journeys([['arrows both ways, Page Up, Page Down, End and Home', [focus('ArrowRight'), key('ArrowRight'), key('ArrowUp'), key('ArrowLeft'), key('ArrowDown'), key('PageUp'), key('PageDown'), key('End'), key('Home')]]]);
		case 'tabs':
			return journeys([['arrows both ways, Enter, End, Space, Home, and past the first tab', [focus(next), key(next), key(back), key('Enter'), key('End'), key('Space'), key('Home'), key(back)]]]);
		case 'radio group':
			return journeys([['arrows down, up, right and left, then Space', [focus('ArrowDown'), key('ArrowDown'), key('ArrowUp'), key('ArrowRight'), key('ArrowLeft'), key('Space')]]]);
		case 'listbox':
			return journeys([['arrows, End, Home, typeahead, Space, choose with Enter', [focus(next), key(next), key(back), key('End'), key('Home'), key('Typeahead'), key('Space'), choose]]]);
		case 'menu':
			return journeys([['arrows, End, Home, typeahead, Escape', [focus(next), key(next), key(back), key('End'), key('Home'), key('Typeahead'), key('Escape')]]]);
		case 'menubar':
			return journeys([
				['along the bar, open with ArrowDown, move to the next menu, Escape, End, Home, open with Enter, typeahead, choose with Enter, reopen with ArrowDown', [focus('ArrowRight'), key('ArrowLeft'), key('ArrowDown'), key('ArrowDown'), key('ArrowRight'), key('ArrowLeft'), key('Escape'), key('End'), key('Home'), key('Enter'), key('Typeahead'), choose, key('ArrowDown'), key('Escape')]],
				['open with Enter, close by a click outside, reopen with ArrowDown', [focus('Enter'), outside, focus('ArrowDown'), key('Escape')]],
			]);
		case 'tree':
			return journeys([['down, expand, into, back out, collapse, up, End, Home, typeahead, choose with Enter', [focus('ArrowDown'), key('ArrowDown'), key('ArrowRight'), key('ArrowRight'), key('ArrowLeft'), key('ArrowLeft'), key('ArrowUp'), key('End'), key('Home'), key('Typeahead'), choose]]]);
		case 'grid':
			return journeys([['arrows every way, End, Home, Page Down, Page Up, choose with Enter', [focus('ArrowRight'), key('ArrowRight'), key('ArrowDown'), key('ArrowLeft'), key('ArrowUp'), key('End'), key('Home'), key('PageDown'), key('PageUp'), choose]]]);
	}
}

export async function compositeWidgets(page: Page, snapshotName: (line: string) => string, timeout: number): Promise<{ target: Target; pattern: Pattern; vertical: boolean; slot: string; region: string }[]> {
	const out: { target: Target; pattern: Pattern; vertical: boolean; slot: string; region: string }[] = [];
	for (const role of COMPOSITE_ROLES) {
		const seen = new Map<string, number>();
		for (const locator of await page.getByRole(role).all()) {
			const name = snapshotName((await locator.ariaSnapshot({ timeout }).catch(() => '')).split('\n')[0] ?? '');
			const key = name.replace(/\s+/g, '');
			const nth = seen.get(key) ?? 0;
			seen.set(key, nth + 1);
			if (!(await locator.isVisible().catch(() => false))) continue;
			const info = await locator.evaluate(compositeInfo, undefined, { timeout }).catch(() => undefined);
			if (!info?.own) continue;
			const region = await locator.evaluate((el) => {
				if (el.closest('main, [role="main"]')) return 'main';
				const landmark = el.closest('header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"]');
				return landmark ? (landmark.getAttribute('role') ?? landmark.localName) : '';
			}, undefined, { timeout }).catch(() => '');
			out.push({ target: { role, name, nth }, pattern: COMPOSITE[role], vertical: info.vertical, slot: info.slot, region });
		}
	}
	return out;
}
