import { state } from '@markless/core';

export default function Page() @{
	let open = state(false);

	<main>
		<button class="toggle" onClick={() => (open = !open)}>{open ? 'close' : 'open'}</button>
		@if (open) {
			<div class="panel" tabindex="-1" attach={(panel) => (panel as HTMLElement).focus()}>
				<p>panel</p>
			</div>
		}
	</main>
}
