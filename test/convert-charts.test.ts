import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChartPlan, template } from '../src/convert/charts.ts';
import { attr, body, find, parseDocument } from '../src/convert/dom.ts';
import { emitElement } from '../src/convert/tsrx.ts';

test('states drawn alike but for text and attribute values are one template over a table of the values', () => {
	assert.deepEqual(template(['<div class="a"><span>March</span><b>237</b></div>', '<div class="a"><span>April</span><b>73</b></div>'], 't[i]'), { markup: '<div class="a"><span>{t[i][0]}</span><b>{t[i][1]}</b></div>', rows: [['March', '237'], ['April', '73']] });
	assert.equal(template(['<div><span>a</span></div>', '<div><span>a</span><span>b</span></div>'], 't[i]'), undefined, 'a state with more nodes is not the same template');
	assert.match(template(['<path d="M 1 2" viewBox="0 0 1 1"></path>', '<path d="M 3 4" viewBox="0 0 1 1"></path>'], 'c[i]', true)!.markup, /viewBox="0 0 1 1"/, 'SVG keeps its attribute case');
});

test('a recharts chart: the active point in state(), the tooltip and the SVG\'s added nodes and changed attributes rendered from it', () => {
	const doc = parseDocument('<body><div class="recharts-wrapper"><svg class="recharts-surface" tabindex="0"><g class="layer"><path d="M0"></path></g></svg><div class="recharts-tooltip-wrapper" style="visibility: hidden"></div></div></body>');
	const wrapper = find(body(doc), (el) => attr(el, 'class') === 'recharts-wrapper')!;
	const plan = new ChartPlan();
	const states = [
		{ tooltip: '<div><span>March</span></div>', x: 20, y: null, added: [{ at: '0@-1', html: '<g class="recharts-active-dot"><circle cx="5" cy="6"></circle></g>' }], changed: [] },
		{ tooltip: '<div><span>April</span></div>', x: 40, y: null, added: [{ at: '0@-1', html: '<g class="recharts-active-dot"><circle cx="15" cy="7"></circle></g>' }], changed: [{ path: [0], attr: 'class', value: 'layer recharts-active-shape' }] },
	];
	const variant = { mode: 'x' as const, segments: [[0, 10, 0], [12, 30, 1]] as [number, number, number][], states, points: { '0@-1': { path: [0], before: -1 } }, elements: 2 };
	assert.equal(plan.add(body(doc), [{ sig: 's', nth: 0, width: 100, height: 50, view: [5, 5, 90, 40], variants: [variant], drivers: [] }], () => wrapper, (h) => h), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /data-mm-chart=\{"\{\\"w\\":100,/, 'the facts the part reads are a string expression');
	assert.match(out, /\\"m\\":\\"x\\"/, 'how the pointer picks a point');
	assert.match(out, /onMmchart=\{\(event\) => \(chart0 = \(event as CustomEvent<number>\)\.detail\)\}/);
	assert.match(out, /<link rel="stylesheet" href="\/_converted\/styles\/recharts-motion-[0-9a-f]+\.css" \/>/, 'the entry animation\'s shared stylesheet, linked once');
	assert.match(out, /<div class="recharts-tooltip-wrapper" style="visibility: hidden">@if \(chart0 >= 0\) \{ <><div><span>\{chart0t\[chart0\]\[0\]\}<\/span><\/div><\/> \}<\/div>/);
	assert.match(out, /<g class=\{chart0 >= 0 \? \(chart0c0\[chart0\] \?\? undefined\) : "layer"\}><path d="M0"><\/path>@if \(chart0 >= 0\) \{ <><g class="recharts-active-dot"><circle cx=\{chart0a0\[chart0\]\[0\]\} cy=\{chart0a0\[chart0\]\[1\]\}><\/circle><\/g><\/> \}<\/g>/);
	assert.deepEqual(plan.bind(wrapper)?.declare, ['let chart0 = state(-1);', 'const chart0t = [["March"],["April"]];', 'const chart0a0 = [["5","6"],["15","7"]];', 'const chart0c0 = ["layer","layer recharts-active-shape"];']);
});

test('a card whose controls change the chart: a state() for the SVG shown, set by a press or by the option chosen', () => {
	const doc = parseDocument('<body><div data-slot="card"><div data-slot="card-header"><button data-active="true">Desktop</button><button data-active="false">Mobile</button></div><div class="recharts-wrapper"><svg class="recharts-surface"><g class="a"></g></svg><div class="recharts-tooltip-wrapper"></div></div></div></body>');
	const root = body(doc);
	const wrapper = find(root, (el) => attr(el, 'class') === 'recharts-wrapper')!;
	const buttons = [find(root, (el) => el.tagName === 'button' && attr(el, 'data-active') === 'true')!, find(root, (el) => el.tagName === 'button' && attr(el, 'data-active') === 'false')!];
	const one = (label: string) => ({ mode: 'x' as const, segments: [[0, 10, 0]] as [number, number, number][], states: [{ tooltip: `<b>${label}</b>`, x: 1, y: null, added: [], changed: [] }], points: {}, elements: 1 });
	const plan = new ChartPlan();
	const facts = { sig: 'w', nth: 0, width: 100, height: 50, view: [5, 5, 90, 40] as const, variants: [one('d'), { ...one('m'), svg: '<svg class="recharts-surface"><g class="b"></g></svg>' }], drivers: [{ sig: 'b0', nth: 0, kind: 'press' as const, variant: 0, active: true }, { sig: 'b1', nth: 0, kind: 'press' as const, variant: 1, active: true }] };
	plan.add(root, [facts], (sig) => (sig === 'w' ? wrapper : sig === 'b0' ? buttons[0] : sig === 'b1' ? buttons[1] : undefined), (h) => h);
	const out = emitElement(root, { bind: (el) => plan.bind(el) });
	assert.ok(out.includes('<svg class="recharts-surface" display={chart0v === 0 ? undefined : "none"}><g class="a"></g></svg><svg class="recharts-surface" display={chart0v === 1 ? undefined : "none"}><g class="b"></g></svg>'), 'each SVG the old page drew, the ones not shown hidden');
	assert.match(out, /data-mm-chart=\{chart0v === 0 \? "/);
	assert.match(out, /<button data-active=\{chart0v === 1 \? "true" : "false"\} data-mm-variant="1">Mobile<\/button>/);
	assert.match(out, /<div data-slot="card" onClick=\{\(event\) => \{ const k = \(event\.target as Element\)\.closest\('\[data-mm-variant\]'\)/);
});
