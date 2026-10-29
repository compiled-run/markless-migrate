import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import { earlyThemeScript } from '../../parts/next-themes.ts';
import { THEME } from '../../examples/shadcn-ui-markless/lib/site/theme.ts';

// The port's Document as far as the designer needs it: the early theme script, and in place of the site's stylesheet the
// rules its classes amount to for what the tests press (hidden is hidden, the drawer and popups above the page).
const CSS = '[hidden]{display:none!important}body{margin:0;font:14px sans-serif}iframe{width:600px;height:400px}.fixed{position:fixed}.inset-0{inset:0}.z-50{z-index:50}.z-40{z-index:40}[data-slot="drawer-popup"]{right:0;top:0;bottom:0;width:24rem;background:#fff;overflow:auto}[role="menu"]{max-height:300px;overflow:auto;background:#eee}';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html lang="en">
		<head>
			<meta charset="utf-8" />
			<title>Typeset</title>
			<script>{earlyThemeScript(THEME, { name: 'Toggle theme', key: 'd', metaColors: { light: '#ffffff', dark: '#0a0a0a' } })}</script>
			<style>{CSS}</style>
		</head>
		<body>{children}</body>
	</Html>
}
