import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import { headFor } from './site.ts';

export default function Document({ url, children }: { readonly url?: { readonly pathname: string }; readonly children?: Children }) @{
	const head = headFor(url?.pathname);

	<Html lang="en">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="description" content={head.description} />
			<title>{head.title}</title>
			<link rel="canonical" href={head.canonical} />
			<link rel="alternate" type="application/atom+xml" title="Sitewide Atom feed" href="/atom.xml" />
			<link rel="stylesheet" href="/css/site.css" />
			<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
			@if (head.stylesheet) {
				<link rel="stylesheet" href={head.stylesheet} />;
			}
		</head>
		<body>
			{children}
			<script async defer src="https://buttons.github.io/buttons.js"></script>
		</body>
	</Html>
}
