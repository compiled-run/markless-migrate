import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html lang={undefined}>
		<head>
			<meta charset="utf-8" />
			<meta name="referrer" content="origin" />
			<meta name="viewport" content="initial-scale=1.0, width=device-width" />
			<link rel="shortcut icon" href="/static/favicon.ico" />
			{/* The pages' stylesheet link sits in the body (a page cannot write the head), where the browser finds it late. */}
			<link rel="preload" as="style" href="/static/news.css" />
		</head>
		<body>{children}</body>
	</Html>
}
