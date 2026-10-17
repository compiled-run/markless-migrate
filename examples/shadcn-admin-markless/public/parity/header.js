// The fixed header's scroll state (components/layout/header.tsx in the old app): past 10px of scroll it takes a
// shadow and a blurred backdrop. A static script because Markless 0.4.0 runs no attach= at load; it only edits
// the classes of elements the page rendered.
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
})();
