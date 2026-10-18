import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import agGrid from './styles/ag-grid.css?url';
import app from './styles/index.css?url';
import fonts from './styles/fonts.css?url';
import agTheme from './styles/ag-theme.css?url';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width,initial-scale=1" />
			<title>Devtron</title>
			<link rel="stylesheet" href={agGrid} />
			<link rel="stylesheet" href={app} />
			<link rel="stylesheet" href={fonts} />
			<link rel="stylesheet" href={agTheme} />
		</head>
		<body>
			{children}
			<script src="/devtools-host.js"></script>
		</body>
	</Html>
}
