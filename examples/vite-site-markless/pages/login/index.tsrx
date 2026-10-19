import type { PageProps } from '@markless/router';
import Footer from '../../components/footer.tsrx';
import Header from '../../components/header.tsrx';

export default function Login({ url }: PageProps) @{
	const failed = new URLSearchParams(url.search).has('error');

	<div class="page">
		<Header />
		<main>
			<h1>Sign in</h1>
			<p role="alert" data-login-error hidden={!failed}>Wrong email or password.</p>
			<form method="post" action="/api/login" class="subscribe">
				<label for="login-email">Email</label>
				<input id="login-email" type="email" name="email" autocomplete="email" required />
				<label for="login-password">Password</label>
				<input id="login-password" type="password" name="password" autocomplete="current-password" required />
				<button type="submit">Sign in</button>
			</form>
		</main>
		<Footer />
	</div>
}
