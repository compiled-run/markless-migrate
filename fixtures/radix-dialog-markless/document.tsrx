import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import stylesheet from './src.css?url';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<title>Dialog</title>
			<link rel="stylesheet" href={stylesheet} />
		</head>
		<body>
			<div id="root">{children}</div>
		</body>
	</Html>
}
