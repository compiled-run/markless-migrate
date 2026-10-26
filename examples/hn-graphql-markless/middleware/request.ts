import type { MiddlewareHttpContext } from '@markless/router';
import { backendUrl } from '../lib/graphql.ts';

// The old Express server's own routes (Apollo at /graphql, Passport's login, register and logout) stay that server's.
const BACKEND = /^\/(graphql|login|register|logout)$/;

export default async function request(http: MiddlewareHttpContext) {
	const { url, request } = http;
	// Next's trailing-slash 308; Express's own /news route matched /news/ before Next saw it.
	if (url.pathname.length > 1 && url.pathname.endsWith('/') && url.pathname !== '/news/')
		return new Response(null, {
			status: 308,
			headers: { location: url.pathname.replace(/\/+$/, '') + url.search },
		});
	if (!BACKEND.test(url.pathname)) return;
	if (url.pathname !== '/graphql' && url.pathname !== '/logout' && request.method !== 'POST')
		return;
	const headers = new Headers(request.headers);
	headers.delete('host');
	const answer = await fetch(backendUrl(url.pathname + url.search), {
		method: request.method,
		headers,
		body:
			request.method === 'GET' || request.method === 'HEAD'
				? undefined
				: await request.arrayBuffer(),
		redirect: 'manual',
	});
	const out = new Headers();
	for (const [name, value] of answer.headers)
		if (
			!/^(content-encoding|content-length|transfer-encoding|connection|set-cookie)$/i.test(
				name,
			)
		)
			out.set(name, value);
	for (const cookie of answer.headers.getSetCookie()) out.append('set-cookie', cookie);
	return new Response(answer.body, { status: answer.status, headers: out });
}
