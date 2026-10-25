import type { PageProps } from '@markless/router';
import App from '../components/App.tsrx';
import Updates from '../components/Updates.tsrx';

export default function NewComments({ url }: PageProps) @{
	<App path={url.pathname} search={url.search}>
		<Updates search={url.search} />
	</App>
}
