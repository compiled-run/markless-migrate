import type { EndpointHttpContext } from '@markless/router';
import { invoicesPage } from '../../server/pages.ts';
import { signedIn, unauthorized } from '../../server/guard.ts';

export default async function invoices(http: EndpointHttpContext) {
	if (!(await signedIn(http))) return unauthorized();
	return Response.json(await invoicesPage(http.url.searchParams.get('query') ?? '', Number(http.url.searchParams.get('page')) || 1));
}
