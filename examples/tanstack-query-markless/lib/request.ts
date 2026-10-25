// The request each page render belongs to, on the server, so the mock API answers for that visitor's tab without the recipes passing it along.
import type { HttpContext } from '@markless/router';
import { requestContext, SANDBOX_DEFAULTS, type RequestContext } from './context.ts';

type Store = { getStore(): RequestContext | undefined; enterWith(value: RequestContext): void };
const store: Store | undefined = import.meta.env.SSR
	? new (await import('node:async_hooks')).AsyncLocalStorage<RequestContext>()
	: undefined;

/** Called in a page body (server only): what this render's recipes read is answered for this request. */
export function bindRequest(http: HttpContext): RequestContext {
	const ctx = requestContext(http.request, http.locals.tab);
	store?.enterWith(ctx);
	return ctx;
}

export function currentRequest(): RequestContext {
	return store?.getStore() ?? { tab: '', loaderDelay: 0, sandbox: { ...SANDBOX_DEFAULTS } };
}
