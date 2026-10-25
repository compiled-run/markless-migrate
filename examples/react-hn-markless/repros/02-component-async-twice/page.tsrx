import type { PageProps } from '@markless/router';
import Fetched from './Fetched.tsrx';

export default function Page({ url }: PageProps) @{
	<main>
		<Fetched id={url.pathname} />
	</main>
}
