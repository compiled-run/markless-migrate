// The fixed header's scroll state (components/layout/header.tsx in the old app): past 10px of scroll it takes a
// shadow and a blurred backdrop. Also the layout's document shortcuts: Cmd/Ctrl+B toggles the sidebar
// (SidebarProvider), Cmd/Ctrl+K toggles the command palette (SearchProvider). A static script: it only edits classes
// and presses the page's own buttons.
(() => {
	const BACKDROP = ['after:absolute', 'after:inset-0', 'after:-z-10', 'after:bg-background/20', 'after:backdrop-blur-lg'];
	const update = () => {
		const header = document.querySelector('header.header-fixed');
		if (!header) return;
		const scrolled = (document.body.scrollTop || document.documentElement.scrollTop) > 10;
		header.classList.toggle('shadow', scrolled);
		header.classList.toggle('shadow-none', !scrolled);
		const inner = header.firstElementChild;
		if (inner) for (const c of BACKDROP) inner.classList.toggle(c, scrolled);
	};
	document.addEventListener('scroll', update, { passive: true });
	update();
	document.addEventListener('keydown', (event) => {
		if (!(event.metaKey || event.ctrlKey)) return;
		if (event.key === 'b') {
			const trigger = document.querySelector('[data-slot=sidebar-trigger]');
			if (!trigger) return;
			event.preventDefault();
			trigger.click();
		} else if (event.key === 'k') {
			const palette = document.getElementById('command-palette');
			if (!palette) return;
			event.preventDefault();
			if (!palette.hidden) palette.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			else [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Search'))?.click();
		}
	});
})();
