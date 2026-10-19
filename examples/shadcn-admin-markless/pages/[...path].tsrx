// The old app is a single-page app: every path it has no route for answers 200 with its not-found page, and /500 is a
// route of its own (pages/404.tsrx and pages/500.tsrx would be status pages here, not routes).
import type { PageProps } from '@markless/router';
import { StandaloneError } from '../components/errors/standalone.tsrx';

export default function Fallback({ params }: PageProps<{ readonly path: string }>) @{
	const code = params.path === '500' ? '500' : '404';
	<StandaloneError code={code} />
}
