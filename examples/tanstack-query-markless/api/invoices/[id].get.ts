import type { EndpointHttpContext } from '@markless/router';
import { answer } from '../../lib/endpoint.ts';
import { fetchInvoiceById } from '../../lib/server.ts';

export default function invoice(http: EndpointHttpContext<{ id: string }>) {
	return answer(http, (ctx) => fetchInvoiceById(ctx, Number(http.params.id)));
}
