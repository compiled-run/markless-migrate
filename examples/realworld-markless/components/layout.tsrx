import type { Children } from '@markless/core';
import Footer from './footer.tsrx';
import Header from './header.tsrx';

export default function Layout({ children }: { children?: Children }) @{
	<app-root>
		<Header />
		<router-outlet></router-outlet>
		{children}
		<Footer />
	</app-root>
}
