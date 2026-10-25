import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';
import Stories from '../components/Stories.tsrx';

export default function Read({ url }: PageProps) @{
	<App path={url.pathname} search={url.search}>
		<Stories type="read" limit={0} title="Read Stories" route="read" search={url.search} />
	</App>
}
