import { Html } from '@markless/router';
import type { Children } from '@markless/core';
import stylesheet from './styles/vite.css?url';
import bannerBackground from './assets/vite/footer-background.jpg';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html lang="en-US" dir="ltr" data-variant="vite" data-theme="dark">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width,initial-scale=1" />
			<title>Vite | Next Generation Frontend Tooling</title>
			<meta name="description" content="Next Generation Frontend Tooling" />
			<link rel="preload stylesheet" href={stylesheet} as="style" />
			<link rel="preconnect" href="https://fonts.googleapis.com" />
			<link rel="preload" href={bannerBackground} as="image" />
			<script>{'if(localStorage.getItem("banner-dismissed-viteconf-2026")==="true")document.documentElement.classList.add("banner-dismissed");'}</script>
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
			<script id="check-dark-mode">{'(function(){let e=localStorage.getItem("vitepress-theme-appearance")||"auto",t=window.matchMedia("(prefers-color-scheme: dark)").matches;if(!e||e==="auto"?t:e==="dark")document.documentElement.classList.add("dark")})();'}</script>
			<script id="check-mac-os">{'document.documentElement.classList.toggle("mac",/Mac|iPhone|iPod|iPad/i.test(navigator.platform));'}</script>
			<link rel="modulepreload" href="/page-scripts/page.js" />
			<link rel="canonical" href="https://vite.dev" />
			<link href="/llms.txt" rel="describedby" />
		</head>
		<body>
			{children}
			<script type="module" src="/page-scripts/page.js"></script>
		</body>
	</Html>
}
