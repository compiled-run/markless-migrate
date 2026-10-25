import { state } from '@markless/core';

// TanStack Router's ErrorComponent as a production build renders it: the message hidden until asked for.
export function ErrorComponent({ error }: { error: unknown }) @{
	let show = state(false);

	<div style="padding: 0.5rem; max-width: 100%;">
		<div style="display: flex; align-items: center; gap: 0.5rem;">
			<strong style="font-size: 1rem;">Something went wrong!</strong>
			<button
				style="appearance: none; font-size: 0.6em; border: 1px solid; padding: 0.1rem 0.2rem; font-weight: bold; border-radius: 0.25rem;"
				onClick={() => (show = !show)}
			>
				{show ? 'Hide Error' : 'Show Error'}
			</button>
		</div>
		<div style="height: 0.25rem;"></div>
		@if (show) {
			<div>
				<pre style="font-size: 0.7em; border: 1px solid red; border-radius: 0.25rem; padding: 0.3rem; color: red; overflow: auto;">
					<code>{(error as Error)?.message ?? ''}</code>
				</pre>
			</div>
		}
	</div>
}
