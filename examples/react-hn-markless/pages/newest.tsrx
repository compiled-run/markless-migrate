import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';
import Stories from '../components/Stories.tsrx';

export default function Newest({ url }: PageProps) @{
	<App path={url.pathname}>
		<Stories type="newstories" limit={500} title="New Links" route="newest" search={url.search} />
	</App>
}
