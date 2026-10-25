import type { EndpointHttpContext } from '@markless/router';
import { answer } from '../lib/endpoint.ts';
import { logout } from '../lib/server.ts';

export default function signOut(http: EndpointHttpContext) {
	return answer(http, (ctx) => (logout(ctx), { ok: true }));
}
