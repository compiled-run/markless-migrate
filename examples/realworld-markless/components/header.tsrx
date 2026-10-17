import { element } from '@markless/core';
import { bootHeader } from '../lib/header.ts';

export default function Header() @{
	const container = element<HTMLDivElement>();

	<app-layout-header>
		<nav
			class="navbar navbar-light"
			onVisible={() => {
				const node = container;
				void bootHeader(node);
			}}
		>
			<div el={container} class="container">
				<a class="navbar-brand" href="/"><img src="assets/conduit-logo.svg" alt="Conduit" class="navbar-logo" /></a>
				<ul class="nav navbar-nav pull-xs-right">
					<li class="nav-item"><a class="nav-link" href="/"> Home </a></li>
					<li class="nav-item"><span class="nav-link">Loading...</span></li>
				</ul>
			</div>
		</nav>
	</app-layout-header>
}
