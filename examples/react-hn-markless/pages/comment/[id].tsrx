import type { PageProps } from '@markless/router';
import App from '../../components/App.tsrx';
import Permalinked from '../../components/Permalinked.tsrx';

export default function CommentPage({ url, params }: PageProps<{ id: string }>) @{
	<App path={url.pathname}>
		<Permalinked id={params.id} />
	</App>
}
