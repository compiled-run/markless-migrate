import { computed } from '@markless/core';
import Bump, { counter } from '../components/version.tsrx';

const load = async (v: number) => ({ text: `loaded ${v}` });

// An async computed that reads a shared() field before its await. Expected the served page reads "loaded 0"; actual the server renders @catch ("failed"); in the browser, after a click, it works.
export default function Page() @{
	const c = counter();
	const data = computed(async () => {
		const v = c.v;
		return load(v);
	});
	<main>
		@try {
			<p id="out">{data.text}</p>
		} @pending {
			<p id="out">pending</p>
		} @catch {
			<p id="out">failed</p>
		}
		<Bump />
	</main>
}
