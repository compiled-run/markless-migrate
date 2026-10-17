// The header's controls are told apart by data attributes, so one handler per event type serves them all.
const flyout = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('[data-flyout]') : null);

/** The flyout a mouseover entered or a mouseout left: the pointer crossed its edge, as mouseenter and mouseleave report. */
export function crossed(event: MouseEvent): string | undefined {
	const root = flyout(event.target);
	return root && !root.contains(event.relatedTarget as Node | null) ? root.dataset.flyout : undefined;
}

/** The flyout focus left, when it moved outside it (VitePress's useFlyout closes on that). */
export function blurred(event: FocusEvent): string | undefined {
	const root = flyout(event.target);
	return root && !root.contains(event.relatedTarget as Node | null) ? root.dataset.flyout : undefined;
}

/** The flyout or menu button a click toggles. */
export function toggled(target: EventTarget | null): string | undefined {
	const button = target instanceof Element ? target.closest('button') : null;
	if (!button) return undefined;
	return button.closest<HTMLElement>('[data-toggle]')?.dataset.toggle ?? (button.getAttribute('aria-haspopup') === 'true' ? flyout(button)?.dataset.flyout : undefined);
}
