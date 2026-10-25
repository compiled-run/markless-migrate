import type { EndpointHttpContext } from '@markless/router';
import { requestContext, type RequestContext } from './context.ts';

export function answer<T>(
	http: EndpointHttpContext,
	run: (ctx: RequestContext) => Promise<T> | T,
): Promise<Response> {
	return Promise.resolve()
		.then(() => run(requestContext(http.request)))
		.then(
			(body) => Response.json(body ?? null),
			(error: Error) =>
				Response.json(
					{ error: error.message },
					{ status: /not found/i.test(error.message) ? 404 : 500 },
				),
		);
}

export async function json<T>(http: EndpointHttpContext): Promise<T> {
	return (await http.request.json()) as T;
}
