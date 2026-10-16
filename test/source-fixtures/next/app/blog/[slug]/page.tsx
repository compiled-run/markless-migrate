import { contentful } from '@/lib/contentful';

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const entries = await contentful.getEntries({ content_type: 'post', 'fields.slug': slug, select: 'fields.title,fields.body' });
	const post = entries.items[0];
	return <h1>{post.fields.title}</h1>;
}
