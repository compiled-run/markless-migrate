import { shared, state } from '@markless/core';
import { START } from './create-runtime.ts';

// /create's state: the params, history and preview the runtime reports, and what the designer's controls hold.


export const createState = shared(
	() => {
		const t = state({
			// What the runtime says the params, history and preview now are.
			view: START,
			// Set once the page runs: the iframe is rendered from then on, so the server renders none.
			ready: false,
			locks: [] as readonly string[],
			mobile: false,
			mac: false,
			dark: false,
			packageManager: 'pnpm',
			copiedPreset: false,
			presetInput: '',
			getCodeTab: 'new-project',
			applyMode: 'full',
			copiedTarget: '',
		});
		return { ...t };
	},
	{ scope: 'page' },
);
