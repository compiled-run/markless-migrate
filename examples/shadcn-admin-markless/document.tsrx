import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import stylesheet from './styles/index.css?url';
import { LoadingBar } from './lib/parity/react-top-loading-bar/loading-bar.tsrx';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="UTF-8" />
			<link rel="icon" type="image/svg+xml" href="/images/favicon.svg" media="(prefers-color-scheme: light)" />
			<link rel="icon" type="image/svg+xml" href="/images/favicon_light.svg" media="(prefers-color-scheme: dark)" />
			<link rel="icon" type="image/png" href="/images/favicon.png" media="(prefers-color-scheme: light)" />
			<link rel="icon" type="image/png" href="/images/favicon_light.png" media="(prefers-color-scheme: dark)" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>Shadcn Admin</title>
			<meta name="title" content="Shadcn Admin" />
			<meta name="description" content="Admin Dashboard UI built with Shadcn and Vite." />
			<meta property="og:type" content="website" />
			<meta property="og:url" content="https://shadcn-admin.netlify.app" />
			<meta property="og:title" content="Shadcn Admin" />
			<meta property="og:description" content="Admin Dashboard UI built with Shadcn and Vite." />
			<meta property="og:image" content="https://shadcn-admin.netlify.app/images/shadcn-admin.png" />
			<meta property="twitter:card" content="summary_large_image" />
			<meta property="twitter:url" content="https://shadcn-admin.netlify.app" />
			<meta property="twitter:title" content="Shadcn Admin" />
			<meta property="twitter:description" content="Admin Dashboard UI built with Shadcn and Vite." />
			<meta property="twitter:image" content="https://shadcn-admin.netlify.app/images/shadcn-admin.png" />
			<link rel="preconnect" href="https://fonts.googleapis.com" />
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
			<link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&display=swap" rel="stylesheet" />
			<meta name="theme-color" content="#fff" />
			<link rel="stylesheet" crossorigin="" href="/assets/index-ChZ-TBIh.css" />
			<link rel="stylesheet" href={stylesheet} />
			<script>{"(function(){var c=function(n){var m=('; '+document.cookie).split('; '+n+'=');return m.length===2?m.pop().split(';').shift():undefined};var r=document.documentElement;r.setAttribute('dir',c('dir')==='rtl'?'rtl':'ltr');var f=c('font'),t=c('vite-ui-theme')||'system',q=window.matchMedia('(prefers-color-scheme: dark)');r.classList.add('font-'+(['inter','manrope','system'].indexOf(f)+1?f:'inter'));var a=function(){r.classList.remove('light','dark');r.classList.add(t==='system'?(q.matches?'dark':'light'):t)};a();q.addEventListener('change',function(){if(t==='system')a()})})()"}</script>
			{/* The old app navigates in place only through the links its router renders (TanStack Router's Link, all inside
			    #root); any other link on the page loads the page. The Markless router follows every link, so one outside
			    #root is kept from it. */}
			<script>{"addEventListener('click',function(e){var t=e.target,a=t&&t.closest?t.closest('a[href]'):null,r=document.getElementById('root');if(a&&r&&!r.contains(a))e.stopPropagation()},true)"}</script>
		</head>
		<body>
			<div id="root">
				<LoadingBar />
				{children}
				<script src="/parity/layout-prefs.js"></script>
				<script src="/parity/loading-bar.js"></script>
				<script src="/parity/header.js"></script>
				<script src="/parity/sonner.js"></script>
				<script src="/parity/avatar.js"></script>
				<script src="/parity/tooltip.js"></script>
			</div>
		</body>
	</Html>
}
