// The move-before demo's boosted "View Details" link and its hx-preserve video, as htmx ran them: the link fetches the
// next page (the same GET, header and redirect htmx's request makes), swaps the page's content for the response's,
// pushes its URL and scrolls to the top; the element with the same id as a preserved one is replaced by the one already
// on the page, moved with moveBefore() where the browser has it, so a playing video keeps playing. Back puts the content
// the page showed back, preserving the video the same way; Forward again is Markless Router's, which renders the page.

type Moving = Element & { moveBefore?: (node: Node, child: Node | null) => void };

const pages = new Map<string, Node[]>();
let current = '';
let listening = false;

function move(parent: Node, node: Element, before: Node | null) {
	const target = parent as Moving;
	if (typeof target.moveBefore === 'function' && node.isConnected && (parent as Node).isConnected) target.moveBefore(node, before);
	else parent.insertBefore(node, before);
}

// Puts `content` in place of the main element's children, keeping each preserved element of the page in place of its namesake.
function swap(main: Element, content: Node[]) {
	const preserved = [...main.querySelectorAll('[hx-preserve][id]')];
	// htmx's pantry: the preserved elements wait outside the swapped content, moved rather than removed.
	const pantry = document.createElement('div');
	pantry.hidden = true;
	document.body.append(pantry);
	for (const element of preserved) {
		// The leaving content keeps a slot with the element's id, where it comes back on Back.
		const slot = document.createElement('span');
		slot.id = element.id;
		element.before(slot);
		move(pantry, element, null);
	}
	pages.set(current, [...main.childNodes]);
	main.replaceChildren(...content);
	for (const element of preserved) {
		const slot = main.querySelector(`[id="${CSS.escape(element.id)}"]`);
		if (slot && slot !== element && slot.parentNode) {
			move(slot.parentNode, element, slot);
			slot.remove();
		}
	}
	pantry.remove();
}

function onPopState(event: PopStateEvent) {
	const main = document.querySelector('main');
	const content = pages.get(location.pathname);
	if (!(event.state as { boosted?: boolean } | null)?.boosted || !main || !content) return;
	swap(main, content);
	current = location.pathname;
}

/** Runs a click on a boosted link the caller has already kept from navigating. */
export async function boost(href: string) {
	const main = document.querySelector('main');
	if (!main) {
		location.assign(href);
		return;
	}
	const response = await fetch(href, { headers: { 'HX-Request': 'true', 'HX-Boosted': 'true', 'HX-Current-URL': location.href } }).catch(() => undefined);
	if (!response?.ok) {
		location.assign(href);
		return;
	}
	const next = new DOMParser().parseFromString(await response.text(), 'text/html');
	const incoming = next.querySelector('main');
	if (!incoming) {
		location.assign(href);
		return;
	}
	const url = new URL(response.url || href, location.href);
	if (!listening) {
		listening = true;
		window.addEventListener('popstate', onPopState);
	}
	history.replaceState({ ...(history.state as object | null), boosted: true }, '', location.href);
	current = location.pathname;
	swap(main, [...document.adoptNode(incoming).childNodes]);
	history.pushState({ boosted: true }, '', url.pathname + url.search + url.hash);
	current = location.pathname;
	if (next.title) document.title = next.title;
	window.scrollTo(0, 0);
}
