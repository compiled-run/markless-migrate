import './interactions.ts';

// React Aria's Disclosure and DisclosureGroup (useDisclosure, useDisclosureGroupState): the panel stays in the page,
// hidden="until-found" while collapsed. Expanding marks the trigger aria-expanded, the Disclosure data-expanded and the
// panel aria-hidden="false", shows it at --disclosure-panel-height 0px, sets the variables to its measured size, and to
// auto once its transition ends; collapsing sets them to its size, then 0px, and hides it once that transition ends. A
// group lets one Disclosure be expanded at a time unless it allows several; a browser's find-in-page expands a match's
// panel.
const TRIGGER = 'button[data-rac][slot="trigger"][aria-controls]';

const panelOf = (trigger: Element) => document.getElementById(trigger.getAttribute('aria-controls') ?? '');
const disclosureOf = (trigger: Element) => trigger.closest<HTMLElement>('[data-rac]:not(button)');
// A DisclosureGroup renders its Disclosures as its own children.
const groupOf = (disclosure: Element) => (disclosure.parentElement?.hasAttribute('data-rac') ? disclosure.parentElement : null);

const sized = new WeakMap<HTMLElement, () => void>();
function setSize(panel: HTMLElement, value: string | { width: number; height: number }): void {
	panel.style.setProperty('--disclosure-panel-width', typeof value === 'string' ? value : `${value.width}px`);
	panel.style.setProperty('--disclosure-panel-height', typeof value === 'string' ? value : `${value.height}px`);
}

// What the transition this change started does, then `done`: at once when it starts none.
function afterTransitions(panel: HTMLElement, done: () => void): void {
	sized.get(panel)?.();
	const running = panel.getAnimations();
	if (!running.length) return done();
	let cancelled = false;
	sized.set(panel, () => (cancelled = true));
	void Promise.allSettled(running.map((a) => a.finished)).then(() => {
		if (!cancelled) done();
	});
}

function expand(trigger: HTMLElement, panel: HTMLElement, on: boolean): void {
	trigger.setAttribute('aria-expanded', String(on));
	const disclosure = disclosureOf(trigger);
	if (on) disclosure?.setAttribute('data-expanded', 'true');
	else disclosure?.removeAttribute('data-expanded');
	panel.setAttribute('aria-hidden', String(!on));
	if (on) {
		setSize(panel, '0px');
		panel.removeAttribute('hidden');
		setSize(panel, { width: panel.scrollWidth, height: panel.scrollHeight });
		afterTransitions(panel, () => setSize(panel, 'auto'));
	} else {
		setSize(panel, { width: panel.scrollWidth, height: panel.scrollHeight });
		void panel.offsetHeight;
		setSize(panel, '0px');
		afterTransitions(panel, () => panel.setAttribute('hidden', 'until-found'));
	}
}

// The converter marks a group that let several be expanded on the old page (convert's captureAccordions).
const allowsMultiple = (group: HTMLElement) => group.hasAttribute('data-mm-multiple');

function toggle(trigger: HTMLElement): void {
	const panel = panelOf(trigger);
	if (!panel) return;
	// The panel says whether it is expanded: the page may bind the trigger's aria-expanded to its own state, set first.
	const on = panel.hasAttribute('aria-hidden') ? panel.getAttribute('aria-hidden') === 'true' : panel.hasAttribute('hidden');
	const disclosure = disclosureOf(trigger);
	const group = disclosure && groupOf(disclosure);
	if (on && group && !allowsMultiple(group))
		for (const other of group.querySelectorAll<HTMLElement>(`${TRIGGER}[aria-expanded="true"]`)) {
			const otherPanel = panelOf(other);
			if (other !== trigger && otherPanel && groupOf(disclosureOf(other)!) === group) expand(other, otherPanel, false);
		}
	expand(trigger, panel, on);
}

export function click(target: Element): boolean {
	const trigger = target.closest<HTMLElement>(TRIGGER);
	if (!trigger || trigger.hasAttribute('disabled') || trigger.getAttribute('aria-disabled') === 'true' || !panelOf(trigger)?.matches('[role="group"]')) return false;
	toggle(trigger);
	return true;
}

// Find-in-page reveals a match in a hidden="until-found" panel: React Aria expands its Disclosure.
if (typeof document !== 'undefined')
	document.addEventListener(
		'beforematch',
		(event) => {
			const panel = event.target as HTMLElement;
			const trigger = panel.id ? document.querySelector<HTMLElement>(`${TRIGGER}[aria-controls="${CSS.escape(panel.id)}"]`) : null;
			if (trigger && trigger.getAttribute('aria-expanded') !== 'true') toggle(trigger);
		},
		true,
	);
