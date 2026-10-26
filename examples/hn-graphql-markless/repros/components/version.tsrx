import { shared, state } from '@markless/core';

export const counter = shared(
	() => {
		const box = state({ v: 0 });
		return { ...box };
	},
	{ scope: 'page' },
);

export default function Bump() @{
	const c = counter();
	<button id="bump" onClick={() => c.v++}>bump</button>
}
