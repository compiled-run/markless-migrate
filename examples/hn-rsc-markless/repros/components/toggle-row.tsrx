import { state } from '@markless/core';

export default function ToggleRow({ name }: { readonly name: string }) @{
	let open = state(true);
	<div class="row">
		<span class="toggle" onClick={() => (open = !open)}>{open ? '[-]' : '[+]'}</span>
		<div hidden={!open}>{name}</div>
	</div>
}
