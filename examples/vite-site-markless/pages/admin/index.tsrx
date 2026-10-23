import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import Footer from '../../components/footer.tsrx';
import Forbidden from '../../components/forbidden.tsrx';
import Header from '../../components/header.tsrx';

export default function Admin({ http }: PageProps) @{
	const forbidden = http.locals.forbidden === true;
	let name = state(http.locals.user?.name ?? 'guest');
	if (forbidden) http.response.status = 403;

	<div class="page">
		<Header />
		@if (forbidden) {
			<Forbidden />
		} @else {
			<main>
				<h1>Guide admin</h1>
				<p>Signed in as {name}.</p>
				<p>Next walk: Godrevy to St Ives, 12 walkers.</p>
			</main>
		}
		<Footer />
	</div>
}
