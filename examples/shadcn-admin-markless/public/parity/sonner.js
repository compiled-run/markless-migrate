// sonner's enter animation: a toast mounts with data-mounted="false" and flips to "true" a frame later, so the CSS
// slides it in. The toaster's slots are rendered once and shown or hidden, so this watches them being shown.
(() => {
	const mount = (toast) => {
		toast.setAttribute('data-mounted', 'false');
		void toast.offsetHeight;
		requestAnimationFrame(() => toast.setAttribute('data-mounted', 'true'));
	};
	const watch = (root) => {
		for (const toast of root.querySelectorAll('[data-sonner-toast]')) if (!toast.hidden) toast.setAttribute('data-mounted', 'true');
		new MutationObserver((records) => {
			for (const r of records) {
				const toast = r.target;
				if (!(toast instanceof HTMLElement) || !toast.hasAttribute('data-sonner-toast')) continue;
				if (toast.hidden) toast.setAttribute('data-mounted', 'false');
				else if (r.oldValue !== null) mount(toast);
			}
		}).observe(root, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
	};
	for (const root of document.querySelectorAll('[data-sonner-toaster]')) watch(root);
})();
