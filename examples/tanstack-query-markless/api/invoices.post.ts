import type { EndpointHttpContext } from '@markless/router';
import { answer, json } from '../lib/endpoint.ts';
import { postInvoice } from '../lib/server.ts';
import type { Invoice } from '../lib/types.ts';

export default async function create(http: EndpointHttpContext) {
	const partial = await json<Partial<Invoice>>(http);
	return answer(http, (ctx) => postInvoice(ctx, partial));
}
