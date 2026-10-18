import type { MiddlewareHttpContext } from '@markless/router';
import { cookie, cookieNames, csrfToken, readCookie, sessionFor } from '../server/session.ts';
import { listInvoices, seed } from '../server/routes.ts';
import { createPage, customersPage, editPage, invoicesPage } from '../server/pages.ts';
import { remember } from '../server/prefetch.ts';

// The old proxy matcher: everything but /api, the framework's static files and .png files.
const UNMATCHED = /^\/(api(\/|$)|build\/|assets\/|fonts\/|_next\/static|_next\/image)|\.png$/;

export default async function request(http: MiddlewareHttpContext) {
	const { url, request } = http;
	if (url.pathname.length > 1 && url.pathname.endsWith('/')) return new Response(null, { status: 308, headers: { location: url.pathname.replace(/\/+$/, '') + url.search } });
	if (UNMATCHED.test(url.pathname)) return;
	const names = cookieNames(url);
	const cookies: string[] = [];
	if (!readCookie(request, names.csrf)) cookies.push(cookie(names.csrf, csrfToken(), url));
	if (!readCookie(request, names.callbackUrl)) cookies.push(cookie(names.callbackUrl, url.origin, url));
	const session = await sessionFor(request, url);
	const isLoggedIn = Boolean(session);
	const redirect = (location: string, status: number) => {
		const headers = new Headers({ location });
		for (const c of cookies) headers.append('set-cookie', c);
		return new Response(null, { status, headers });
	};
	if (url.pathname.startsWith('/dashboard')) {
		if (!isLoggedIn) return redirect(`/login?callbackUrl=${encodeURIComponent(url.href)}`, 307);
	} else if (isLoggedIn) {
		return redirect(new URL('/dashboard', url).href, 302);
	}
	if (request.method === 'GET' && url.pathname === '/query') return withCookies(await listInvoices(), cookies);
	if (request.method === 'GET' && url.pathname === '/seed') return withCookies(await seed(), cookies);
	for (const c of cookies) http.response.headers.append('set-cookie', c);
	const query = url.searchParams.get('query') ?? '';
	if (request.method === 'GET' && url.pathname === '/dashboard/invoices') {
		const page = Number(url.searchParams.get('page')) || 1;
		remember(request, `invoices:${query}:${page}`, await invoicesPage(query, page).catch(() => undefined));
	}
	if (request.method === 'GET' && url.pathname === '/dashboard/customers') remember(request, `customers:${query}`, await customersPage(query).catch(() => undefined));
	if (request.method === 'GET' && url.pathname === '/dashboard/invoices/create') remember(request, 'create', await createPage().catch(() => undefined));
	const edit = request.method === 'GET' ? /^\/dashboard\/invoices\/([^/]+)\/edit$/.exec(url.pathname) : null;
	if (edit) {
		const page = await editPage(edit[1]!).catch(() => undefined);
		remember(request, `edit:${edit[1]}`, page);
		// Next's notFound(): the edit page of an invoice that does not exist answers 404.
		if (page === null) (http.locals as { notFound?: boolean }).notFound = true;
	}
}

function withCookies(response: Response, cookies: string[]): Response {
	for (const c of cookies) response.headers.append('set-cookie', c);
	return response;
}
