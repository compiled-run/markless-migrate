import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, parseParams, parseSnapshot, previewValues, serializeParams, shuffled, snapshotOf, typesetDocs, updateSearch, type TypesetParams } from '../examples/shadcn-ui-markless/lib/site/typeset-params.ts';

// What ui.shadcn.com's /typeset (the pinned build, mm-shadcn-ui-old) showed for these picks, read off the page.
const OLD_URL = 'https://mm-shadcn-ui-old.long-wildflower-ecf7.workers.dev';
const picks: TypesetParams = { ...DEFAULTS, heading: 'lora', scale: '16' };

test('a pick is written where its key stands, a new key appended, and a default leaves the URL (nuqs clearOnDefault)', () => {
	let search = updateSearch('', { body: 'inter' });
	assert.equal(search, '?body=inter');
	search = updateSearch(search, { scale: '16' });
	assert.equal(search, '?body=inter&scale=16');
	search = updateSearch(search, { body: 'geist' });
	assert.equal(search, '?scale=16');
	search = updateSearch(search, { heading: 'lora' });
	assert.equal(search, '?scale=16&heading=lora');
	assert.equal(updateSearch('?scale=16&heading=lora&x=1', null), '?x=1');
});

test('an invalid or absent value reads as the default; the serializer writes non-defaults in the parsers order', () => {
	assert.deepEqual(parseParams('?body=comic-sans&scale=16'), { ...DEFAULTS, scale: '16' });
	const params = parseParams('?body=inter&heading=roboto&scale=16&measure=60&leading=1.6&flow=1em&item=article');
	assert.equal(serializeParams(`/preview/typeset/${params.item}`, params), '/preview/typeset/article?body=inter&heading=roboto&scale=16&measure=60&flow=1em&leading=1.6&item=article');
	assert.equal(serializeParams('/preview/typeset/docs', DEFAULTS), '/preview/typeset/docs');
});

test('a history entry holds every param as the URL has it, and restores invalid or absent ones as null', () => {
	const entry = snapshotOf('?scale=16&heading=lora');
	assert.equal(entry, '{"body":null,"heading":"lora","mono":null,"scale":"16","measure":null,"flow":null,"leading":null,"item":null}');
	assert.deepEqual(parseSnapshot(entry), { body: null, heading: 'lora', mono: null, scale: '16', measure: null, flow: null, leading: null, item: null });
	assert.equal(parseSnapshot('not json').body, null);
	assert.equal(parseSnapshot('{"body":"nope"}').body, null);
});

test('shuffle draws every unlocked param in useShuffle order and leaves the specimen and locked params alone', () => {
	const draws: number[] = [];
	const random = () => {
		draws.push(0);
		return 0.999;
	};
	const next = shuffled(['mono', 'flow'], random);
	assert.equal(draws.length, 7);
	assert.deepEqual(Object.keys(next), ['body', 'heading', 'scale', 'measure', 'leading']);
	assert.deepEqual(next, { body: 'lora', heading: 'lora', scale: '18', measure: '90', leading: '1.9' });
	assert.equal(updateSearch('', shuffled([], () => 0)), '?mono=jetbrains-mono&scale=14&measure=60&leading=1.6&flow=1em');
});

test('the preview takes the size, rhythm, measure and fonts as CSS variables, a heading that inherits taking the body font', () => {
	assert.deepEqual(previewValues({ ...DEFAULTS, body: 'inter' }), {
		'--preview-size': '15px',
		'--preview-leading': '1.75',
		'--preview-flow': '1.25em',
		'--preview-measure': '37em',
		'--preview-font': "var(--font-inter), 'Inter Variable', sans-serif",
		'--preview-font-heading': "var(--font-inter), 'Inter Variable', sans-serif",
		'--preview-font-mono': "var(--font-geist-mono), 'Geist Mono Variable', monospace",
	});
});

test('the Next.js instructions load the picked fonts with next/font, each once', () => {
	const docs = typesetDocs(picks, 'next', OLD_URL);
	assert.equal(docs.nextFontCode, '// app/layout.tsx\nimport { Geist, Lora, Geist_Mono } from "next/font/google"\n\nconst geist = Geist({\n  subsets: ["latin"],\n  variable: "--font-geist",\n})\n\nconst lora = Lora({\n  subsets: ["latin"],\n  variable: "--font-lora",\n})\n\nconst geistMono = Geist_Mono({\n  subsets: ["latin"],\n  variable: "--font-geist-mono",\n})\n\n<html className={`${geist.variable} ${lora.variable} ${geistMono.variable}`}>');
	assert.equal(docs.preset, '/* globals.css */\n@import "tailwindcss";\n@import "./typeset.css";\n\n.typeset-docs {\n  --typeset-font-body: var(--font-geist);\n  --typeset-font-heading: var(--font-lora);\n  --typeset-font-mono: var(--font-geist-mono);\n  --typeset-size: 16px;\n  --typeset-leading: 1.75;\n  --typeset-flow: 1.25em;\n}');
	assert.equal(docs.usage, '<div className="typeset typeset-docs max-w-[37em]">\n  {content}\n</div>');
	assert.equal(typesetDocs({ ...picks, body: 'lora' }, 'next', OLD_URL).nextFontCode.split('\n')[1], 'import { Lora, Geist_Mono } from "next/font/google"');
});

test('every other framework installs the fonts from Fontsource, and the prompt carries that step', () => {
	const docs = typesetDocs(picks, 'vite', OLD_URL);
	assert.equal(docs.fontsourceCommand, 'npm install @fontsource-variable/geist @fontsource-variable/lora @fontsource-variable/geist-mono');
	assert.equal(docs.fontsourceCss, '/* globals.css */\n@import "@fontsource-variable/geist";\n@import "@fontsource-variable/lora";\n@import "@fontsource-variable/geist-mono";\n\n:root {\n  --font-geist: \'Geist Variable\', sans-serif;\n  --font-lora: \'Lora Variable\', serif;\n  --font-geist-mono: \'Geist Mono Variable\', monospace;\n}');
	assert.ok(docs.prompt.startsWith('Install shadcn/typeset in this project.\n\nTypeset is a single stylesheet'));
	assert.ok(docs.prompt.includes(`1. Download ${OLD_URL}/typeset.css and save it as typeset.css`));
	assert.ok(docs.prompt.includes('3. Install the fonts:\n\nnpm install @fontsource-variable/geist @fontsource-variable/lora @fontsource-variable/geist-mono\n\nThen import them in the main CSS file:\n\n/* globals.css */'));
	assert.ok(docs.prompt.endsWith(`- Docs: ${OLD_URL}/docs/typeset`));
	assert.ok(typesetDocs(picks, 'next', OLD_URL).prompt.includes('3. Load the fonts in the root layout and update the HTML element:\n\n// app/layout.tsx\n'));
});
