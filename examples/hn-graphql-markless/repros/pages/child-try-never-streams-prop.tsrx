import { computed } from '@markless/core';
import ShowProp from '../components/show-prop.tsrx';

const load = () => new Promise<{ text: string }>((resolve) => setTimeout(() => resolve({ text: 'loaded' }), 50));

// As child-try-never-streams, the async value made by the page and read in the child's @try. Expected "pending | loaded"; actual "pending".
export default function Page() @{
	const data = computed(async () => load());
	<ShowProp data={data} />
}
