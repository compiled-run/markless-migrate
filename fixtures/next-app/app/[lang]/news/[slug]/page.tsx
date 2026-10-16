import { notFound } from 'next/navigation';
import { cms } from '../../../cms';

type Props = { params: Promise<{ lang: string; slug: string }> };

export default async function NewsItem({ params }: Props) {
	const { slug } = await params;
	const news = await cms<{ items: { title: string; summary: string; slug: string }[] }>('/coffee/news?fields=title,summary,slug&locale=en');
	const item = news?.items.find((n) => n.slug === slug);
	if (!item) notFound();
	return (
		<>
			<h1>{item.title}</h1>
			<p>{item.summary}</p>
		</>
	);
}
