import { leave, stay } from '../presence.ts';
import { mountIn, unmountIn } from '../reveal.ts';

// Radix Collapsible and Accordion (@radix-ui/react-collapsible, -accordion): the trigger's aria-controls names the content;
// open content is measured into --radix-{collapsible|accordion}-content-height/width with its animation held for the
// measurement, then shown; closing plays the exit animation, then hides the content and unmounts what it holds.

const TRIGGER = '[aria-controls][aria-expanded]';

function contentOf(trigger: Element): HTMLElement | null {
	return document.getElementById(trigger.getAttribute('aria-controls') ?? '');
}

function kind(trigger: Element): 'accordion' | 'collapsible' | undefined {
	const slot = trigger.getAttribute('data-slot') ?? '';
	if (trigger.hasAttribute('data-radix-collection-item') && trigger.closest('[data-orientation]') && /accordion/.test(slot)) return 'accordion';
	if (/accordion/.test(slot)) return 'accordion';
	if (/collapsible/.test(slot) || trigger.closest('[data-slot*="collapsible"]')) return 'collapsible';
	return undefined;
}

function setState(els: readonly (Element | null | undefined)[], open: boolean): void {
	for (const el of els) el?.setAttribute('data-state', open ? 'open' : 'closed');
}

function measure(content: HTMLElement, prefix: string): void {
	const animation = content.style.animationName;
	const transition = content.style.transitionDuration;
	content.style.transitionDuration = '0s';
	content.style.animationName = 'none';
	const rect = content.getBoundingClientRect();
	content.style.setProperty(`--radix-${prefix}-content-height`, `${rect.height}px`);
	content.style.setProperty(`--radix-${prefix}-content-width`, `${rect.width}px`);
	content.style.animationName = animation;
	content.style.transitionDuration = transition;
}

function open(trigger: HTMLElement, prefix: string): void {
	const content = contentOf(trigger);
	const item = trigger.closest('[data-slot$="-item"]');
	const header = trigger.parentElement?.matches('h1,h2,h3,h4,h5,h6') ? trigger.parentElement : null;
	trigger.setAttribute('aria-expanded', 'true');
	setState([trigger, item, header], true);
	if (!content) return;
	stay(content);
	content.removeAttribute('hidden');
	mountIn(content);
	measure(content, prefix);
	setState([content], true);
}

function close(trigger: HTMLElement): void {
	const content = contentOf(trigger);
	const item = trigger.closest('[data-slot$="-item"]');
	const header = trigger.parentElement?.matches('h1,h2,h3,h4,h5,h6') ? trigger.parentElement : null;
	trigger.setAttribute('aria-expanded', 'false');
	setState([trigger, item, header], false);
	if (!content) return;
	leave(
		content,
		() => setState([content], false),
		() => {
			content.setAttribute('hidden', '');
			unmountIn(content);
		},
	);
}

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || trigger.hasAttribute('disabled')) return false;
	const which = kind(trigger);
	if (!which) return false;
	const isOpen = trigger.getAttribute('aria-expanded') === 'true';
	if (which === 'accordion') {
		const root = trigger.closest('[data-slot="accordion"]') ?? trigger.closest('[data-orientation]')?.parentElement;
		const multiple = root?.getAttribute('data-mm-type') === 'multiple';
		// type="single" without collapsible keeps the open item open: its trigger is aria-disabled while open.
		if (isOpen && trigger.getAttribute('aria-disabled') === 'true') return true;
		if (!isOpen && !multiple && root) for (const other of root.querySelectorAll<HTMLElement>(`${TRIGGER}[aria-expanded="true"]`)) if (other !== trigger && kind(other) === 'accordion') close(other);
		if (isOpen) close(trigger);
		else open(trigger, 'accordion');
		return true;
	}
	if (isOpen) close(trigger);
	else open(trigger, 'collapsible');
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || kind(trigger) !== 'accordion') return false;
	const root = trigger.closest('[data-slot="accordion"]');
	if (!root) return false;
	const triggers = [...root.querySelectorAll<HTMLElement>('[data-radix-collection-item]')].filter((t) => !t.hasAttribute('disabled'));
	const at = triggers.indexOf(trigger);
	const to = { ArrowDown: triggers[(at + 1) % triggers.length], ArrowUp: triggers[(at - 1 + triggers.length) % triggers.length], Home: triggers[0], End: triggers[triggers.length - 1] }[event.key];
	if (!to) return false;
	event.preventDefault();
	to.focus();
	return true;
}
