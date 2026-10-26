import { computed } from '@markless/core';
import MarkerList from '../components/marker-list.tsrx';

const load = async () => ({ rows: [{ id: 'a', text: 'payload-marker-one' }, { id: 'b', text: 'payload-marker-two' }] });

// An async value handed to a child component as a prop. Expected the served page to carry the value once in its
// markless/state; actual it carries it twice, as the page's computed and again as the child's props.
export default function Page() @{
	const data = computed(async () => load());
	@try {
		<MarkerList data={data} />
	} @pending {
		<p>pending</p>
	}
}
