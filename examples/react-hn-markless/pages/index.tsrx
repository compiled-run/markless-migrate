import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';
import Stories from '../components/Stories.tsrx';

export default function Top({ url }: PageProps) @{
	<App path={url.pathname}>
		<Stories type="topstories" limit={500} title="" route="news" search={url.search} />
	</App>
}
