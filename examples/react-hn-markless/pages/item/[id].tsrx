import type { PageProps } from '@markless/router';
import App from '../../components/App.tsrx';
import ItemView from '../../components/ItemView.tsrx';

export default function ItemPage({ url, params }: PageProps<{ id: string }>) @{
	<App path={url.pathname} search={url.search}>
		<ItemView id={params.id} path={url.pathname} />
	</App>
}
