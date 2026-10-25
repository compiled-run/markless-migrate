import type { EndpointHttpContext } from '@markless/router';
import { answer } from '../lib/endpoint.ts';
import { fetchInvoices } from '../lib/server.ts';

export default function invoices(http: EndpointHttpContext) {
	return answer(http, fetchInvoices);
}
