import type { PageProps } from '@markless/router';
import Footer from '../components/footer.tsrx';
import Forbidden from '../components/forbidden.tsrx';
import Header from '../components/header.tsrx';

export default function NotFound({ http }: PageProps) @{
	const forbidden = http.locals.forbidden === true;
	if (forbidden) http.response.status = 403;

	<div class="page">
		<Header />
		@if (forbidden) {
			<Forbidden />
		} @else {
			<main>
				<h1>Page not found</h1>
				<p>Try the <a href="/">home page</a>.</p>
			</main>
		}
		<Footer />
	</div>
}
