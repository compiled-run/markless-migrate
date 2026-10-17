import type { EndpointHttpContext } from '@markless/router';
import { createInvoice } from '../../server/actions.ts';
import { signedIn, unauthorized } from '../../server/guard.ts';

export default async function create(http: EndpointHttpContext) {
	if (!(await signedIn(http))) return unauthorized();
	return Response.json(await createInvoice(await http.request.formData()));
}
