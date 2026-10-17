// Wakes the Markless runtime once the page has loaded, so the site's boot handler runs.
addEventListener('load', function () {
	document.querySelectorAll('[data-boot]').forEach(function (el) {
		el.dispatchEvent(new Event('boot', { bubbles: true }));
	});
});
