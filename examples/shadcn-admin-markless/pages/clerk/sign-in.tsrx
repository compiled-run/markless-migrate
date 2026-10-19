import type { PageProps } from '@markless/router';
import { ClerkMissingKey } from '../../components/clerk/missing-key.tsrx';
import { layoutPrefs } from '../../components/layout/prefs.ts';

export default function ClerkSignIn({ http }: PageProps) @{
	const prefs = layoutPrefs(http.request.headers.get('cookie'));
	<ClerkMissingKey active="/clerk/sign-in" prefs={prefs} />
}
