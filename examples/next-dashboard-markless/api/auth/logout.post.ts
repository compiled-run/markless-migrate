import type { EndpointHttpContext } from '@markless/router';
import { clearCookie, cookieNames } from '../../server/session.ts';

export default function logout(http: EndpointHttpContext) {
	return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': clearCookie(cookieNames(http.url).session, http.url) } });
}
