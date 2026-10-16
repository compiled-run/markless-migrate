export default function About() @{
	<main>
		<h1>About the guides</h1>
		<p>Our guides grew up on this coast and have walked every route in every season.</p>
		<p class="note">All guides hold a first-aid certificate.</p>
		<form method="post" action="/api/subscribe" class="subscribe">
			<label for="email">Email</label>
			<input id="email" type="email" name="email" autocomplete="email" required />
			<button type="submit">Subscribe</button>
		</form>
	</main>
}
