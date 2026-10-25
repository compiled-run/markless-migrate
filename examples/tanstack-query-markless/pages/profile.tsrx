import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Shell } from '../components/shell.tsrx';
import { bindRequest } from '../lib/request.ts';
import { here, onServer, storedSandbox } from '../lib/where.ts';
import { redirect } from '../lib/page.ts';
import { stringifySearch } from '../lib/search.ts';
import { auth } from '../lib/server.ts';

export default function Profile({ url, http }: PageProps) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();
	const signedIn = ctx ? auth(ctx) : { status: 'loggedOut' as const, username: undefined };
	// The _auth route's beforeLoad: signed out, it sends the visitor to /login with where they were going.
	if (signedIn.status === 'loggedOut') redirect(http, `/login${stringifySearch({ redirect: `${url.pathname}${url.search}` })}`);
	const username = signedIn.username ?? '';

	<Shell url={url} sandbox={sandbox}>
		<div class="p-2 space-y-2">
			<div>
				{'Username:'}
				<strong>{username}</strong>
			</div>
		</div>
	</Shell>
}
