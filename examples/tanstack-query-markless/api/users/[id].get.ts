import type { EndpointHttpContext } from '@markless/router';
import { answer } from '../../lib/endpoint.ts';
import { fetchUserById } from '../../lib/server.ts';

export default function user(http: EndpointHttpContext<{ id: string }>) {
	return answer(http, (ctx) => fetchUserById(ctx, Number(http.params.id)));
}
