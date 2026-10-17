import type { EndpointHttpContext } from '@markless/router';
import { sessionFor } from './session.ts';

export async function signedIn(http: EndpointHttpContext): Promise<boolean> {
	return Boolean(await sessionFor(http.request, http.url));
}

export const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 });
