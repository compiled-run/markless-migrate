export interface GraphQLResult<T> {
	readonly data?: T;
	readonly errors?: readonly { readonly message: string }[];
}

const backend = () => process.env.HN_GRAPHQL_BACKEND ?? 'http://127.0.0.1:4874';

// The old app's Apollo link: POST {operationName, variables, query} to its own /graphql (on the server too) with the visitor's session cookie.
export async function graphql<T>(
	query: string,
	variables: Record<string, unknown> = {},
): Promise<GraphQLResult<T>> {
	const operationName = /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
	const body = JSON.stringify({ operationName, variables, query });
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	let url = '/graphql';
	if (import.meta.env.SSR) {
		const { useRequest } = await import('nitro/context');
		const request = useRequest();
		const cookie = request.headers.get('cookie');
		if (cookie) headers.cookie = cookie;
		url = new URL('/graphql', request.url).href;
	}
	const response = await fetch(url, {
		method: 'POST',
		headers,
		body,
		credentials: 'same-origin',
	});
	return (await response.json()) as GraphQLResult<T>;
}

export function backendUrl(path: string): string {
	return new URL(path, backend()).href;
}
