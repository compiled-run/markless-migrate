import { computed } from '@markless/core';
import HeadCard from '../components/head-card.tsrx';
import ToggleRow from '../components/toggle-row.tsrx';
import { slow } from '../lib/slow.ts';

// Expected: clicking the first [-] shows [+] and hides "first". Actual: "Resume locator r:1:c1:h1 expected <span> at DOM order index 2 but found <div>", and no toggle answers.
export default function TwoBoundaries() @{
	const head = computed(async () => slow({ label: 'head', href: '/item/1' }, 30));
	const rows = computed(async () => slow([{ id: 1, name: 'first' }, { id: 2, name: 'second' }], 80));
	<main>
		@try {
			<HeadCard label={head.label} href={head.href} />
		} @pending {
			<p>loading head</p>
		} @catch {
			<p>failed</p>
		}
		@try {
			<div>
				@for (const row of rows; key row.id) {
					<ToggleRow name={row.name} />
				}
			</div>
		} @pending {
			<p>loading rows</p>
		} @catch {
			<p>failed</p>
		}
	</main>
}
