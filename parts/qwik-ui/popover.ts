// @qwik-ui/headless Popover (popover/*): the browser opens and closes the panel through popovertarget (an auto popover
// light-dismisses itself on Escape and outside presses); on each toggle the panel's data-open/data-closed follow the new
// state, and a floating panel is placed by floating-ui against its trigger (or the anchor convert recorded).
import { mark, place, unplace } from './floating.ts';

const FLOATING = '[popover][data-floating]';

function triggerOf(panel: HTMLElement): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[popovertarget="${panel.id}"]`) ?? document.getElementById(panel.id.replace(/-panel$/, '-trigger'));
}

function follow(panel: HTMLElement, on: boolean): void {
	mark([panel], on);
	const trigger = triggerOf(panel);
	if (!panel.matches(FLOATING)) return;
	if (on) place(document.getElementById(panel.dataset.mmAnchor ?? '') ?? trigger ?? panel, panel);
	else unplace(panel);
}

if (typeof document !== 'undefined')
	document.addEventListener(
		'beforetoggle',
		(event) => {
			const panel = event.target;
			if (!(panel instanceof HTMLElement) || !panel.id.endsWith('-panel') || panel.closest('[data-qui-select-root], [data-combobox-root], [data-qui-dropdown]') || panel.getAttribute('role') === 'tooltip' || panel.getAttribute('role') === 'listbox' || panel.getAttribute('role') === 'menu') return;
			follow(panel, (event as ToggleEvent).newState === 'open');
		},
		true,
	);

// The first click wakes the page: the panel it opens through popovertarget is placed as soon as the browser shows it.
export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>('[popovertarget]');
	const panel = trigger ? document.getElementById(trigger.getAttribute('popovertarget') ?? '') : null;
	if (!trigger || !panel) return false;
	if (!panel.hasAttribute('data-mm-placed')) {
		panel.setAttribute('data-mm-placed', '');
		panel.addEventListener('toggle', (event) => (event as ToggleEvent).newState === 'open' && follow(panel, true), { once: true });
	}
	return false;
}
