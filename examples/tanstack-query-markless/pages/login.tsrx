import { state } from '@markless/core';
import { navigate, type PageProps } from '@markless/router';
import { Shell } from '../components/shell.tsrx';
import { bindRequest } from '../lib/request.ts';
import { here, onServer, storedSandbox } from '../lib/where.ts';
import { login, logout } from '../lib/data.ts';
import { parseSearch } from '../lib/search.ts';
import { auth } from '../lib/server.ts';

export default function Login({ url, http }: PageProps) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();
	const signedIn = ctx ? auth(ctx) : { status: 'loggedOut' as const, username: undefined };
	const target = parseSearch(here(url).search).redirect;
	const redirectTo = typeof target === 'string' ? target : '';
	let loggedIn = state(signedIn.status === 'loggedIn');
	let username = state(signedIn.username ?? '');
	let draft = state('');

	<Shell url={url} sandbox={sandbox}>
		@if (loggedIn) {
			<div>
				{'Logged in as '}
				<strong>{username}</strong>
				<div class="h-2"></div>
				<button
					class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded-sm"
					onClick={async () => {
						await logout();
						loggedIn = false;
						username = '';
					}}
				>
					Log out
				</button>
				<div class="h-2"></div>
			</div>
		} @else {
			<div class="p-2">
				<div>You must log in!</div>
				<div class="h-2"></div>
				<form
					method="dialog"
					class="flex gap-2"
					onSubmit={async (event) => {
						event.preventDefault();
						const name = draft;
						await login(name);
						username = name;
						loggedIn = true;
						if (redirectTo) await navigate(redirectTo);
					}}
				>
					<input placeholder="Username" class="border p-1 px-2 rounded-sm" value={draft} onInput={(event) => (draft = (event.target as HTMLInputElement).value)} />
					<button type="submit" class="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded-sm">
						Login
					</button>
				</form>
			</div>
		}
	</Shell>
}
