import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import { headFor } from './site.ts';

const INDICATOR_STYLES = '.htmx-indicator{opacity:0;visibility: hidden} .htmx-request .htmx-indicator, .htmx-request.htmx-indicator{opacity:1;visibility: visible;transition: opacity 200ms ease-in}';

export default function Document({ url, children }: { readonly url?: { readonly href: string; readonly pathname: string }; readonly children?: Children }) @{
	const head = headFor(url?.pathname);
	// htmx.org's canonical names its own host; the port's names the host serving it.
	const canonical = head.canonical && url ? new URL(new URL(head.canonical).pathname, url.href).href : head.canonical;

	<Html lang="en">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="description" content={head.description} />
			<title>{head.title}</title>
			@if (head.canonical) {
				<link rel="canonical" href={canonical} />;
			}
			<link rel="alternate" type="application/atom+xml" title="Sitewide Atom feed" href="/atom.xml" />
			@for (const alternate of head.alternates; key alternate.href) {
				<link rel="alternate" type={alternate.type} title={alternate.title} href={alternate.href} />;
			}
			<link rel="stylesheet" href="/css/site.css" />
			<link rel="stylesheet" href="/css/port-embeds.css" />
			<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
			@for (const stylesheet of head.stylesheets; key stylesheet) {
				<link rel="stylesheet" href={stylesheet} />;
			}
			{/* htmx's preload="mouseover" on the nav links: the browser fetches a link's page when the pointer rests on it. */}
			<script type="speculationrules">{'{"prefetch":[{"where":{"selector_matches":".navigation-items a[href^=\\"/\\"]"},"eagerness":"moderate"}]}'}</script>
			@for (const script of head.scripts; key script) {
				<script src={script}></script>;
			}
			{/* The indicator styles htmx adds to the head of every htmx.org page. */}
			<style>{INDICATOR_STYLES}</style>
		</head>
		<body hx-ext="class-tools, preload">
			{children}
		</body>
	</Html>
}
