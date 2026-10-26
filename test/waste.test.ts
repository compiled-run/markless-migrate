import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundle } from '../fixtures/waste/server.ts';
import { attribute, decodeMappings, inlineScripts, ownerOf, ranMask, wasteFlags, wasteHtml, wasteLines, wasteOf, wasteSummaryLines, type WasteReport } from '../src/check/waste.ts';
import type { NetworkRun } from '../src/check/slow-network.ts';

test('source-map segments decode to their generated line, column and source', () => {
	// Line 0: col 0 of source 0, col 10 of source 1; line 1: col 4 of source 1, then a segment with no source.
	assert.deepEqual(decodeMappings('AAAA,UCAA;IAAA,C'), [
		{ line: 0, column: 0, source: 0 },
		{ line: 0, column: 10, source: 1 },
		{ line: 1, column: 4, source: 1 },
		{ line: 1, column: 5, source: -1 },
	]);
});

test('a source is owned by its package, a Markless package is the framework, and a library port and the registry are named by their path in the app', () => {
	assert.deepEqual(ownerOf('../../node_modules/.pnpm/@floating-ui+dom@1.7.6/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs'), { owner: { kind: 'package', name: '@floating-ui/dom' }, module: 'dist/floating-ui.dom.mjs' });
	assert.deepEqual(ownerOf('../../../../node_modules/@markless/web/dist/ssr-Dt0rK9k4.js'), { owner: { kind: 'framework', name: '@markless/web' }, module: 'dist/ssr-Dt0rK9k4.js' });
	assert.deepEqual(ownerOf('webpack://app/node_modules/cmdk/dist/index.mjs').owner, { kind: 'package', name: 'cmdk' });
	assert.deepEqual(ownerOf('../../../../lib/parts/radix/dialog.ts').owner, { kind: 'library port', name: 'lib/parts/radix/dialog' });
	assert.deepEqual(ownerOf('../../../../lib/parts/registry.ts').owner, { kind: 'parts registry', name: 'lib/parts/registry.ts' });
	assert.deepEqual(ownerOf('../../../../pages/docs/components/base/tabs.tsrx?markless-symbols').owner, { kind: 'page', name: 'pages/docs/components/base/tabs.tsrx' });
	assert.deepEqual(ownerOf('\0rolldown/runtime.js').owner, { kind: 'generated', name: 'rolldown/runtime.js' });
	assert.deepEqual(ownerOf('src/lib/parts-list.ts').owner, { kind: 'app', name: 'src/lib/parts-list.ts' });
});

test('what ran is split into code inside functions, code that only ran as the script loaded, and code that never ran', () => {
	const mask = ranMask({ url: 'x', functions: [{ ranges: [{ startOffset: 0, endOffset: 100, count: 1 }, { startOffset: 90, endOffset: 100, count: 0 }] }, { ranges: [{ startOffset: 10, endOffset: 30, count: 0 }] }, { ranges: [{ startOffset: 40, endOffset: 60, count: 3 }] }] }, 100);
	const count = (v: number) => mask.filter((m) => m === v).length;
	assert.deepEqual([count(0), count(1), count(2)], [30, 20, 50]);
});

test('a script is split among the owners its map names; what the map leaves out is the file\'s own, and a script that was never evaluated never ran at all', () => {
	const { code, map } = bundle([
		{ source: 'node_modules/big/index.js', code: 'function a(){return 1}\nfunction b(){return 2}' },
		{ source: 'src/main.ts', code: 'a();' },
	]);
	const header = '//# header\n';
	const text = header + code;
	const shifted = JSON.parse(map) as { sources: string[]; mappings: string };
	const mask = ranMask({ url: 'x', functions: [{ ranges: [{ startOffset: 0, endOffset: text.length, count: 1 }] }, { ranges: [{ startOffset: text.indexOf('function a'), endOffset: text.indexOf('\nfunction b'), count: 1 }] }, { ranges: [{ startOffset: text.indexOf('function b'), endOffset: text.indexOf('\na();'), count: 0 }] }] }, text.length);
	const { items, js } = attribute([{ file: '/x.js', text, mask, map: { ...shifted, mappings: `;${shifted.mappings}` } }]);
	const by = (name: string) => items.find((i) => i.name === name)!;
	assert.equal(by('big').neverRan, 'function b(){return 2}'.length);
	assert.equal(by('big').ranInFunctions, 'function a(){return 1}'.length);
	assert.equal(by('src/main.ts').ranAtTopLevel, 'a();'.length);
	assert.deepEqual([by('/x.js').kind, by('/x.js').bytes], ['unmapped', header.length]);
	assert.equal(js.bytes, text.length);
	const unrun = attribute([{ file: '/lazy.js', text: 'function z(){}' }]);
	assert.deepEqual([unrun.items[0]!.kind, unrun.items[0]!.neverRan], ['file', 14]);
});

test('inline scripts are code or data by their type', () => {
	const html = '<script>a()</script><script type="module" data-x>b()</script><script type="importmap">{"imports":{}}</script><script type="markless/state">[1]</script><script src="/c.js"></script>';
	assert.deepEqual(
		inlineScripts(html).map((s) => [s.attrs, s.js]),
		[
			['', true],
			['type="module" data-x', true],
			['type="importmap"', false],
			['type="markless/state"', false],
		],
	);
});

test('the report counts what was requested before the answer, names inline blocks, and its lines and HTML say so', async () => {
	const html = '<html><script type="importmap">{"imports":{"a":"/a.js"}}</script><script>go()</script></html>';
	const run: NetworkRun = {
		answered: 2000,
		clicks: 2,
		bytes: 5000,
		jsDownloaded: 3000,
		requests: [
			{ url: 'https://site.test/', type: 'document', start: 0, end: 500, bytes: 1000 },
			{ url: 'https://site.test/a.js', type: 'script', start: 600, end: 1500, bytes: 2000 },
			{ url: 'https://site.test/late.js', type: 'script', start: 2500, end: 2900, bytes: 1000 },
		],
		capture: {
			document: { url: 'https://site.test/', text: html },
			scripts: [
				{ url: 'https://site.test/a.js', type: 'script', start: 600, end: 1500, bytes: 2000, text: 'function used(){}used();function unused(){return "<b>"}' },
				{ url: 'https://site.test/late.js', type: 'script', start: 2500, end: 2900, bytes: 1000, text: 'late()' },
			],
			coverage: [{ url: 'https://site.test/a.js', functions: [{ ranges: [{ startOffset: 0, endOffset: 55, count: 1 }] }, { ranges: [{ startOffset: 24, endOffset: 55, count: 0 }] }] }, { url: 'https://site.test/', source: 'go()', functions: [{ ranges: [{ startOffset: 0, endOffset: 4, count: 1 }] }] }],
		},
	};
	const report = await wasteOf('https://site.test/', run, { profile: 'regular-3g', control: '[role=tab]', budget: 10, lookupMap: async () => undefined });
	assert.deepEqual(report.downloaded, { document: 1000, script: 2000 });
	assert.equal(report.scripts, 1, 'the script requested after the answer is left out');
	assert.deepEqual(report.items.map((i) => [i.kind, i.name, i.neverRan]), [
		['file', '/a.js', 31],
		['inline script', '<script>', 0],
	]);
	assert.equal(report.inlineData[0]?.name, '<script type="importmap">');
	const lines = wasteLines(report).join('\n');
	assert.match(lines, /before the first click answered \(2\.0 s\)/);
	assert.match(lines, /over the 0\.0 kB budget/);
	assert.match(lines, /1 of 1 scripts had no source map/);
	assert.match(lines, /inline in the HTML \(brotli\)/);
	assert.match(wasteHtml(report), /&lt;script type=&quot;importmap&quot;&gt;/);
});

test('check measures first-click waste unless --no-waste, with a budget in kB and reference pages', () => {
	assert.deepEqual(wasteFlags({}), { options: {} });
	assert.deepEqual(wasteFlags({ 'no-waste': true }), {});
	assert.deepEqual(wasteFlags({ 'js-budget': '80', reference: ['https://qwik.example/tabs'], 'waste-profile': 'regular-2g' }), { options: { profile: 'regular-2g', budget: 80_000, references: ['https://qwik.example/tabs'] } });
	assert.match(String(wasteFlags({ 'no-waste': true, reference: ['https://a.example/'] }).error), /--no-waste and --reference contradict/);
});

test('the summary warns about the pages over the JS budget, never red, and puts the reference pages beside them', () => {
	const page = (brotli: number, never: number): WasteReport => ({ url: 'https://new.example/x', profile: 'regular-3g', control: 'tab', answered: 3000, mapped: 1, scripts: 1, js: { bytes: brotli * 3, brotli, ranInFunctions: 0, ranAtTopLevel: 0, neverRan: never * 3, neverRanBrotli: never }, items: [], kinds: [], inlineData: [], downloaded: {}, budget: 60_000, ms: 1 });
	const lines = wasteSummaryLines([{ route: '/tabs', waste: page(189_000, 149_000) }, { route: '/', waste: page(20_000, 1_000) }], [{ ...page(25_000, 5_000), url: 'https://qwik.example/tabs', answered: 1500 }]).join('\n');
	assert.match(lines, /^First-click JS \(a warning, not red\): 1 of 2 pages measured download more than 60\.0 kB of brotli JavaScript before their first click answers: \/tabs 189 kB \(149 kB never ran\)\.$/m);
	assert.match(lines, /^  https:\/\/qwik\.example\/tabs: answered at 1\.5 s, 25\.0 kB brotli JS before it, 5\.0 kB of it never ran$/m);
	assert.match(wasteSummaryLines([{ route: '/', waste: page(20_000, 1_000) }]).join('\n'), /1 page measured, each within 60\.0 kB/);
	assert.deepEqual(wasteSummaryLines([]), []);
});

test('a control that never answered still gets a report, of what downloaded and ran by the time the run gave up', async () => {
	const run: NetworkRun = {
		clicks: 40,
		bytes: 3000,
		jsDownloaded: 2000,
		error: 'the control (x) never answered a click within 60 s',
		requests: [{ url: 'https://site.test/a.js', type: 'script', start: 600, end: 1500, bytes: 2000 }],
		capture: { scripts: [{ url: 'https://site.test/a.js', type: 'script', start: 600, end: 1500, bytes: 2000, text: 'function f(){}' }], coverage: [] },
	};
	const report = await wasteOf('https://site.test/', run, { profile: 'regular-3g', control: 'x', lookupMap: async () => undefined });
	assert.equal(report.error, undefined);
	assert.equal(report.unanswered, 'the control (x) never answered a click within 60 s');
	assert.equal(report.js.neverRan, 14);
	assert.match(wasteLines(report).join('\n'), /by the end of the run \(the control never answered\)[^]*never answered a click within 60 s/);
	const failed = await wasteOf('https://site.test/', { ...run, capture: undefined }, { profile: 'regular-3g', control: 'x' });
	assert.equal(failed.error, 'the control (x) never answered a click within 60 s');
});
