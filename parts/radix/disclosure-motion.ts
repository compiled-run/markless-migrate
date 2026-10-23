// Radix Collapsible and Accordion on Markless state: panel-motion.ts measures their content and ends its exit.

/** Accordion keyboard: arrows, Home and End move focus between its enabled triggers. Focus only. */
export function accordionKeys(event: KeyboardEvent): void {
	const trigger = (event.target as Element | null)?.closest<HTMLElement>('[data-radix-collection-item]');
	const root = trigger?.closest('[data-slot="accordion"]');
	if (!trigger || !root) return;
	const triggers = [...root.querySelectorAll<HTMLElement>('[data-radix-collection-item]')].filter((t) => !t.hasAttribute('disabled'));
	const at = triggers.indexOf(trigger);
	const to = { ArrowDown: triggers[(at + 1) % triggers.length], ArrowUp: triggers[(at - 1 + triggers.length) % triggers.length], Home: triggers[0], End: triggers[triggers.length - 1] }[event.key];
	if (!to) return;
	event.preventDefault();
	to.focus();
}
