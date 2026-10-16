import type { Metadata } from 'next';
import { dictionaries, type Locale } from '../../dictionaries';
import { pageMetadata } from '../../metadata';

type Props = { params: Promise<{ lang: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { lang } = await params;
	const t = dictionaries[lang].about;
	return pageMetadata(lang, '/about', t.title, t.description);
}

export default async function About({ params }: Props) {
	const { lang } = await params;
	const t = dictionaries[lang].about;
	return (
		<>
			<h1>{t.heading}</h1>
			<p>{t.body}</p>
		</>
	);
}
