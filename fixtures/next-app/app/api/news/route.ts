import { cms } from '../../cms';

export const dynamic = 'force-dynamic';

export async function GET() {
	const news = await cms<{ items: { title: string; summary: string; slug: string }[] }>('/coffee/news?fields=title,summary,slug&locale=en');
	return Response.json({ items: (news?.items ?? []).map((item) => ({ title: item.title, summary: item.summary, slug: item.slug })) });
}
