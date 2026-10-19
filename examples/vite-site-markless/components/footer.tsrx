import { state, type Children } from '@markless/core';

export default function Footer({ children }: { readonly children?: Children }) @{
	let renderedAt = state('');

	<footer>
		<p>Page rendered at <time data-rendered-at onIdle={() => { renderedAt = new Date().toISOString(); }}>{renderedAt}</time></p>
		{children}
	</footer>
}
