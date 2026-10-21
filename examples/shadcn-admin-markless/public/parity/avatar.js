// Radix Avatar (components/ui/avatar.tsx in the old app): each avatar fetches its image as the page loads, and the
// <img> takes the fallback's place only once the image has loaded; one that fails keeps showing the initials.
(() => {
	for (const root of document.querySelectorAll('[data-slot=avatar][data-avatar-src]')) {
		const probe = new window.Image();
		probe.onload = () => {
			const img = document.createElement('img');
			img.setAttribute('data-slot', 'avatar-image');
			img.className = 'aspect-square size-full';
			img.alt = root.getAttribute('data-avatar-alt') ?? '';
			img.src = probe.src;
			root.querySelector('[data-slot=avatar-fallback]')?.remove();
			root.prepend(img);
		};
		probe.src = root.getAttribute('data-avatar-src');
	}
})();
