import { computed, state } from '@markless/core';
import { navigate } from '@markless/router';
import { loginQuery, validateNewUser } from '../lib/login.ts';
import type { Session } from '../lib/session.ts';

export default function LoginView({ session, search }: { session: Session; search: string }) @{
	const query = computed(() => loginQuery(search));
	let loginId = state('');
	let loginPassword = state('');
	let registerId = state('');
	let registerPassword = state('');
	let validationMessage = state('');
	const loginError = computed(() => validateNewUser({ id: loginId, password: loginPassword }));
	const registerError = computed(() => validateNewUser({ id: registerId, password: registerPassword }));
	<>
		<title>Hacker News Clone</title>
		<div class="WordSection1">
		@if (query.message) {
			<p>{query.message}</p>
		}
		@if (validationMessage) {
			<p>{validationMessage}</p>
		}
		<b>Login</b>
		<br />
		<br />
		<form
			method="post"
			action="/login"
			style="margin-bottom:1em"
			onSubmit={(event) => {
				if (session.signedIn || loginError) event.preventDefault();
				if (session.signedIn) void navigate('/login?how=loggedin');
				else if (loginError) validationMessage = loginError;
			}}
		>
			<input type="hidden" name="goto" value={query.goto} />
			<table style="border:0px">
				<tbody>
					<tr>
						<td>username:</td>
						<td>
							<input type="text" autocapitalize="off" autocorrect="off" name="id" size="20" spellcheck="false" onInput={(event) => (loginId = (event.target as HTMLInputElement).value)} />
						</td>
					</tr>
					<tr>
						<td>password:</td>
						<td>
							<input type="password" name="password" size="20" onInput={(event) => (loginPassword = (event.target as HTMLInputElement).value)} />
						</td>
					</tr>
				</tbody>
			</table>
			<br />
			<input type="submit" value="login" />
		</form>
		<a href="/forgot">Forgot your password?</a>
		<br />
		<br />
		<b>Create Account</b>
		<br />
		<br />
		<form
			method="post"
			action="/register"
			style="margin-bottom:1em"
			onSubmit={(event) => {
				if (session.signedIn || registerError) event.preventDefault();
				if (session.signedIn) void navigate('/login?how=loggedin');
				else if (registerError) validationMessage = registerError;
			}}
		>
			<table style="border:0px">
				<tbody>
					<tr>
						<td>username:</td>
						<td>
							<input type="text" name="id" size="20" autocorrect="off" spellcheck="false" autocapitalize="off" onInput={(event) => (registerId = (event.target as HTMLInputElement).value)} />
						</td>
					</tr>
					<tr>
						<td>password:</td>
						<td>
							<input type="password" name="password" size="20" onInput={(event) => (registerPassword = (event.target as HTMLInputElement).value)} />
						</td>
					</tr>
				</tbody>
			</table>
			<br />
			<input type="submit" value="create account" />
		</form>
	</div>
	</>
}
