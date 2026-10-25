import type { EndpointHttpContext } from '@markless/router';
import { answer, json } from '../lib/endpoint.ts';
import { login } from '../lib/server.ts';

export default async function signIn(http: EndpointHttpContext) {
	const { username } = await json<{ username: string }>(http);
	return answer(http, (ctx) => (login(ctx, username), { ok: true }));
}
