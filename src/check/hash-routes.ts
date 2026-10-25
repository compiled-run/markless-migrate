/** How the old app routes pages: `hash` when its router keeps the route after `#` (`/#/item/7`), as React Router's hashHistory does. */
export type OldRouting = 'hash';

/** The address a path-routed port shows the same page at: `/#/item/7?page=2` is `/item/7?page=2`; any other address is kept. */
export function routePath(url: string, routing: OldRouting | undefined): string {
	if (routing !== 'hash') return url;
	const at = new URL(url);
	if (!at.hash.startsWith('#/')) return url;
	const inner = new URL(at.hash.slice(1), at.origin);
	// history 2 and 3 (React Router 2 and 3) key each entry's state in the hash's query: `/#/jobs?_k=uvja5u`.
	if (/^[a-z0-9]{4,10}$/.test(inner.searchParams.get('_k') ?? '')) inner.searchParams.delete('_k');
	return `${at.origin}${inner.pathname}${inner.search}${inner.hash}`;
}

/** A route of the old app's that its hash router serves from the shell at `/`, rather than a file the host serves at its path. */
export function shellRoute(route: string, routing: OldRouting | undefined): boolean {
	return routing === 'hash' && route !== '/' && !/\.[a-z0-9]+$/i.test(route.split(/[?#]/)[0]!);
}

// YAML quotes `#/about` for its `#`; the path alone is quoted only when it holds what YAML would quote it for.
const YAML_QUOTED = /^[\s!&*{}[\],|>@`'"%-]|: | #|[\s:]$/;

/** Link addresses in an accessibility snapshot, read as routes: `/url: "#/about"` is `/url: /about`. */
export function routeLinks(aria: string, routing: OldRouting | undefined): string {
	if (routing !== 'hash') return aria;
	return aria.replace(/(\/url: )(?:"#(\/(?:[^"\\]|\\.)*)"|#(\/\S*))/g, (_, label: string, quoted: string | undefined, bare: string | undefined) => {
		const path = quoted !== undefined ? (JSON.parse(`"${quoted}"`) as string) : bare!;
		return `${label}${YAML_QUOTED.test(path) ? JSON.stringify(path) : path}`;
	});
}

const routings = new WeakMap<object, OldRouting>();

/** Remembers how the app open in `page` routes, for the code that reads its addresses back. */
export function setRouting(page: object, routing: OldRouting | undefined): void {
	if (routing) routings.set(page, routing);
}

/** The address `page` shows, read as a route. */
export function shownUrl(page: { url(): string }): string {
	return routePath(page.url(), routings.get(page));
}

/** Where a link's `href` on `page` leads, read as a route. */
export function linkUrl(href: string, base: string, page: object): URL {
	return new URL(routePath(new URL(href, base).href, routings.get(page)));
}

export function pageRouting(page: object): OldRouting | undefined {
	return routings.get(page);
}
