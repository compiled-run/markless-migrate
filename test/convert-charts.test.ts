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

test('a recharts chart: the active point in state(), the tooltip and the SVG\'s added nodes rendered from it', () => {
	const doc = parseDocument('<body><div class="recharts-wrapper"><svg class="recharts-surface" tabindex="0"><g class="layer"><path d="M0"></path></g></svg><div class="recharts-tooltip-wrapper" style="visibility: hidden"></div></div></body>');
	const wrapper = find(body(doc), (el) => attr(el, 'class') === 'recharts-wrapper')!;
	const plan = new ChartPlan();
	const states = [
		{ from: 0, to: 10, tooltip: '<div><span>March</span></div>', x: 20, y: 10, added: [{ at: '0@-1', html: '<g class="recharts-active-dot"><circle cx="5" cy="6"></circle></g>' }] },
		{ from: 12, to: 30, tooltip: '<div><span>April</span></div>', x: 40, y: 10, added: [{ at: '0@-1', html: '<g class="recharts-active-dot"><circle cx="15" cy="7"></circle></g>' }] },
	];
	assert.equal(plan.add(body(doc), [{ sig: 's', nth: 0, width: 100, height: 50, states, points: { '0@-1': { path: [0], before: -1 } } }], () => wrapper, (h) => h), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /onMmchart=\{\(event\) => \(chart0 = \(event as CustomEvent<number>\)\.detail\)\}/);
	assert.match(out, /<div class="recharts-tooltip-wrapper" style="visibility: hidden">@if \(chart0 >= 0\) \{ <><div><span>\{chart0t\[chart0\]\[0\]\}<\/span><\/div><\/> \}<\/div>/);
	assert.match(out, /<g class="layer"><path d="M0"><\/path>@if \(chart0 >= 0\) \{ <><g class="recharts-active-dot"><circle cx=\{chart0a0\[chart0\]\[0\]\} cy=\{chart0a0\[chart0\]\[1\]\}><\/circle><\/g><\/> \}<\/g>/);
	assert.deepEqual(plan.bind(wrapper)?.declare, ['let chart0 = state(-1);', 'const chart0t = [["March"],["April"]];', 'const chart0a0 = [["5","6"],["15","7"]];']);
});
