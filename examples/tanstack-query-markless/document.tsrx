import type { Children } from '@markless/core';
import { Html } from '@markless/router';

// The old App's useSessionStorage hooks store the panel's values once it mounts; the cookies carry them to the server's mock API.
const SANDBOX = "(function(){var d={loaderDelay:500,pendingMs:1000,pendingMinMs:500};for(var k in d){var v=sessionStorage.getItem(k);if(v===null)v=JSON.stringify(d[k]);sessionStorage.setItem(k,v);document.cookie=k+'='+v+'; Path=/; SameSite=Lax'}})()";

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>Vite App</title>
			<link rel="stylesheet" href="/assets/index-3hmDRWSn.css" />
			<script>{SANDBOX}</script>
		</head>
		<body>{children}</body>
	</Html>
}
