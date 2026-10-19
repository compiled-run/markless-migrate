/** Focus what a state write is about to render (a field array's new input): retried until it is in the page. */
export function focusSoon(selector: string, tries = 20): void {
	const el = document.querySelector<HTMLElement>(selector);
	if (el) el.focus();
	else if (tries > 0) setTimeout(() => focusSoon(selector, tries - 1), 10);
}
