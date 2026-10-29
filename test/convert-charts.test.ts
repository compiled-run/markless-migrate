import assert from 'node:assert/strict';
import { test } from 'node:test';
import { animationLag, ChartPlan, exactSegments, gridOf, spare, spareCounts, template } from '../src/convert/charts.ts';
import { attr, body, find, parseDocument, textContent, walk } from '../src/convert/dom.ts';
import { emitElement } from '../src/convert/tsrx.ts';

const textOf = (el: Parameters<typeof textContent>[0]) => textContent(el).trim();

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
	assert.equal(plan.add(body(doc), [{ sig: 's', nth: 0, width: 100, height: 50, view: [5, 5, 90, 40], variants: [variant], drivers: [], index: 0, widths: [] }], () => wrapper, (h) => h), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /data-mm-facts=\{"\{\\"w\\":100,/, 'the facts the part reads are on the SVG, a string expression');
	assert.match(out, /\\"m\\":\\"x\\"/, 'how the pointer picks a point');
	assert.match(out, /onMmchart=\{\(event\) => \(chart0 = \(event as CustomEvent<number>\)\.detail\)\}/);
	assert.match(out, /onVisible=\{\(\) => mount\("data-mm-chart"\)\}/, 'wired once visible, for a pointer already over it');
	assert.match(out, /<link rel="stylesheet" href="\/_converted\/styles\/recharts-[0-9a-f]+\.css" \/>/, 'the entry animation\'s shared stylesheet, linked once');
	assert.match(out, /<div class="recharts-tooltip-wrapper" style="visibility: hidden">@if \(chart0 >= 0\) \{ <><div><span>\{chart0t\[chart0\]\[0\]\}<\/span><\/div><\/> \}<\/div>/);
	assert.match(out, /<g class=\{chart0 >= 0 \? \(chart0w0v0c0\[chart0\] \?\? undefined\) : "layer"\}><path d="M0"><\/path>@if \(chart0 >= 0\) \{ <><g class="recharts-active-dot"><circle cx=\{chart0w0v0a0\[chart0\]\[0\]\} cy=\{chart0w0v0a0\[chart0\]\[1\]\}><\/circle><\/g><\/> \}<\/g>/);
	assert.deepEqual(plan.bind(wrapper)?.declare, ['let chart0 = state(-1);', 'const chart0t = [["March"],["April"]];', 'const chart0w0v0a0 = [["5","6"],["15","7"]];', 'const chart0w0v0c0 = ["layer","layer recharts-active-shape"];']);
});

test('a card whose controls change the chart: a state() for the SVG shown, set by a press or by the option chosen', () => {
	const doc = parseDocument('<body><div data-slot="card"><div data-slot="card-header"><button data-active="true">Desktop</button><button data-active="false">Mobile</button></div><div class="recharts-wrapper"><svg class="recharts-surface"><g class="a"></g></svg><div class="recharts-tooltip-wrapper"></div></div></div></body>');
	const root = body(doc);
	const wrapper = find(root, (el) => attr(el, 'class') === 'recharts-wrapper')!;
	const buttons = [find(root, (el) => el.tagName === 'button' && attr(el, 'data-active') === 'true')!, find(root, (el) => el.tagName === 'button' && attr(el, 'data-active') === 'false')!];
	const one = (label: string) => ({ mode: 'x' as const, segments: [[0, 10, 0]] as [number, number, number][], states: [{ tooltip: `<b>${label}</b>`, x: 1, y: null, added: [], changed: [] }], points: {}, elements: 1 });
	const plan = new ChartPlan();
	const facts = { sig: 'w', nth: 0, index: 0, widths: [], width: 100, height: 50, view: [5, 5, 90, 40] as const, variants: [one('d'), { ...one('m'), svg: '<svg class="recharts-surface"><g class="b"></g></svg>' }], drivers: [{ sig: 'b0', nth: 0, kind: 'press' as const, variant: 0, active: true }, { sig: 'b1', nth: 0, kind: 'press' as const, variant: 1, active: true }] };
	plan.add(root, [facts], (sig) => (sig === 'w' ? wrapper : sig === 'b0' ? buttons[0] : sig === 'b1' ? buttons[1] : undefined), (h) => h);
	const out = emitElement(root, { bind: (el) => plan.bind(el) });
	assert.ok(out.includes('<><svg class="recharts-surface" style={chart0v === 0 ? "" : "display: none;"} data-mm-b="0 1 2'), 'each SVG the old page drew, the ones not shown hidden');
	assert.ok(out.includes('<svg class="recharts-surface" style={chart0v === 1 ? "" : "display: none;"} data-mm-b="0 1 2'));
	assert.match(out, /<button data-active=\{chart0v === 1 \? "true" : "false"\} data-mm-variant="1">Mobile<\/button>/);
	assert.match(out, /<div data-slot="card" data-mm-morph="" onClick=\{\(event\) => \{ const k = \(event\.target as Element\)\.closest\('\[data-mm-variant\]'\)/, 'the card fetches the update animation when the pointer or focus comes to it');
});

test('a card whose controls change the chart: each mark carries what recharts animates it with, and the chart how many frames the old page waited', () => {
	const doc = parseDocument('<body><div data-slot="card"><div data-slot="card-header"><button>Desktop</button><button>Mobile</button></div><div class="recharts-wrapper"><svg class="recharts-surface"><g class="recharts-line"><path class="recharts-curve recharts-line-curve" d="M0,1L2,3"></path></g></svg><div class="recharts-tooltip-wrapper"></div></div></div></body>');
	const root = body(doc);
	const wrapper = find(root, (el) => attr(el, 'class') === 'recharts-wrapper')!;
	const buttons = [find(root, (el) => el.tagName === 'button' && textOf(el) === 'Desktop')!, find(root, (el) => el.tagName === 'button' && textOf(el) === 'Mobile')!];
	const geo = '{"k":"line","t":"monotone","l":"horizontal","a":[0,1500,"ease"]}';
	const drawn = (d: string) => `<svg class="recharts-surface"><g class="recharts-line"><path class="recharts-curve recharts-line-curve" d="${d}" data-mm-geo='${geo}'></path></g></svg>`;
	const one = (svg: string) => ({ svg, mode: 'x' as const, segments: [[0, 10, 0]] as [number, number, number][], states: [{ tooltip: '<b>x</b>', x: 1, y: null, added: [], changed: [] }], points: {}, elements: 3 });
	const plan = new ChartPlan();
	const facts = { sig: 'w', nth: 0, index: 0, widths: [], width: 100, height: 50, view: [5, 5, 90, 40] as const, lag: 4, variants: [one(drawn('M0,1L2,3')), one(drawn('M0,3L2,1'))], drivers: [{ sig: 'b0', nth: 0, kind: 'press' as const, variant: 0 }, { sig: 'b1', nth: 0, kind: 'press' as const, variant: 1 }] };
	plan.add(root, [facts], (sig) => (sig === 'w' ? wrapper : sig === 'b0' ? buttons[0] : sig === 'b1' ? buttons[1] : undefined), (h) => h);
	const out = emitElement(root, { bind: (el) => plan.bind(el) });
	assert.equal(out.split(`data-mm-geo={${JSON.stringify(geo)}}`).length - 1, 2, 'the page\'s own drawing takes the capture\'s marks too');
	assert.equal(out.match(/\\"z\\":4/g)?.length, 2, "both drawings know the lag");
});

test('each width the old page drew a chart at is its own SVG, shown by a container query in the widths nearest it', () => {
	const doc = parseDocument('<body><div style="width:0;height:0;overflow:visible"><div class="recharts-wrapper" style="position: relative; width: 1206px; height: 250px;"><svg class="recharts-surface" width="1206"><g class="wide"></g></svg><div class="recharts-tooltip-wrapper"></div></div></div></body>');
	const root = body(doc);
	const wrapper = find(root, (el) => attr(el, 'class') === 'recharts-wrapper')!;
	const variant = (tooltip: string, svg?: string) => ({ ...(svg ? { svg } : {}), mode: 'x' as const, segments: [[0, 10, 0]] as [number, number, number][], states: [{ tooltip, x: 1, y: null, added: [], changed: [] }], points: {}, elements: 1 });
	const plan = new ChartPlan();
	plan.add(root, [{ sig: 'w', nth: 0, index: 0, width: 1206, height: 250, view: [5, 5, 1196, 240], variants: [variant('<b>Jan</b>')], drivers: [], widths: [{ viewport: 419, width: 369, height: 208, view: [5, 5, 359, 198], variants: [variant('<b>Jan</b>', '<svg class="recharts-surface" width="369" viewBox="0 0 369 208"><g class="narrow"></g></svg>')], drivers: [] }] }], () => wrapper, (h) => h);
	const out = emitElement(root, { bind: (el) => plan.bind(el) });
	const narrow = /<svg class="recharts-surface" width="369" viewBox="0 0 369 208" data-mm-b="([\d ]+)"/.exec(out)?.[1];
	const wide = /<svg class="recharts-surface" width="1206" data-mm-b="([\d ]+)"/.exec(out)?.[1];
	assert.equal(narrow, '0 1 2 3 4 5 6 7 8 9 10 11 12 13', 'the narrow SVG up to the width halfway between the two');
	assert.ok(wide?.startsWith('14 15') && wide.endsWith('32 33'), `the wide one above: ${wide}`);
	assert.match(out, /<div style="width:100%;height:100%;container-type:inline-size">/, 'the chart\'s container is the one the queries read');
	assert.match(out, /<div class="recharts-wrapper" style="position: relative; width: 100%; height: 100%;"/);
});

test('the update animation\'s lag is read off a film of the marks from the input: two frames before the first of three that each move them', () => {
	// The input, then: frame 1 shows the new data at its old place (the commit), frames 2-5 hold, 6 on move.
	assert.equal(animationLag(['a', 'b', 'b', 'b', 'b', 'b', 'c', 'd', 'e', 'f']), 4);
	assert.equal(animationLag(['a', 'a', 'a', 'a', 'a', 'a', 'b', 'c', 'd']), 4, 'a switch whose first shape is the old one');
	assert.equal(animationLag(['a', 'a', 'b', 'b', 'a', 'a']), undefined, 'no run of motion: no animation');
});

test('each drawing\'s facts carry its axes\' every possible tick, which the part picks the shown ones from', () => {
	const doc = parseDocument('<body><div class="recharts-wrapper"><svg class="recharts-surface"><g class="recharts-cartesian-axis recharts-xAxis"></g></svg><div class="recharts-tooltip-wrapper"></div></div></body>');
	const root = body(doc);
	const wrapper = find(root, (el) => attr(el, 'class') === 'recharts-wrapper')!;
	const axis = { t: 'xAxis' as const, o: 'bottom' as const, box: [5, 187, 1220, 30] as const, vb: [0, 0, 1230, 250] as const, gap: 32, iv: 'preserveEnd', ts: 6, tm: 8, off: 0, c: [5, 18.555555555555557], l: ['Apr 1', 'Apr 2'] };
	const variant = { svg: '<svg class="recharts-surface"></svg>', mode: 'x' as const, segments: [[0, 10, 0]] as [number, number, number][], states: [{ tooltip: '<b>x</b>', x: 1, y: null, added: [], changed: [] }], points: {}, elements: 1, model: { axes: [null, axis], bars: { gap: 4, cat: '10%', groups: [{}] } } };
	const plan = new ChartPlan();
	plan.add(root, [{ sig: 'w', nth: 0, index: 0, widths: [], width: 1230, height: 250, view: [5, 0, 1220, 187] as const, variants: [variant], drivers: [] }], (sig) => (sig === 'w' ? wrapper : undefined), (h) => h);
	const out = emitElement(root, { bind: (el) => plan.bind(el) });
	const facts = /data-mm-facts=\{("(?:[^"\\]|\\.)*")\}/.exec(out);
	assert.ok(facts, out.slice(0, 300));
	const parsed = JSON.parse(JSON.parse(facts[1]!)) as { a: unknown[]; b: unknown };
	assert.deepEqual(parsed.a, [null, axis], 'the coordinates at full precision, the axis with a custom tick as null');
	assert.deepEqual(parsed.b, { gap: 4, cat: '10%', groups: [{}] });
});

test('each drawing carries hidden copies of its first tick and grid line, up to what the chart\'s busiest drawing shows and three more', () => {
	const svg = (ticks: number, lines: number) => parseDocument(`<body><svg><g class="recharts-cartesian-grid-horizontal">${'<line y1="1"></line>'.repeat(lines)}</g><g class="recharts-cartesian-axis-tick-labels recharts-xAxis-tick-labels">${'<g class="recharts-layer recharts-cartesian-axis-tick-label"><text><tspan>Apr 1</tspan></text></g>'.repeat(ticks)}</g></svg></body>`);
	const tree = (doc: ReturnType<typeof parseDocument>) => find(body(doc), (el) => el.tagName === 'svg')!;
	const narrow = tree(svg(4, 3));
	const counts = spareCounts([narrow, tree(svg(9, 5))]);
	spare(narrow, counts);
	const labels = find(narrow, (el) => (attr(el, 'class') ?? '').includes('recharts-xAxis-tick-labels'))!;
	const kids = [...walk(labels)].filter((el) => (attr(el, 'class') ?? '').split(' ').includes('recharts-cartesian-axis-tick-label'));
	assert.equal(kids.length, 12);
	assert.deepEqual(kids.map((k) => attr(k, 'display') ?? ''), [...Array(4).fill(''), ...Array(8).fill('none')]);
	assert.equal(textContent(kids[11]!), 'Apr 1', 'a copy of the first');
	const grid = find(narrow, (el) => (attr(el, 'class') ?? '').includes('recharts-cartesian-grid-horizontal'))!;
	assert.equal([...walk(grid)].filter((el) => el.tagName === 'line').length, 8);
});

test('a category chart\'s tooltip ranges are recharts\': halfway between tick coordinates as it computes them, the ends at the plot\'s edges', () => {
	const c = [12, 12 + 185.2, 12 + 185.2 * 2, 12 + 185.2 * 3];
	const axis = { t: 'xAxis' as const, o: 'bottom' as const, box: [12, 504, 556, 30] as const, vb: [0, 0, 580, 534] as const, gap: 5, iv: 'preserveEnd', ts: 6, tm: 2, off: 0, c, l: ['a', 'b', 'c', 'd'] };
	// The sweep's boundaries are a quarter pixel off; its states are kept.
	const segments: [number, number, number][] = [[11.75, 104.75, 0], [104.75, 290, 1], [290, 475.75, 2], [475.75, 568.25, 3]];
	const variant = { mode: 'x' as const, segments, states: [], points: {}, elements: 0, model: { axes: [axis], layout: 'horizontal' as const } };
	const exact = exactSegments(variant, [12, 12, 556, 492])!;
	assert.deepEqual(exact.map((s) => s[2]), [0, 1, 2, 3]);
	assert.equal(exact[0]![0], 12);
	assert.equal(exact[2]![1], (c[2]! + c[3]!) / 2, 'the float recharts compares the pointer with, which is not 475');
	assert.notEqual(exact[2]![1], 475);
	assert.equal(exact[3]![1], 568);
	const reversed = exactSegments({ ...variant, segments: segments.map(([a, b, k]) => [a, b, 3 - k] as [number, number, number]), model: { axes: [{ ...axis, c: [...c].reverse() }], layout: 'horizontal' as const } }, [12, 12, 556, 492])!;
	assert.deepEqual(reversed.map((s) => [s[0], s[2]]), [[12, 3], [(c[1]! + c[0]!) / 2, 2], [(c[2]! + c[1]!) / 2, 1], [(c[3]! + c[2]!) / 2, 0]], 'a reversed axis: recharts searches its ticks left to right');
});

test('a horizontal grid\'s possible lines are read off the tallest drawing as fractions up the plot, where no number axis is drawn', () => {
	const svg = parseDocument('<body><svg><g class="recharts-cartesian-grid-horizontal"><line y1="170"></line><line y1="127.5"></line><line y1="85"></line><line y1="42.5"></line><line y1="0"></line></g></svg></body>');
	const tree = find(body(svg), (el) => el.tagName === 'svg')!;
	assert.deepEqual(gridOf(tree, [10, 0, 380, 170], { axes: [] }), [0, 0.25, 0.5, 0.75, 1]);
	assert.equal(gridOf(tree, [10, 0, 380, 170], { axes: [{ t: 'yAxis', o: 'left', box: [0, 0, 0, 0], vb: [0, 0, 0, 0], gap: 5, iv: 'preserveEnd', ts: 6, tm: 2, off: 0, num: true, c: [], l: [] }] }), undefined, 'a drawn number axis has its own ticks');
});
