import type { PageProps } from '@markless/router';
import { Shell } from '../../components/layout/shell.tsrx';
import { layoutPrefs } from '../../components/layout/prefs.ts';
import { ComingSoon } from '../../components/errors/errors.tsrx';

export default function HelpCenter({ http }: PageProps) @{
	const prefs = layoutPrefs(http.request.headers.get('cookie'));
	<Shell active="/help-center" header="none" prefs={prefs}>
		<ComingSoon />
	</Shell>
}
