// Server side of lib/data.ts: the store, reached with the tab and delay of the request that asked.
import type { RequestContext } from './context.ts';
import { currentRequest } from './request.ts';
import * as store from './store.ts';
import type { Invoice, UsersSortBy } from './types.ts';

const delays = (ctx: RequestContext) => ({ loader: ctx.loaderDelay, action: 0 });
const tab = (ctx: RequestContext) => store.tabFor(ctx.tab);

export const fetchInvoices = async (ctx: RequestContext) =>
	ctx.leaving ? [] : store.fetchInvoices(tab(ctx), delays(ctx));
export const fetchInvoiceById = (ctx: RequestContext, id: number) =>
	store.fetchInvoiceById(tab(ctx), delays(ctx), id);
export const fetchUsers = async (
	ctx: RequestContext,
	opts: { filterBy?: string; sortBy?: UsersSortBy } = {},
) => (ctx.leaving ? [] : store.fetchUsers(tab(ctx), delays(ctx), opts));
export const fetchUserById = async (ctx: RequestContext, id: number) =>
	ctx.leaving ? undefined : store.fetchUserById(tab(ctx), delays(ctx), id);
export const postInvoice = (ctx: RequestContext, partial: Partial<Invoice>) =>
	store.postInvoice(tab(ctx), delays(ctx), partial, Math.random, Date.now());
export const patchInvoice = (ctx: RequestContext, patch: Partial<Invoice> & { id: number }) =>
	store.patchInvoice(tab(ctx), delays(ctx), patch);
export const auth = (ctx: RequestContext) => tab(ctx).auth;
export const login = (ctx: RequestContext, username: string) =>
	void (tab(ctx).auth = { status: 'loggedIn', username });
export const logout = (ctx: RequestContext) => void (tab(ctx).auth = { status: 'loggedOut' });

/** The page render's own request (lib/request.ts). */
export const here = currentRequest;
