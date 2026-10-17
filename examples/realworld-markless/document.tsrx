import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import app from './styles/app.css?url';
import fonts from './styles/fonts.css?url';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<script>{"document.documentElement.removeAttribute('lang')"}</script>
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
			<meta charset="utf-8" />
			<title>Conduit</title>
			<base href="/" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<link href="//code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css" rel="stylesheet" type="text/css" />
			<link rel="stylesheet" href={fonts} />
			<link rel="stylesheet" href="/styles/conduit.css" />
			<link rel="stylesheet" href={app} />
		</head>
		<body>{children}</body>
	</Html>
}
