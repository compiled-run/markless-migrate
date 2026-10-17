import type { EndpointHttpContext } from '@markless/router';
import { deleteInvoice } from '../../../server/actions.ts';
import { signedIn, unauthorized } from '../../../server/guard.ts';

export default async function remove(http: EndpointHttpContext<{ id: string }>) {
	if (!(await signedIn(http))) return unauthorized();
	await deleteInvoice(http.params.id);
	return Response.json({ ok: true });
}
