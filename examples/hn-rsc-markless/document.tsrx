import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import stylesheet from './styles/global.css?url';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html lang="en">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<link rel="stylesheet" href={stylesheet} />
			<meta name="theme-color" content="#ffa52a" />
			<title>Next.js App Router + React Server Components Demo</title>
			<meta name="description" content="Hacker News clone built with the Next.js App Router." />
			<meta name="robots" content="index, follow" />
			<link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="36x36" />
		</head>
		<body>{children}</body>
	</Html>
}
