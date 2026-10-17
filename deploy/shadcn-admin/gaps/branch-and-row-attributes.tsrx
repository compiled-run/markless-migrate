import { computed, state } from '@markless/core';

export default function Repro() @{
	let kind = state('');
	let title = state('');
	const showing = computed(() => kind !== '');
	let rows = state([{ id: 'a', on: false }, { id: 'b', on: false }]);

	<main>
		<button id="show" onClick={() => { kind = 'loading'; title = 'Signing in...'; }}>show</button>
		<button id="flip" onClick={() => (rows = rows.map((r) => ({ ...r, on: !r.on })))}>flip</button>
		<button id="rev" onClick={() => (rows = [...rows].reverse())}>reverse</button>
		<ol id="if">
			<li hidden={!showing} data-type={kind}><div data-visible={kind === 'loading' ? 'true' : 'false'}>x</div>{title}</li>
		</ol>
		<ul id="rows">
			@for (const r of rows; key r.id) {
				<li data-on={r.on ? 'yes' : 'no'} hidden={!r.on}>{r.id}</li>
			}
		</ul>
	</main>
}
