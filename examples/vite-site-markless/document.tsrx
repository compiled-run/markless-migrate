import { Html, type PageProps } from '@markless/router';
import type { Children } from '@markless/core';
import stylesheet from './styles/style.css?url';
import { ALTERNATES, FORBIDDEN, NOT_FOUND, ORIGIN, PAGES } from './lib/site.ts';

export default function Document({ children, url, status, http }: PageProps & { readonly children?: Children }) @{
	const head = http.locals.forbidden ? FORBIDDEN : status === 404 ? NOT_FOUND : (PAGES[url.pathname] ?? NOT_FOUND);
	const pageUrl = `${ORIGIN}${head.path}`;

	<Html lang={head.lang} dir={head.dir}>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>{head.title}</title>
			<meta name="description" content={head.description} />
			<meta name="robots" content={head.robots} />
			@if (head.canonical) {
				<link rel="canonical" href={pageUrl} />
			}
			@for (const alternate of head.alternates ? ALTERNATES : []; key alternate.lang) {
				<link rel="alternate" hreflang={alternate.lang} href={`${ORIGIN}${alternate.path}`} />
			}
			<meta property="og:title" content={head.title} />
			<meta property="og:description" content={head.description} />
			<meta property="og:url" content={pageUrl} />
			<meta property="og:image" content={`${ORIGIN}/hero.png`} />
			<meta name="twitter:card" content="summary_large_image" />
			<link rel="icon" href="/hero.png" type="image/png" />
			@if (head.feeds) {
				<>
					<link rel="manifest" href="/manifest.json" />
					<link rel="alternate" type="application/rss+xml" title="News" href="/feed.xml" />
				</>
			}
			<link rel="stylesheet" href={stylesheet} />
		</head>
		<body>{children}</body>
	</Html>
}
