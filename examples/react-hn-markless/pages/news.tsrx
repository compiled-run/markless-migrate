import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';
import Stories from '../components/Stories.tsrx';

export default function News({ url }: PageProps) @{
	<App path={url.pathname} search={url.search}>
		<Stories type="topstories" limit={500} title="" route="news" search={url.search} />
	</App>
}
