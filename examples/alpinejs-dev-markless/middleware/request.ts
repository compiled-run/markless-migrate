import type { MiddlewareHttpContext } from '@markless/router';
import { LOCKED_COMPONENTS, PAGE_ROUTES } from '../generated/routes.ts';
import SITEMAP from '../content/endpoints/sitemap.xml?raw';

const PAGES = new Set(PAGE_ROUTES);
const LOCKED = new Set(LOCKED_COMPONENTS);
// The old site's GitHub sign-in: its OAuth app, sending the visitor back to alpinejs.dev.
const GITHUB_CLIENT = 'bccaeb7715c75b7341c5';
// The old server names its own redirect targets by the site's configured URL, not the requested host.
const SITE = 'http://alpinejs.dev';

// alpinejs.dev's server answers every path that is not a page with a redirect (or a 404 under /component and /cdn-cgi).
export default function request({ url }: MiddlewareHttpContext) {
	const path = url.pathname.replace(/(.)\/+$/, '$1');
	if (path === '/sitemap.xml') return new Response(SITEMAP, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
	if (PAGES.has(path) || /^\/(build|img|images|port|assets|_markless|_nitro|@)/.test(path) || /\.(css|js|mjs|map|png|jpg|jpeg|svg|ico|webp|gif|woff2?|txt|xml|json)$/.test(path)) return;
	if (path === '/login/github') {
		const state = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 40);
		const authorize = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT}&redirect_uri=${encodeURIComponent('https://alpinejs.dev/login/github/callback')}&scope=${encodeURIComponent('user:email')}&response_type=code&state=${state}`;
		return redirect(authorize);
	}
	if (LOCKED.has(path)) return redirect(`${SITE}/components`);
	if (path.startsWith('/component/') || path.startsWith('/cdn-cgi/')) return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/html; charset=UTF-8' } });
	return redirect(`${SITE}/essentials/installation`);
}

function redirect(location: string): Response {
	return new Response(`<!DOCTYPE html>\n<html><head><meta charset="UTF-8" /><meta http-equiv="refresh" content="0;url='${location}'" /><title>Redirecting to ${location}</title></head><body>Redirecting to <a href="${location}">${location}</a>.</body></html>`, { status: 302, headers: { location, 'content-type': 'text/html; charset=UTF-8' } });
}
