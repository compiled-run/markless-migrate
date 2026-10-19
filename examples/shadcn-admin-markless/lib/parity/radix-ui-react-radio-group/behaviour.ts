// Parity port of @radix-ui/react-radio-group's roving focus: the DOM half. The checked value stays in the page,
// written by each radio's own click handler. What Radix does that the routes rely on: the group is one Tab stop that
// hands focus to the checked radio (or the first), the arrow keys move focus between radios and wrap, the radio that
// last had focus keeps tabindex 0, and Shift+Tab from a radio leaves the group.

function radiosOf(group: Element): HTMLElement[] {
	return [...group.querySelectorAll<HTMLElement>('[role=radio]')].filter((r) => !r.hasAttribute('disabled'));
}

function stop(group: Element, radio: HTMLElement): void {
	for (const r of radiosOf(group)) r.setAttribute('tabindex', r === radio ? '0' : '-1');
}

/** The group itself took focus (Tab into it): hand it to the checked radio, else the first. */
export function focusGroup(event: FocusEvent): void {
	const group = event.target;
	if (!(group instanceof HTMLElement) || group.getAttribute('role') !== 'radiogroup') return;
	const radios = radiosOf(group);
	const target = radios.find((r) => r.getAttribute('aria-checked') === 'true') ?? radios[0];
	if (!target) return;
	stop(group, target);
	target.focus();
}

/** Keys on a radio: the arrows move focus (wrapping, flipped left/right in a right-to-left group); Shift+Tab leaves the group. */
export function radioKeys(event: KeyboardEvent): void {
	const radio = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[role=radio]') : null;
	const group = radio?.closest<HTMLElement>('[role=radiogroup]');
	if (!radio || !group) return;
	if (event.key === 'Tab' && event.shiftKey) {
		group.setAttribute('tabindex', '-1');
		setTimeout(() => group.setAttribute('tabindex', '0'));
		return;
	}
	const rtl = (group.getAttribute('dir') ?? document.documentElement.dir) === 'rtl';
	const forward = event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
	const back = event.key === 'ArrowUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
	if (!forward && !back) return;
	const radios = radiosOf(group);
	const at = radios.indexOf(radio);
	const next = radios[(at + (forward ? 1 : radios.length - 1)) % radios.length];
	stop(group, next);
	next.focus();
}

/** A radio took focus (pointer or keys): it becomes the group's Tab stop. */
export function radioFocused(event: FocusEvent): void {
	const radio = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[role=radio]') : null;
	const group = radio?.closest('[role=radiogroup]');
	if (radio && group) stop(group, radio);
}

/** Arrow keys scroll the page unless prevented: the caller prevents them when this says so. */
export function isRadioArrow(key: string): boolean {
	return key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight';
}
