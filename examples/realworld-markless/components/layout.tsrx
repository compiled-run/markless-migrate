import type { Children } from '@markless/core';
import Footer from './footer.tsrx';
import Header from './header.tsrx';

export default function Layout({ children }: { children?: Children }) @{
	<app-root>
		<Header />
		<router-outlet></router-outlet>
		{children}
		<Footer />
		<span data-boot="" hidden={true} onBoot={() => {}}></span>
		<script>{"function b(){document.querySelectorAll('[data-boot]').forEach(function(e){e.dispatchEvent(new Event('boot',{bubbles:true}))})}document.addEventListener('DOMContentLoaded',b);addEventListener('load',b)"}</script>
	</app-root>
}
