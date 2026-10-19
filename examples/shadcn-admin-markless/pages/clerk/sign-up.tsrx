import type { PageProps } from '@markless/router';
import { ClerkMissingKey } from '../../components/clerk/missing-key.tsrx';
import { layoutPrefs } from '../../components/layout/prefs.ts';

export default function ClerkSignUp({ http }: PageProps) @{
	const prefs = layoutPrefs(http.request.headers.get('cookie'));
	<ClerkMissingKey active="/clerk/sign-up" prefs={prefs} />
}
