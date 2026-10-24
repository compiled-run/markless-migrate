// The star count as buttons.js shows it: asked of GitHub's API in the browser, and left out when the API does not
// answer (rate limited, offline). On a framed host (.ghb-frame) buttons.js draws into an iframe it sizes to the button,
// rounded up to a device pixel; the host stands in for that iframe, so its width is measured as buttons.js measures it.

const REPO = 'https://api.github.com/repos/bigskysoftware/htmx';

export async function countStars(host: HTMLElement): Promise<void> {
	const framed = host.classList.contains('ghb-frame');
	if (framed) relabel(host.querySelector<HTMLAnchorElement>('.ghb-count'));
	else await count(host);
	const widget = host.querySelector('.ghb-widget');
	if (!framed || !widget) return;
	const ratio = window.devicePixelRatio;
	const width = widget.getBoundingClientRect().width;
	host.style.setProperty('width', `${ratio > 1 ? Math.ceil(width * ratio) / ratio : Math.ceil(width)}px`);
}

// The name holds the count as shown, so the visible text is part of it (buttons.js's sits in a closed shadow root).
function relabel(link: HTMLAnchorElement | null): void {
	const shown = link?.textContent ?? '';
	if (!link || !shown) return;
	const stars = Number(shown.replace(/,/g, ''));
	link.setAttribute('aria-label', `${shown} ${stars < 2 ? 'stargazer' : 'stargazers'} on GitHub`);
}

// On an example page buttons.js asks from inside its own iframe, so the page itself never asks GitHub: the framed host
// keeps the count read at convert time (data-markless-embed-live).
async function count(host: HTMLElement): Promise<void> {
	const link = host.querySelector<HTMLAnchorElement>('.ghb-count');
	try {
		const response = await fetch(REPO);
		const stars = response.ok ? ((await response.json()) as { stargazers_count?: unknown }).stargazers_count : undefined;
		if (link && typeof stars === 'number') {
			link.textContent = String(stars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
			relabel(link);
			host.setAttribute('data-counted', '');
		}
	} catch {
		// No count, as buttons.js leaves it when the request fails.
	}
}
