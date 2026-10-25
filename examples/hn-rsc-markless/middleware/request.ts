import type { MiddlewareHttpContext } from '@markless/router';

// Next answers a trailing slash with a 308 to the path without it.
export default function request({ url }: MiddlewareHttpContext) {
	if (url.pathname.length > 1 && url.pathname.endsWith('/'))
		return new Response(null, {
			status: 308,
			headers: { location: url.pathname.replace(/\/+$/, '') + url.search },
		});
}
