import Image from 'next/image';
import type { Metadata } from 'next';
import { dictionaries, type Locale } from '../dictionaries';
import { pageMetadata } from '../metadata';
import { Counter } from './counter';

type Props = { params: Promise<{ lang: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { lang } = await params;
	const t = dictionaries[lang].home;
	return pageMetadata(lang, '', t.title, t.description);
}

export default async function Home({ params }: Props) {
	const { lang } = await params;
	const d = dictionaries[lang];
	const t = d.home;
	const roast = new Intl.DateTimeFormat(d.dateLocale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date('2026-10-27T00:00:00Z'));
	const price = new Intl.NumberFormat(d.numberLocale, { style: 'currency', currency: 'EUR' }).format(1234.5);
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'CafeOrCoffeeShop',
		name: dictionaries[lang].siteName,
		url: `https://harbour.example/${lang}`,
		servesCuisine: 'Coffee',
	};
	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			<h1>{t.heading}</h1>
			<p className="lede">{t.lede}</p>
			<p className="next-roast">
				{t.nextRoast}: <time dateTime="2026-10-27">{roast}</time> · {t.sack}: {price}
			</p>
			<Image className="hero" src="/hero.png" alt={t.heroAlt} width={640} height={320} priority />
			<Counter label={t.counter} action={t.pour} />
			<section className="roasts" aria-label={t.roasts}>
				{[t.harbour, t.pier].map(([name, notes]) => (
					<article className="roast" key={name}>
						<h2>{name}</h2>
						<p>{notes}</p>
					</article>
				))}
			</section>
		</>
	);
}
