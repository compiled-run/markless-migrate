import { cms } from '../cms';

export const dynamic = 'force-dynamic';

const escape = (value: string) => value.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET() {
	const news = await cms<{ items: { title: string; summary: string; slug: string }[] }>('/coffee/news?fields=title,summary,slug&locale=en');
	const items = (news?.items ?? []).map((item) => `<item><title>${escape(item.title)}</title><link>https://harbour.example/en/news/${item.slug}</link><guid>https://harbour.example/en/news/${item.slug}</guid><description>${escape(item.summary)}</description></item>`);
	const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Harbour Coffee news</title><link>https://harbour.example/en</link><description>New lots and events.</description>${items.join('')}</channel></rss>`;
	return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}
