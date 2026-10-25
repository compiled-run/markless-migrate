import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';
import Stories from '../components/Stories.tsrx';

export default function Jobs({ url }: PageProps) @{
	<App path={url.pathname} search={url.search}>
		<Stories type="jobstories" limit={200} title="Jobs" route="jobs" search={url.search} />
	</App>
}
