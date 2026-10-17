import type { PageProps } from '@markless/router';
import Layout from '../components/layout.tsrx';

// The old app has no wildcard route: Angular rejects the first navigation, puts / in the address bar and leaves the outlet empty.
export default function Unknown({ url }: PageProps<{ rest: string }>) @{
	<Layout>
		<script>{"window.__conduitUnmatched=true;history.replaceState(null,'','/')"}</script>
	</Layout>
}
