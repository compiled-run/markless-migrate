// What a page renders after its own root, in the old body's order: a toaster renders outside a branch (its repeat nests a
// repeat), so the children around it are branches of their own on each side of it, never all moved before it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageBody } from '../src/convert/document.ts';

test('a page with a toaster between the body children after its root keeps them in the old order', () => {
	assert.equal(
		pageBody('<main />', [{ markup: '<section aria-label="Notifications alt+T" />', toaster: true }, { markup: '<BodyAfter1 />' }, { markup: '<Layer2 />' }], 'SHOWN'),
		'<>@if (SHOWN) { <main /> }<section aria-label="Notifications alt+T" />@if (SHOWN) { <><BodyAfter1 /><Layer2 /></> }</>',
	);
	assert.equal(pageBody('<main />', [{ markup: '<BodyAfter0 />' }, { markup: '<Layer2 />' }], 'SHOWN'), '<>@if (SHOWN) { <main /> }@if (SHOWN) { <><BodyAfter0 /><Layer2 /></> }</>');
	assert.equal(pageBody('<main />', [], 'SHOWN'), '<main />');
});

test('a toaster between two branches of a page compiles', async () => {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	const toaster = '<section aria-label="Notifications alt+T">@for (const list of lists; key list.position) { <ol>@for (const t of list.toasts; key t.id) { <li>{t.text}</li> }</ol> }</section>';
	const body = pageBody('<main>Hi</main>', [{ markup: toaster, toaster: true }, { markup: '<Portal />' }], 'PAGE_SHOWN');
	const source = `import { state } from '@markless/core';\nfunction Portal() @{ <div role="region" aria-label="Notifications"></div> }\nconst PAGE_SHOWN = true;\nexport default function Page() @{\n\tlet lists = state([{ position: 'top', toasts: [{ id: 1, text: 'a' }] }]);\n\t${body}\n}\n`;
	const result = await compileTsrxModule({ filename: 'pages/t.tsrx', source, symbols: [] });
	assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), []);
});
