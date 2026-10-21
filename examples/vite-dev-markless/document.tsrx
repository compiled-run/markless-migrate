import { Html } from '@markless/router';
import type { Children } from '@markless/core';
import bannerBackground from './assets/vite/footer-background.jpg';
import docsHeads from './lib/docs-heads.json' with { type: 'json' };

interface Head {
	readonly title: string;
	readonly description: string;
	readonly meta: readonly Readonly<Record<string, string>>[];
	readonly links: readonly Readonly<Record<string, string>>[];
	readonly markdown?: string;
}
const heads = docsHeads as Readonly<Record<string, Head>>;

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
			@if (!docs) {
				<>
					<link rel="preconnect" href="https://fonts.googleapis.com" />
					<link rel="preload" href={bannerBackground} as="image" />
				</>;
			}
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
			<link rel="modulepreload" href="/page-scripts/page.js" />
			@if (marketing) {
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
