export default async function slow({ url }: import('@markless/router').EndpointHttpContext) {
	await new Promise((resolve) => setTimeout(resolve, 50));
	return Response.json({ text: `slow ${url.searchParams.get('from') ?? ''}` });
}
