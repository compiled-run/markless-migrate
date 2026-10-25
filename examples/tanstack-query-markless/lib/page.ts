import type { HttpContext } from '@markless/router';
import { currentRequest } from './request.ts';

/** A fragment request is the router swapping the page in place; anything else on a page path is a document load. */
export const documentLoad = (http: HttpContext) =>
	!new URL(http.request.url).pathname.startsWith('/_markless/');

export function redirect(http: HttpContext, to: string) {
	currentRequest().leaving = true;
	http.response.status = 307;
	http.response.headers.set('location', to);
}
