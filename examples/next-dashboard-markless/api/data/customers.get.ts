import type { EndpointHttpContext } from '@markless/router';
import { customersPage } from '../../server/pages.ts';
import { signedIn, unauthorized } from '../../server/guard.ts';

export default async function customers(http: EndpointHttpContext) {
	if (!(await signedIn(http))) return unauthorized();
	return Response.json(await customersPage(http.url.searchParams.get('query') ?? ''));
}
