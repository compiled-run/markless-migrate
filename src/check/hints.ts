const SEO_HINTS: Record<string, string> = {
	title: 'Set the same <title> in the new route.',
	canonical: 'Emit the same <link rel="canonical"> href; a changed canonical moves the page in search results.',
	'meta:description': 'Set the same <meta name="description"> content.',
	'meta:robots': 'Set the same <meta name="robots">; a missing or changed value can de-index the page.',
	'html:lang': 'Set the same lang attribute on <html>; screen readers and search engines use it to pick the language.',
	'html:dir': 'Set the same dir attribute on <html>.',
};

export function seoHint(key: string): string {
	const base = key.replace(/#\d+$/, '');
	if (SEO_HINTS[base]) return SEO_HINTS[base];
	if (base.startsWith('hreflang:')) return 'Emit a <link rel="alternate" hreflang> for every locale the old route listed, with the same href.';
	if (base.startsWith('meta:og:') || base.startsWith('meta:twitter:')) return `Set the same <meta> ${base.slice(5)} tag; link previews read it.`;
	if (base.startsWith('jsonld')) return 'Emit the same JSON-LD structured data (compared as parsed data, so key order and whitespace do not matter).';
	return 'Emit the same head tag as the old route.';
}

export const HINTS = {
	status: 'Return the same status code. If the old route answered 404, make the new not-found handler send 404, not 200: a soft 404 gets indexed.',
	redirects: 'Recreate the redirect with the same status (301/308 permanent, 302/307 temporary) and the same target.',
	contentType: 'Serve the route with the same Content-Type.',
	aria: 'The accessibility tree differs: check headings, landmarks, link and button names and image alt text in the new markup.',
	text: 'The visible text differs: port the missing copy or remove the extra copy.',
	visual: 'Pixels differ in the named region. If the DOM and CSS checks pass, look at fonts, images and stacking there.',
	visualSize: 'The page has a different size: an element is taller, shorter or missing. Compare the elements inside the region.',
	assetMissing: 'Serve this file at the same URL in the new app (for example from its public directory) or redirect it; other sites and caches link to it.',
	assetType: 'Serve the file with the same Content-Type.',
	pageLoad: 'The page did not finish loading in time; check it again, and look for a request that never answers (often a third-party stylesheet or font).',
	assetDimensions: 'Serve the same image: its decoded size differs.',
	assetBroken: 'This URL fails on the new side; fix the reference or serve the file.',
	image: 'The image at this position in the page loads a different picture or fails to load.',
	fonts: 'A different font renders this text. Port the @font-face rule with the same font file (compared by content, not by family name) and the font-family stack, and make sure the file is served.',
	css: 'Port the rule that sets this property for this element in the old stylesheet; computed values must match.',
	cssState: 'The old stylesheet styles this state or condition; port that rule so the new page matches while it holds.',
	visualState: 'The page looks different in this state or condition. Compare the computed-style failures for the same state first.',
	axe: 'axe-core finds this accessibility violation on the new page more often than on the old one. Fix the elements it names:',
	landmarks: 'The page landmarks differ: keep the same header, nav, main, footer, aside and labelled regions, with the same names.',
	focusOrder: 'Tab reaches elements in a different order. Keep the old DOM order for interactive elements, remove positive tabindex values, and keep buttons and links as real buttons and links.',
	reducedMotion: 'An animation runs although the visitor asked for reduced motion. Wrap it in @media (prefers-reduced-motion: no-preference), as the old page does.',
	lang: 'Set the same lang attribute on <html>; screen readers pick their voice from it and search engines the language.',
	dir: 'Set the same dir attribute on <html> (rtl for Arabic, Hebrew, Persian and Urdu), so the layout mirrors as it did.',
	formats: 'Format dates and numbers for this locale as the old page did, for example with Intl.DateTimeFormat and Intl.NumberFormat and the same locale and options.',
	negotiation: 'Send a browser to the same locale by its Accept-Language header as the old app did (the http check compares the redirect status).',
	behaviour: 'Doing this on the new page gives a different result. Port the event handler, form action or state update behind this control so the URL, the page, the requests and the announcements match.',
	storage: 'The new page keeps different keys in the browser (localStorage, sessionStorage, IndexedDB, cookies). Store the same keys under the same names, or what the old app saved (a theme, a cart, a session) is lost or not found after the switch.',
	coverage: 'No journey used this control on the old page, so nothing proves the new page does the same with it. Raise --journey-budget (or --max-journeys) until check reaches it; if a person decides it needs no check, they accept it with `markless-migrate accept <id> --reason "..."`.',
	keyboard: 'This keyboard path gives a different result. Use a real <button> or <a href>, or handle Enter and Space as the old control did, and keep focus where it went.',
	networkChanged: 'The new page sends this request with a different query or body. Send the same parameters and fields as the old page (field lists, filters, locale, page size), so the backend returns the same data.',
	networkEndpoint: 'The new page calls a different endpoint for this data. Call the same API path as the old page, or confirm the new path returns exactly the same data and accept the change deliberately.',
	networkMissing: 'The old page makes this request in the browser and the new one does not. Port the code that fetches it, or the page loses what the response fed.',
	networkServerMissing: 'The old server makes this request while rendering the page and the new one does not. If the data is now hardcoded or cached elsewhere, it will go stale when the CMS or API changes: fetch it as the old page did.',
	networkExtra: 'The new page makes a request the old one never made. Remove it, or make sure it is intended (it adds load on the backend and may change data).',
	networkCount: 'The new page makes this request a different number of times. Fetch it once, as the old page did: share the result or deduplicate the call.',
	networkFields: 'The old page shows these fields of the response and the new page does not. Render them, or request them if the new query no longer asks for them.',
	networkRecorder: 'Start the server with the request recorder so its requests are compared: NODE_OPTIONS="--import <markless-migrate>/src/check/record-server.mjs" (run `markless-migrate recorder` for the exact line).',
	dataMissing: 'Run check --data record first: it saves what the old app fetched for each route under .migrate/data/, which --data replay then serves to both apps.',
	accessGranted: 'The new app lets this role see a page the old app kept from it. Port the old guard (middleware, layout or page check) with the same condition, so the new app also redirects to the login page or answers 401/403.',
	accessDenied: 'The new app turns this role away from a page the old app showed it. Check that the new app reads the same session cookie and grants the same roles.',
	loginRedirect: 'The new app sends a visitor who is not allowed in to a different place. Redirect to the same login route, with the same query (for example the return path), as the old app.',
	loginOld: 'The login script failed on the old app, so this role has no reference and its routes were not checked. Fix the steps in the auth file (selectors, credentials in the environment) or pass a storageState file.',
	loginNew: 'The login script failed on the new app: port the login page and its form handler so the same steps sign in, or give this side its own storageState file.',
	cookieAttributes: 'The session cookie is set with different attributes. Set the same Path, Domain, HttpOnly, Secure and SameSite as the old app, and keep it a session or persistent cookie as it was: they decide which requests carry the session and whether scripts can read it.',
	cookieMissing: 'The old app sets this cookie when the role signs in and the new one does not. Set it with the same name, or existing sessions and anything that reads it break at the switch.',
	cookieExtra: 'The new app sets a cookie on sign-in that the old one did not. Remove it, or make sure it is intended.',
	weight: 'The new route downloads or runs more JavaScript at load than the old one. Look at the scripts only the new route loads.',
	responsiveness: 'The first time a visitor uses this control the new page answers later than the old one, or fetches code to answer. Make the handler run without fetching code on the interaction (Markless resumes from code the page already has), keep long tasks off the first interaction, and compare against the warm figure: a big gap is start-up work the first interaction pays for.',
	navigation: 'Following this link shows the next page later on the new app than on the old one. A full page load where the old app navigated in the page, a cold server function where the old app served a static file, or a missing prefetch are the usual causes: prerender or cache the target page, or prefetch it.',
} as const;
