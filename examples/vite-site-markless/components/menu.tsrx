import { element, state } from '@markless/core';

export default function Menu() @{
	let open = state(false);
	const button = element<HTMLButtonElement>();

	<div
		class="menu"
		onKeyDown={(event) => {
			if (event.key === 'Escape' && open) {
				open = false;
				button?.focus();
			}
		}}
	>
		<button el={button} type="button" class="menu-button" aria-expanded={open ? 'true' : 'false'} aria-controls="more-menu" onClick={() => (open = !open)}>
			More
		</button>
		<ul id="more-menu" hidden={!open}>
			<li><a href="/about/">Our guides</a></li>
			<li><a href="/fr/">Randonnées en français</a></li>
		</ul>
	</div>
}
