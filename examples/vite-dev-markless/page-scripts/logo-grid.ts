// LogoGrid.vue's overflow check, at load and on every resize: the six logos (6 x 120px plus 5 x 80px gaps) scroll once they no longer fit.
const CONTENT_WIDTH = 6 * 120 + 5 * 80;

export function logoGrid(container: HTMLElement): void {
	let scrolling = false;
	const check = () => {
		const next = CONTENT_WIDTH > container.offsetWidth;
		if (next === scrolling) return;
		scrolling = next;
		container.dispatchEvent(new CustomEvent('logofit', { detail: next, bubbles: true }));
	};
	check();
	new ResizeObserver(check).observe(container);
}
