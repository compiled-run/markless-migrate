import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import stylesheet from './styles/global.css?url';
import { titleFor } from './lib/head.ts';

export default function Document({ url, status, children }: { readonly url?: { readonly pathname: string }; readonly status?: number; readonly children?: Children }) @{
	const title = titleFor(url?.pathname ?? '/');
	const notFound = status === 404;
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<link rel="preload" href="/fonts/568219ae74a4794d-s.p.ae51889f.woff2" as="font" crossorigin="" type="font/woff2" />
			<link rel="preload" href="/fonts/83afe278b6a6bb3c-s.p.3a6ba036.woff2" as="font" crossorigin="" type="font/woff2" />
			<link rel="preload" href="/fonts/f179d0d12a27c502-s.p.2481f41b.woff2" as="font" crossorigin="" type="font/woff2" />
			<link rel="stylesheet" href={stylesheet} />
			@if (notFound) {
				<meta name="robots" content="noindex" />
			}
			<title>{title}</title>
			@if (notFound) {
				<title>404: This page could not be found.</title>
			}
			<meta name="description" content="The official Next.js Learn Dashboard built with App Router." />
			<meta property="og:title" content={title} />
			<meta property="og:description" content="The official Next.js Learn Dashboard built with App Router." />
			<meta property="og:image" content="https://next-learn-dashboard.vercel.sh/opengraph-image.png?opengraph-image.f8ba042a.png" />
			<meta property="og:image:width" content="1686" />
			<meta property="og:image:height" content="882" />
			<meta property="og:image:type" content="image/png" />
			<meta name="twitter:card" content="summary_large_image" />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content="The official Next.js Learn Dashboard built with App Router." />
			<meta name="twitter:image" content="https://next-learn-dashboard.vercel.sh/opengraph-image.png?opengraph-image.f8ba042a.png" />
			<meta name="twitter:image:width" content="1686" />
			<meta name="twitter:image:height" content="882" />
			<meta name="twitter:image:type" content="image/png" />
			<link rel="icon" href="/favicon.ico?favicon.d29c4393.ico" sizes="48x48" type="image/x-icon" />
		</head>
		<body class="inter antialiased">{children}</body>
	</Html>
}
