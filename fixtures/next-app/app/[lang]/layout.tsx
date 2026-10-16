import localFont from 'next/font/local';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { dictionaries, isLocale, locales } from '../dictionaries';
import '../globals.css';

const inter = localFont({ src: '../fonts/inter-latin.woff2', variable: '--font-inter', display: 'swap' });

export const dynamic = 'force-dynamic';
export const dynamicParams = false;

export function generateStaticParams() {
	return locales.map((lang) => ({ lang }));
}

export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	const t = dictionaries[lang];
	return (
		<html lang={lang} dir="ltr" className={inter.variable}>
			<body>
				<header className="site-header">
					<span className="brand">{t.siteName}</span>
					<nav aria-label="Main">
						<Link href={`/${lang}`}>{t.nav.home}</Link>
						<Link href={`/${lang}/about`}>{t.nav.about}</Link>
						<Link href={`/${lang}/contact`}>{t.nav.contact}</Link>
						<Link href={lang === 'en' ? '/fr' : '/en'} hrefLang={lang === 'en' ? 'fr' : 'en'}>
							{lang === 'en' ? 'Français' : 'English'}
						</Link>
					</nav>
				</header>
				<main>{children}</main>
				<footer className="site-footer">
					<p>
						{t.rendered} <time>{new Date().toISOString()}</time>
					</p>
				</footer>
			</body>
		</html>
	);
}
