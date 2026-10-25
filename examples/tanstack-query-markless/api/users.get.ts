import type { EndpointHttpContext } from '@markless/router';
import { answer } from '../lib/endpoint.ts';
import { fetchUsers } from '../lib/server.ts';
import type { UsersSortBy } from '../lib/types.ts';

export default function users(http: EndpointHttpContext) {
	const q = http.url.searchParams;
	return answer(http, (ctx) =>
		fetchUsers(ctx, {
			filterBy: q.get('filterBy') ?? undefined,
			sortBy: (q.get('sortBy') as UsersSortBy | null) ?? undefined,
		}),
	);
}
