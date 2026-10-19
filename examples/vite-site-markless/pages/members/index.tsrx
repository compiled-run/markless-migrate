import type { PageProps } from '@markless/router';
import Footer from '../../components/footer.tsrx';
import Header from '../../components/header.tsrx';

export default function Members({ http }: PageProps) @{
	const name = http.locals.user?.name ?? 'guest';

	<div class="page">
		<Header />
		<main>
			<h1>Members</h1>
			<p>Welcome back, {name}.</p>
			<p>Members walk the night route to the Lizard lighthouse.</p>
		</main>
		<Footer />
	</div>
}
