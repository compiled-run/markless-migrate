import type { Children } from '@markless/core';
import Header from './header.tsrx';

// Footer and server info come with each page's data, so streamed content never pushes them down.
export default function Layout({ children }: { readonly children?: Children }) @{
	<main>
		<Header />
		<div class="page">
			{children}
		</div>
	</main>
}
