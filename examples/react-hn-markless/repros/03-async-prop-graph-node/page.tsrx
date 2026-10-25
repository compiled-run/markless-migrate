import type { PageProps } from '@markless/router';
import Parent from './Parent.tsrx';

export default function Page({ url }: PageProps) @{
	<main>
		<Parent id={url.pathname} />
	</main>
}
