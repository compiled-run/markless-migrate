// Radix Collapsible and Accordion content measurement and exit, on content Markless renders: when the content is
// shown, its size goes into --radix-{collapsible|accordion}-content-height/width with animation held for the
// measurement (Radix's layout effect); a closing item stays shown until its own exit animation ends.

function measure(content: HTMLElement): void {
	const animation = content.style.animationName;
	const transition = content.style.transitionDuration;
	content.style.transitionDuration = '0s';
	content.style.animationName = 'none';
	const rect = content.getBoundingClientRect();
	// Radix's Collapsible sets its own variables; Accordion's content style aliases its variables to them.
	content.style.setProperty('--radix-collapsible-content-height', `${rect.height}px`);
	content.style.setProperty('--radix-collapsible-content-width', `${rect.width}px`);
	content.style.animationName = animation;
	content.style.transitionDuration = transition;
}

/** Measures the content once Markless has shown it, in the frame before it is painted. */
export function measureWhenShown(id: string): void {
	requestAnimationFrame(() => {
		const content = document.getElementById(id);
		if (content && !content.hidden) measure(content);
	});
}

/** Calls `done` once the content's exit animation (if its closed state starts one) has finished. */
export function afterExit(id: string, done: () => void): void {
	requestAnimationFrame(() => {
		const el = document.getElementById(id);
		const running = el?.getAnimations() ?? [];
		if (!running.length) return done();
		Promise.all(running.map((a) => a.finished)).then(done, done);
	});
}

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
