import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import SiteHeader from './components/site-header.tsrx';

const PAGES: Record<string, { title: string; description: string; canonical: string }> = {
	'/': { title: 'Lighthouse Walks: coastal routes in Cornwall', description: 'Guided coastal walks between the lighthouses of west Cornwall.', canonical: 'https://lighthouse.example/' },
	'/about': { title: 'About | Lighthouse Walks', description: 'Who leads the walks.', canonical: 'https://lighthouse.example/about/' },
};

export default function Document({ url, children }: { readonly url?: { readonly pathname: string }; readonly children?: Children }) @{
	const page = PAGES[(url?.pathname ?? '/').replace(/\/+$/, '') || '/'] ?? PAGES['/']!;

	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>{page.title}</title>
			<meta name="description" content={page.description} />
			<meta name="robots" content="index, follow" />
			<link rel="canonical" href={page.canonical} />
			<meta property="og:title" content={page.title} />
			<meta property="og:description" content={page.description} />
			<meta property="og:url" content={page.canonical} />
			<meta property="og:image" content="https://lighthouse.example/hero.png" />
			<meta name="twitter:card" content="summary_large_image" />
			<link rel="icon" href="/hero.png" type="image/png" />
			<link rel="stylesheet" href="/style.css" />
		</head>
		<body>
			<SiteHeader />
			{children}
		</body>
	</Html>
}
