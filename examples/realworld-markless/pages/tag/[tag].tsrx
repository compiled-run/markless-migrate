import type { PageProps } from '@markless/router';
import Home from '../../components/home.tsrx';

export default function Tag({ params, url }: PageProps<{ tag: string }>) @{
	<Home pathname={url.pathname} search={url.search} tag={params.tag} />
}
