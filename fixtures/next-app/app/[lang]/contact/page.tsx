import type { Metadata } from 'next';
import { dictionaries, type Locale } from '../../dictionaries';
import { pageMetadata } from '../../metadata';

type Props = { params: Promise<{ lang: Locale }>; searchParams: Promise<{ sent?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { lang } = await params;
	const t = dictionaries[lang].contact;
	return pageMetadata(lang, '/contact', t.title, t.description);
}

export default async function Contact({ params, searchParams }: Props) {
	const { lang } = await params;
	const { sent } = await searchParams;
	const t = dictionaries[lang].contact;
	return (
		<>
			<h1>{t.heading}</h1>
			{sent ? <p role="status">{t.sent}</p> : null}
			<form method="post" action="/api/contact">
				<input type="hidden" name="lang" value={lang} />
				<label>
					{t.name}
					<input name="name" autoComplete="name" required />
				</label>
				<label>
					{t.message}
					<textarea name="message" rows={4} required />
				</label>
				<button type="submit">{t.send}</button>
			</form>
		</>
	);
}
