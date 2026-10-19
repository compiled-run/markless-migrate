import { state } from '@markless/core';
import Footer from '../../components/footer.tsrx';
import Header from '../../components/header.tsrx';

export default function About() @{
	let subscribed = state(false);

	<div class="page">
		<Header />
		<main>
			<h1>About the guides</h1>
			<p>Our guides grew up on this coast and have walked every route in every season.</p>
			<p class="note">All guides hold a first-aid certificate.</p>
			<p role="status" data-subscribed hidden={!subscribed} onIdle={() => { subscribed = new URLSearchParams(location.search).has('subscribed'); }}>Thanks, you are on the list.</p>
			<form method="post" action="/api/subscribe" class="subscribe">
				<label for="email">Email</label>
				<input id="email" type="email" name="email" autocomplete="email" required />
				<button type="submit">Subscribe</button>
			</form>
		</main>
		<Footer />
	</div>
}
