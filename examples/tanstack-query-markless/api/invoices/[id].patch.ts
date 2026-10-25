import type { EndpointHttpContext } from '@markless/router';
import { answer, json } from '../../lib/endpoint.ts';
import { patchInvoice } from '../../lib/server.ts';
import type { Invoice } from '../../lib/types.ts';

export default async function update(http: EndpointHttpContext<{ id: string }>) {
	const patch = await json<Partial<Invoice>>(http);
	return answer(http, (ctx) => patchInvoice(ctx, { ...patch, id: Number(http.params.id) }));
}
