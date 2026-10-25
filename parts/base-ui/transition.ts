// Base UI's transition status: an opening popup carries data-starting-style for one frame; a closing one carries
// data-closed and data-ending-style, and is unmounted once every animation on it has finished.

export function enter(popup: HTMLElement, others: readonly (HTMLElement | null)[] = []): void {
	for (const el of [popup, ...others]) {
		if (!el) continue;
		el.setAttribute('data-open', '');
		el.removeAttribute('data-closed');
		el.removeAttribute('data-ending-style');
		el.setAttribute('data-starting-style', '');
	}
	requestAnimationFrame(() => {
		for (const el of [popup, ...others]) el?.removeAttribute('data-starting-style');
	});
}

export function exit(popup: HTMLElement, others: readonly (HTMLElement | null)[], done: () => void): void {
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
