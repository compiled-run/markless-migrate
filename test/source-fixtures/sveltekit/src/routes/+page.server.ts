import { client } from '$lib/sanity';

export async function load() {
	const posts = await client.fetch(`*[_type == "post"]{ title, "slug": slug.current, author->{ name } }`);
	return { posts };
}
