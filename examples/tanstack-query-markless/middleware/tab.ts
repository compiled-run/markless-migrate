import type { MiddlewareHttpContext } from '@markless/router';
import { TAB_COOKIE } from '../lib/context.ts';

declare module '@markless/router' {
	interface AppLocals {
		tab?: string;
	}
}

// A new visit or a reload starts a new tab, as the old app's in-memory data started over on every load; navigations inside the app keep it.
export default function tab(http: MiddlewareHttpContext) {
	const headers = http.request.headers;
	// Only the browser loading a document; a router prefetch or fragment fetch, or a redirect it follows, keeps the tab.
	const document =
		http.request.method === 'GET' &&
		headers.get('sec-fetch-mode') === 'navigate' &&
		headers.get('sec-fetch-dest') === 'document' &&
		!headers.get('purpose') &&
		!headers.get('sec-purpose');
	// A visit from outside (typed, bookmarked, a new tab) or a reload starts over; a document load the router falls back to stays in the tab.
	const fresh =
		headers.get('sec-fetch-site') === 'none' ||
		/max-age=0|no-cache/.test(headers.get('cache-control') ?? '') ||
		!(headers.get('cookie') ?? '').includes(`${TAB_COOKIE}=`);
	const loads = document && fresh;
	const id = loads ? crypto.randomUUID() : undefined;
	if (id) {
		http.locals.tab = id;
		http.response.headers.append(
			'set-cookie',
			`${TAB_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax`,
		);
	}
}
