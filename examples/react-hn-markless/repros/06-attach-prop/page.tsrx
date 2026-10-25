import type { PageProps } from '@markless/router';
import Region from './Region.tsrx';

export default function Page({ url }: PageProps) @{
	<main>
		<Region id={url.pathname} />
	</main>
}
