// Radix's Presence: an element leaving stays in the page while an exit animation its new state starts runs, and goes when
// that animation of its own ends or is cancelled. With no new animation it goes at once.

const animationName = (el: Element) => getComputedStyle(el).animationName || 'none';
const leaving = new WeakMap<Element, () => void>();

/** Sets the closed state and calls `gone` once the element's own exit animation (if the state starts one) is over. */
export function leave(el: HTMLElement, close: () => void, gone: () => void): void {
	leaving.get(el)?.();
	const before = animationName(el);
	close();
	const now = animationName(el);
	if (now === 'none' || now === before || getComputedStyle(el).display === 'none') {
		gone();
		return;
	}
	const ended = (event: AnimationEvent) => {
		if (event.target !== el || !now.split(',').map((n) => n.trim()).includes(event.animationName)) return;
		stop();
		gone();
	};
	const stop = () => {
		el.removeEventListener('animationend', ended);
		el.removeEventListener('animationcancel', ended);
		leaving.delete(el);
	};
	el.addEventListener('animationend', ended);
	el.addEventListener('animationcancel', ended);
	leaving.set(el, stop);
}

/** Stops a pending exit: the element was opened again while its exit animation ran. */
export function stay(el: Element): void {
	leaving.get(el)?.();
}
