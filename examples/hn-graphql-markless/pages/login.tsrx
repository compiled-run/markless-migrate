import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import LoginView from '../components/login-view.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';

export default function Page({ url }: PageProps) @{
	const session = computed(async () => loadSession());
	@try {
		<LoginView session={session} search={url.search} />
	} @pending {
		<LoginView session={signedOut} search={url.search} />
	}
}
