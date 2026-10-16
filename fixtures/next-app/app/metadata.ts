import type { Metadata } from 'next';
import type { Locale } from './dictionaries';

export function pageMetadata(lang: Locale, path: string, title: string, description: string): Metadata {
	return {
		metadataBase: new URL('https://harbour.example'),
		title,
		description,
		robots: { index: true, follow: true },
		alternates: {
			canonical: `/${lang}${path}`,
			languages: { en: `/en${path}`, fr: `/fr${path}`, 'x-default': `/en${path}` },
		},
		openGraph: {
			title,
			description,
			url: `/${lang}${path}`,
			siteName: 'Harbour Coffee',
			locale: lang === 'en' ? 'en_GB' : 'fr_FR',
			images: [{ url: '/hero.png', width: 640, height: 320 }],
			type: 'website',
		},
		twitter: { card: 'summary_large_image', title, description },
	};
}
