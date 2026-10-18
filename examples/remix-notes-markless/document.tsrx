import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import stylesheet from './styles/tailwind.css?url';
import { titleFor } from './lib/head.ts';

export default function Document({ url, status, children }: { readonly url?: { readonly pathname: string }; readonly status?: number; readonly children?: Children }) @{
	const notFound = status === 404;
	const title = titleFor(url?.pathname ?? '/');
	<Html lang="en" class={status === 404 ? undefined : 'h-full'}>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content={notFound ? 'width=device-width,initial-scale=1,viewport-fit=cover' : 'width=device-width,initial-scale=1'} />
			@if (notFound) {
				<title>Unhandled Thrown Response!</title>
			}
			@if (title) {
				<title>{title}</title>
			}
			@if (!notFound) {
				<link rel="stylesheet" href={stylesheet} />
			}
		</head>
		<body class={notFound ? undefined : 'h-full'}>{children}</body>
	</Html>
}
