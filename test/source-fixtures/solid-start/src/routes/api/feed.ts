const QUERY = `query Feed { posts(first: 5) { nodes { title uri } } }`;

export async function GET() {
	const res = await fetch('https://cms.example.com/graphql', { method: 'POST', body: JSON.stringify({ query: QUERY }) });
	return res;
}
