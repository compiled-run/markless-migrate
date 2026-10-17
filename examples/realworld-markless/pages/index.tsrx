import type { PageProps } from '@markless/router';
import Home from '../components/home.tsrx';

export default function Index({ url }: PageProps) @{
	<Home pathname={url.pathname} search={url.search} tag="" />
}
