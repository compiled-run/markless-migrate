// @qwik-ui/headless ToggleGroup (toggle-group/*): arrows move focus between its enabled items along its orientation
// (Right and Left horizontally, flipped right to left; Down and Up vertically), wrapping only with data-mm-loop, without
// pressing anything; once an item is pressed or released, the pressed items are the group's tab stops (the first enabled
// item when none is). What is pressed is Markless state (convert's toggle groups).
const ROOT = '[data-qui-togglegroup-root]';
const ITEM = '[data-qui-togglegroup-item]';

const itemsOf = (root: Element) => [...root.querySelectorAll<HTMLElement>(ITEM)].filter((i) => i.closest(ROOT) === root);
const usable = (i: HTMLElement) => i.getAttribute('aria-disabled') !== 'true' && !i.hasAttribute('disabled');

function restop(root: Element): void {
	const items = itemsOf(root);
	const pressed = items.filter((i) => i.getAttribute('aria-pressed') === 'true');
	const first = items.find(usable);
	for (const i of items) i.tabIndex = (pressed.length ? pressed.includes(i) : i === first) ? 0 : -1;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const root = item?.closest<HTMLElement>(ROOT);
	if (!item || !root || !event.key.startsWith('Arrow')) return false;
	event.preventDefault();
	const vertical = root.getAttribute('data-orientation') === 'vertical';
	const rtl = root.getAttribute('dir') === 'rtl';
	const forward = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
	const back = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
	if (event.key !== forward && event.key !== back) return true;
	const items = itemsOf(root).filter(usable);
	const at = items.indexOf(item);
	let to = at + (event.key === forward ? 1 : -1);
	if (root.dataset.mmLoop !== undefined) to = (to + items.length) % items.length;
	items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
	return true;
}

export function click(target: Element): boolean {
	const root = target.closest(ITEM)?.closest(ROOT);
	if (!root) return false;
	// The pressed state is Markless's own handler's to switch; the tab stops follow once it has.
	setTimeout(() => restop(root), 0);
	return false;
}
