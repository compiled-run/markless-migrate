// A radio group's arrows (Base UI RadioGroup, Radix RadioGroup) move focus to the next enabled radio, looping, and
// choose it; a single-choice toggle group's (Radix ToggleGroup's roving focus) only move focus.
export function radioKeys(event: KeyboardEvent, choose: boolean): void {
	const radio = (event.target as Element | null)?.closest<HTMLElement>('[role="radio"]');
	const group = radio?.closest<HTMLElement>('[role="radiogroup"]') ?? radio?.closest<HTMLElement>('[role="group"]');
	if (!radio || !group) return;
	const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')].filter((r) => (r.closest('[role="radiogroup"]') ?? r.closest('[role="group"]')) === group && !r.hasAttribute('disabled') && r.getAttribute('aria-disabled') !== 'true' && !r.hasAttribute('data-disabled'));
	const rtl = getComputedStyle(group).direction === 'rtl';
	const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
	const at = radios.indexOf(radio);
	const to = step ? radios[(at + step + radios.length) % radios.length] : event.key === 'Home' ? radios[0] : event.key === 'End' ? radios[radios.length - 1] : undefined;
	if (!to) return;
	event.preventDefault();
	to.focus();
	if (choose) to.click();
}
