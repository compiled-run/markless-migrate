import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';
import Stories from '../components/Stories.tsrx';

export default function Ask({ url }: PageProps) @{
	<App path={url.pathname} search={url.search}>
		<Stories type="askstories" limit={200} title="Ask" route="ask" search={url.search} />
	</App>
}
