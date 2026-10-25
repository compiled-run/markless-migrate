import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';
import Stories from '../components/Stories.tsrx';

export default function Show({ url }: PageProps) @{
	<App path={url.pathname} search={url.search}>
		<Stories type="showstories" limit={200} title="Show" route="show" search={url.search} />
	</App>
}
