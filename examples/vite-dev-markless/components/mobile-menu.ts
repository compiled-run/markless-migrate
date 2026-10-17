const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
let trap: ((event: KeyboardEvent) => void) | undefined;

export function lockBodyScroll(): void {
	const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
	const style = document.body.style;
	style.overflow = 'hidden';
	style.position = 'fixed';
	style.width = '100%';
	style.top = '0';
	if (scrollbarWidth > 0) style.paddingRight = `${scrollbarWidth}px`;
}

export function unlockBodyScroll(): void {
	const style = document.body.style;
	style.overflow = '';
	style.position = '';
	style.width = '';
	style.top = '';
	style.paddingRight = '';
}

export function activateFocusTrap(): void {
	const menu = document.getElementById('mobile-menu');
	if (!menu) return;
	// The state write that opens the dialog commits after this handler returns.
	const whenShown = (run: () => void) => {
		if (!menu.hidden) return run();
		const observer = new MutationObserver(() => {
			if (menu.hidden) return;
			observer.disconnect();
			run();
		});
		observer.observe(menu, { attributes: true, attributeFilter: ['hidden'] });
	};
	whenShown(() => {
		const focusable = [...menu.querySelectorAll<HTMLElement>(FOCUSABLE)];
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!first || !last) return;
		first.focus();
		deactivateFocusTrap();
		trap = (event) => {
			if (event.key !== 'Tab') return;
			if (event.shiftKey && document.activeElement === first) {
				last.focus();
				event.preventDefault();
			} else if (!event.shiftKey && document.activeElement === last) {
				first.focus();
				event.preventDefault();
			}
		};
		document.addEventListener('keydown', trap);
	});
}

export function deactivateFocusTrap(): void {
	if (trap) document.removeEventListener('keydown', trap);
	trap = undefined;
}
