import type { EndpointHttpContext } from '@markless/router';
import { answer } from '../lib/endpoint.ts';
import { auth } from '../lib/server.ts';

export default function session(http: EndpointHttpContext) {
	return answer(http, auth);
}
