import type { EndpointHttpContext } from '@markless/router';
import { updateInvoice } from '../../../server/actions.ts';
import { signedIn, unauthorized } from '../../../server/guard.ts';

export default async function update(http: EndpointHttpContext<{ id: string }>) {
	if (!(await signedIn(http))) return unauthorized();
	return Response.json(await updateInvoice(http.params.id, await http.request.formData()));
}
