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
			@if (head.canonical) {
				<link rel="canonical" href={head.canonical} />;
			}
			<link rel="alternate" type="application/atom+xml" title="Sitewide Atom feed" href="/atom.xml" />
			@for (const alternate of head.alternates; key alternate.href) {
				<link rel="alternate" type={alternate.type} title={alternate.title} href={alternate.href} />;
			}
			<link rel="stylesheet" href="/css/site.css" />
			<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
			@for (const stylesheet of head.stylesheets; key stylesheet) {
				<link rel="stylesheet" href={stylesheet} />;
			}
			@for (const script of head.scripts; key script) {
				<script src={script}></script>;
			}
		</head>
		<body hx-ext="class-tools, preload">
			{children}
			<script async defer src="https://buttons.github.io/buttons.js"></script>
		</body>
	</Html>
}
