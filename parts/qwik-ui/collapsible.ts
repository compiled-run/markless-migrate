// @qwik-ui/headless Collapsible and Accordion (collapsible/*, accordion/*): the trigger's click toggles its content;
// in an accordion, opening one item closes the others unless the old page let several stay open (data-mm-multiple,
// measured by convert), and an open item stays open where the old page would not close it (data-mm-collapsible="false").
// Before each toggle the content's height is measured into --qwikui-collapsible-content-height (and the accordion's
// variable); content that animates keeps `hidden` off while it closes and gets it once its animation or transition ends.
// Up and Down move focus between an accordion's enabled triggers, wrapping, Home and End to its ends.
// Each open or close is dispatched on the item (qui-collapsible-open), what its bind:open or the accordion's bind:value
// would hear; openItem is that signal written.
const ROOT = '[data-collapsible]';
const ACCORDION = '[data-accordion]';

const contentOf = (root: Element) => document.getElementById(`${root.id}-content`) ?? root.querySelector<HTMLElement>(':scope > [data-collapsible-content]');
const triggerOf = (root: Element) => document.getElementById(`${root.id}-trigger`) ?? root.querySelector<HTMLElement>('button[aria-controls]');
const isOpen = (root: Element) => root.hasAttribute('data-open');

function measure(content: HTMLElement, accordion: boolean): void {
	const wasHidden = content.hidden;
	const { height, display, visibility } = content.style;
	content.hidden = false;
	Object.assign(content.style, { height: 'auto', display: 'block', visibility: 'hidden' });
	const h = content.offsetHeight;
	Object.assign(content.style, { height, display, visibility });
	content.hidden = wasHidden;
	content.style.setProperty('--qwikui-collapsible-content-height', `${h}px`);
	if (accordion) content.style.setProperty('--qwikui-accordion-content-height', `${h}px`);
}

const animates = (el: Element) => {
	const s = getComputedStyle(el);
	return s.animationDuration.split(',').some((d) => parseFloat(d) > 0) || s.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
};

const waiting = new WeakMap<HTMLElement, (event: Event) => void>();

function setOpen(root: HTMLElement, on: boolean): void {
	const trigger = triggerOf(root);
	const content = contentOf(root);
	const accordion = root.closest(ACCORDION) !== null;
	if (content) measure(content, accordion);
	for (const el of [root, trigger]) {
		el?.toggleAttribute('data-open', on);
		el?.toggleAttribute('data-closed', !on);
	}
	trigger?.setAttribute('aria-expanded', String(on));
	root.dispatchEvent(new CustomEvent('qui-collapsible-open', { bubbles: true, detail: on }));
	if (!content) return;
	const pending = waiting.get(content);
	if (pending) {
		content.removeEventListener('animationend', pending);
		content.removeEventListener('transitionend', pending);
		waiting.delete(content);
	}
	content.toggleAttribute('data-open', on);
	content.toggleAttribute('data-closed', !on);
	if (on) {
		content.hidden = false;
		return;
	}
	if (!animates(content)) {
		content.hidden = true;
		return;
	}
	const done = (event: Event) => {
		if (event.target !== content) return;
		content.removeEventListener('animationend', done);
		content.removeEventListener('transitionend', done);
		waiting.delete(content);
		if (!isOpen(root)) content.hidden = true;
	};
	waiting.set(content, done);
	content.addEventListener('animationend', done);
	content.addEventListener('transitionend', done);
}

const rootOfTrigger = (target: Element) => {
	const trigger = target.closest<HTMLElement>('button[aria-controls]');
	const root = trigger?.closest<HTMLElement>(ROOT);
	return trigger && root && triggerOf(root) === trigger ? { trigger, root } : undefined;
};

function openOnly(root: HTMLElement, on: boolean): void {
	const accordion = root.closest<HTMLElement>(ACCORDION);
	if (on && accordion && accordion.dataset.mmMultiple === undefined) for (const other of accordion.querySelectorAll<HTMLElement>(ROOT)) if (other !== root && other.closest(ACCORDION) === accordion && isOpen(other)) setOpen(other, false);
	setOpen(root, on);
}

/** Opens or closes an item as its bound signal would: in a one-open accordion, opening it closes the others. */
export function openItem(root: Element, on: boolean): void {
	if (root instanceof HTMLElement && root.matches(ROOT) && isOpen(root) !== on) openOnly(root, on);
}

export function click(target: Element): boolean {
	const found = rootOfTrigger(target);
	if (!found) return false;
	const { root, trigger } = found;
	if (trigger.hasAttribute('disabled') || root.hasAttribute('data-disabled')) return true;
	const accordion = root.closest<HTMLElement>(ACCORDION);
	const opening = !isOpen(root);
	if (!opening && (root.dataset.mmCollapsible === 'false' || accordion?.dataset.mmCollapsible === 'false')) return true;
	openOnly(root, opening);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const found = rootOfTrigger(target);
	const accordion = found?.root.closest<HTMLElement>(ACCORDION);
	if (!found || !accordion || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return false;
	event.preventDefault();
	const triggers = [...accordion.querySelectorAll<HTMLElement>(ROOT)].filter((r) => r.closest(ACCORDION) === accordion).map((r) => triggerOf(r)).filter((t): t is HTMLElement => !!t && !t.hasAttribute('disabled'));
	const at = triggers.indexOf(found.trigger);
	const to = event.key === 'Home' ? triggers[0] : event.key === 'End' ? triggers.at(-1) : triggers[(at + (event.key === 'ArrowDown' ? 1 : -1) + triggers.length) % triggers.length];
	to?.focus();
	return true;
}
