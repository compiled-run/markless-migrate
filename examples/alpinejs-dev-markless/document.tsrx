import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import { headFor, normalize } from './site.ts';
import { serverStylesheets } from './generated/server-heads.ts';
import { PERSISTED } from './generated/persist.ts';
import { CONTENTS_HIGHLIGHTER, persistDefaults } from './page-scripts.ts';
import { DOCSEARCH_SCRIPT } from './generated/docsearch.ts';

export default function Document({ url, children }: { readonly url?: { readonly pathname: string }; readonly children?: Children }) @{
	const pathname = normalize(url?.pathname);
	const head = headFor(pathname);
	const server = serverStylesheets(pathname);
	const docs = pathname !== '/' && !server;
	const home = pathname === '/';
	const extra = server ?? [];
	const persisted = PERSISTED[pathname];
	const persistScript = persisted ? persistDefaults(persisted) : '';

	<Html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<script>{DOCSEARCH_SCRIPT}</script>
			<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@docsearch/css@3" />
			<link rel="stylesheet" href="/build/assets/app.9ea156ae.css" />
			<link rel="preconnect" href="https://fonts.gstatic.com" />
			<link href="https://fonts.googleapis.com/css2?family=Karla:wght@400;600;800&display=swap" rel="stylesheet" />
			<meta name="twitter:card" content="summary_large_image" />
			<meta name="og:title" content={head.title} />
			<meta name="og:description" content={head.description} />
			<meta name="og:image" content={head.image} />
			<title>{head.title}</title>
			<meta name="description" content={head.description} />
			<link rel="icon" href="/favicon.png" />
			<link rel="stylesheet" href="/port/site.css" />
			@if (docs) {
				<link rel="stylesheet" href="/port/docs.css" />;
			}
			@if (home) {
				<link rel="stylesheet" href="/port/home.css" />;
			}
			@for (const href of extra; key href) {
				<link rel="stylesheet" href={href} />
			}
		</head>
		<body>
			{children}
			@if (docs) {
				<script>{CONTENTS_HIGHLIGHTER}</script>;
			}
			@if (persisted) {
				<script>{persistScript}</script>;
			}
		</body>
	</Html>
}
