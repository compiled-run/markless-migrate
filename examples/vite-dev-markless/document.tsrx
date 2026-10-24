import { Html } from '@markless/router';
import type { Children } from '@markless/core';
import bannerBackground from './assets/vite/footer-background.jpg';
import docsHeads from './lib/docs-heads.json' with { type: 'json' };
import { EARLY_SEARCH_SCRIPT } from './page-scripts/search-shell.ts';

interface Head {
	readonly title: string;
	readonly description: string;
	readonly meta: readonly Readonly<Record<string, string>>[];
	readonly links: readonly Readonly<Record<string, string>>[];
	readonly markdown?: string;
}
const heads = docsHeads as Readonly<Record<string, Head>>;

// The web fonts every page of a layout draws in its first screen, which only style.css names: fetched with it, not after it.
const HOME_FONTS = ['/assets/APK-Protocol-Medium.C7Mq9oGh.woff2', '/assets/inter-roman-latin.Di8DUHzh.woff2', '/assets/KHTekaMono-Regular.CiZ9ZkmZ.woff2'];
const DOCS_FONTS = ['/assets/APK-Protocol-Medium.C7Mq9oGh.woff2', '/assets/APK-Protocol-Semi-Bold.CC2BASA5.woff2', '/assets/inter-roman-latin.Di8DUHzh.woff2', '/assets/KHTekaMono-Regular.CiZ9ZkmZ.woff2'];

export default function Document({ url, children }: { readonly url?: { readonly pathname: string }; readonly children?: Children }) @{
	const path = url?.pathname ?? '/';
	const docs = heads[path] ?? heads[path.replace(/\/$/, '')] ?? (path === '/' ? undefined : heads['/404']);
	const marketing = !docs || path.replace(/\/$/, '') === '/live';

	<Html lang="en-US" dir="ltr" data-theme={marketing ? 'dark' : undefined}>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width,initial-scale=1" />
			@if (docs) {
				<>
					<title>{docs.title}</title>
					<meta name="description" content={docs.description} />
				</>;
			} @else {
				<>
					<title>Vite | Next Generation Frontend Tooling</title>
					<meta name="description" content="Next Generation Frontend Tooling" />
				</>;
			}
			<link rel="preload stylesheet" href="/assets/style.B3BAO59d.css" as="style" />
			@for (const font of docs ? DOCS_FONTS : HOME_FONTS; key font) {
				<link rel="preload" href={font} as="font" type="font/woff2" crossorigin="" />;
			}
			@if (!docs) {
				<link rel="preconnect" href="https://fonts.googleapis.com" />;
			}
			<link rel="preload" href={bannerBackground} as="image" media="(min-width: 768px)" />
			<script>{'if(localStorage.getItem("banner-dismissed-viteconf-2026")==="true")document.documentElement.classList.add("banner-dismissed");'}</script>
			@if (docs) {
				<>
					@for (const link of docs.links; index i; key i) {
						<link rel={link.rel} type={link.type} href={link.href} />;
					}
					@for (const meta of docs.meta; index i; key i) {
						<meta name={meta.name} property={meta.property} content={meta.content} />;
					}
				</>;
			} @else {
				<>
					<link rel="icon" type="image/svg+xml" href="/logo-without-border.svg" />
					<link rel="alternate" type="application/rss+xml" href="/blog.rss" />
					<link rel="me" href="https://m.webtoo.ls/@vite" />
					<meta property="og:type" content="website" />
					<meta property="og:title" content="Vite" />
					<meta property="og:image" content="https://vite.dev/og-image.jpg" />
					<meta property="og:url" content="https://vite.dev" />
					<meta property="og:description" content="Next Generation Frontend Tooling" />
					<meta property="og:site_name" content="vitejs" />
					<meta name="twitter:card" content="summary_large_image" />
					<meta name="twitter:site" content="@vite_js" />
					<meta name="theme-color" content="#646cff" />
				</>;
			}
			<script id="check-dark-mode">{'(function(){let e=localStorage.getItem("vitepress-theme-appearance")||"auto",t=window.matchMedia("(prefers-color-scheme: dark)").matches;if(!e||e==="auto"?t:e==="dark")document.documentElement.classList.add("dark")})();'}</script>
			<script id="check-mac-os">{'document.documentElement.classList.toggle("mac",/Mac|iPhone|iPod|iPad/i.test(navigator.platform));'}</script>
			<script id="search-on-click">{EARLY_SEARCH_SCRIPT}</script>
			<link rel="modulepreload" href="/page-scripts/page.js" />
			@if (!docs) {
				<link rel="modulepreload" href="/page-scripts/home.js" />;
			}
			@if (docs) {
				@if (docs.markdown) {
					<link href={docs.markdown} rel="alternate" type="text/markdown" />;
				}
			} @else {
				<link rel="canonical" href="https://vite.dev" />;
			}
			<link href="/llms.txt" rel="describedby" />
		</head>
		<body>
			{children}
			<script type="module" src="/page-scripts/page.js"></script>
		</body>
	</Html>
}
