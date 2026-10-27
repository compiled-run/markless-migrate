// Base UI's transition status: an opening popup carries data-starting-style for one frame; a closing one carries
// data-closed and data-ending-style, and is unmounted once every animation on it has finished.

// The Popup's own inline transition while it starts (getDisabledMountTransitionStyles sets transition: none then).
const starting = new WeakMap<HTMLElement, string>();
function started(popup: HTMLElement): void {
	const before = starting.get(popup);
	if (before === undefined) return;
	starting.delete(popup);
	popup.style.transition = before;
}

export function enter(popup: HTMLElement, others: readonly (HTMLElement | null)[] = [], disableTransitions = false): void {
	for (const el of [popup, ...others]) {
		if (!el) continue;
		el.setAttribute('data-open', '');
		el.removeAttribute('data-closed');
		el.removeAttribute('data-ending-style');
		el.setAttribute('data-starting-style', '');
	}
	if (disableTransitions) {
		if (!starting.has(popup)) starting.set(popup, popup.style.transition);
		popup.style.transition = 'none';
	}
	requestAnimationFrame(() => {
		for (const el of [popup, ...others]) el?.removeAttribute('data-starting-style');
		started(popup);
	});
}

export function exit(popup: HTMLElement, others: readonly (HTMLElement | null)[], done: () => void): void {
	started(popup);
	for (const el of [popup, ...others]) {
		if (!el) continue;
		el.removeAttribute('data-open');
		el.setAttribute('data-closed', '');
		el.setAttribute('data-ending-style', '');
	}
	requestAnimationFrame(() => {
		Promise.all(popup.getAnimations().map((a) => a.finished))
			.catch(() => {})
			.then(done);
	});
}
