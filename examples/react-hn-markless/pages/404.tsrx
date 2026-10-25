import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';

export default function NotFound({ url }: PageProps) @{
	<App path={url.pathname} search={url.search}>
		<h2>Not found</h2>
	</App>
}
