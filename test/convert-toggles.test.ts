import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attr, body, find, parseDocument, walk, type Element } from '../src/convert/dom.ts';
import { CheckablePlan } from '../src/convert/stateful.ts';
import { emitElement } from '../src/convert/tsrx.ts';

test('a checkbox the old page switched in place is a state() its click flips, with the attributes and indicator of each state', () => {
	const doc = parseDocument('<body><div><span role="checkbox" tabindex="0" aria-checked="false" data-unchecked="" data-slot="checkbox"></span><input type="checkbox" aria-hidden="true"></div></body>');
	const box = find(body(doc), (el) => attr(el, 'role') === 'checkbox')!;
	const plan = new CheckablePlan();
	const placed = plan.add(body(doc), [{ kind: 'toggle', controls: [{ sig: 's', nth: 0, role: 'checkbox', initial: false, off: { attrs: { role: 'checkbox', 'aria-checked': 'false', 'data-unchecked': '' }, inner: '' }, on: { attrs: { role: 'checkbox', 'aria-checked': 'true', 'data-checked': '' }, inner: '<span data-slot="checkbox-indicator"></span>' } }] }], () => box, (html) => html);
	assert.equal(placed, 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /aria-checked=\{tg0 \? "true" : "false"\}/);
	assert.match(out, /data-checked=\{tg0 \? "" : undefined\}/);
	assert.match(out, /onClick=\{\(\) => \{ tg0 = !tg0; \}\}/);
	assert.match(out, /@if \(tg0\) \{ <><span data-slot="checkbox-indicator"><\/span><\/> \} @else \{ <><\/> \}/);
	assert.match(out, /<input type="checkbox" aria-hidden="true" checked=\{tg0\}/, 'the hidden input its label targets follows the state');
	assert.deepEqual(plan.bind(box)?.declare, ['let tg0 = state(false);']);
});

test('radios share one state: choosing one is its index, and a single-choice toggle group clears on a second choice', () => {
	const doc = parseDocument('<body><div role="group"><button role="radio" aria-checked="true">a</button><button role="radio" aria-checked="false">b</button></div></body>');
	const [a, b] = [...walk(body(doc))].filter((el) => attr(el, 'role') === 'radio') as [Element, Element];
	const state = (checked: boolean) => ({ attrs: { role: 'radio', 'aria-checked': String(checked) }, inner: '' });
	const plan = new CheckablePlan();
	plan.add(body(doc), [{ kind: 'radio', clears: true, controls: [{ sig: 'a', nth: 0, role: 'radio', initial: true, on: state(true), off: state(false) }, { sig: 'b', nth: 0, role: 'radio', initial: false, on: state(true), off: state(false) }] }], (sig) => (sig === 'a' ? a : b), (h) => h);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /aria-checked=\{rg0 === 1 \? "true" : "false"\}/);
	assert.match(out, /rg0 = rg0 === 1 \? -1 : 1/);
	assert.match(out, /radioKeys\(event, false\)/, 'a toggle group\'s arrows only move focus');
	assert.deepEqual(plan.bind(a)?.declare, ['let rg0 = state(0);']);
});

test('a form\'s Reset puts each checkbox and radio as its defaults say through mmset, which can leave a radio group with none chosen', () => {
	const doc = parseDocument('<body><div role="group"><button role="radio" aria-checked="true">a</button><button role="radio" aria-checked="false">b</button></div><button role="checkbox" aria-checked="false">c</button></body>');
	const [a, b] = [...walk(body(doc))].filter((el) => attr(el, 'role') === 'radio') as [Element, Element];
	const c = find(body(doc), (el) => attr(el, 'role') === 'checkbox')!;
	const state = (role: string, checked: boolean) => ({ attrs: { role, 'aria-checked': String(checked) }, inner: '' });
	const plan = new CheckablePlan();
	plan.add(
		body(doc),
		[
			{ kind: 'radio', controls: [{ sig: 'a', nth: 0, role: 'radio', initial: true, on: state('radio', true), off: state('radio', false) }, { sig: 'b', nth: 0, role: 'radio', initial: false, on: state('radio', true), off: state('radio', false) }] },
			{ kind: 'toggle', controls: [{ sig: 'c', nth: 0, role: 'checkbox', initial: false, on: state('checkbox', true), off: state('checkbox', false) }] },
		],
		(sig) => ({ a, b, c })[sig],
		(h) => h,
	);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<button role="radio" aria-checked=\{rg0 === 1 \? "true" : "false"\}.*? onMmset=\{\(event\) => \{ if \(\(event as CustomEvent<boolean>\)\.detail\) rg0 = 1; else if \(rg0 === 1\) rg0 = -1; \}\}/);
	assert.match(out, /onMmset=\{\(event\) => \{ tg1 = \(event as CustomEvent<boolean>\)\.detail; \}\}/);
});

test('Base UI tabs render the chosen tab\'s panel content in an arm per tab, with the panel\'s id and label bound', async () => {
	const { BaseTabsPlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="tabs" data-activation-direction="none"><div role="tablist" data-activation-direction="none"><button role="tab" id="base-ui-a" aria-selected="true" tabindex="0" data-active="" aria-controls="p-a">A</button><button role="tab" id="base-ui-b" aria-selected="false" tabindex="-1">B</button></div><div role="tabpanel" id="p-a" aria-labelledby="base-ui-a" data-activation-direction="none"><p>a</p></div></div></body>');
	const b = [...walk(body(doc))].find((el) => attr(el, 'id') === 'base-ui-b')!;
	const plan = new BaseTabsPlan();
	const placed = plan.add(body(doc), (el) => /^base-ui-/.test(attr(el, 'id') ?? ''), (t) => (t === b ? { attrs: { role: 'tabpanel', id: 'p-b', 'aria-labelledby': 'base-ui-b' }, inner: '<p>b</p>' } : undefined), (h) => h);
	assert.equal(placed, 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /@if \(btab0 === 0\) \{ <><p>a<\/p><\/> \}@if \(btab0 === 1\) \{ <><p>b<\/p><\/> \}/);
	assert.match(out, /id=\{btab0 === 0 \? "p-a" : "p-b"\}/);
	assert.match(out, /aria-controls=\{btab0 === 1 \? "p-b" : undefined\}/);
	assert.match(out, /btab0d = 1 > btab0 \? "right"/);
});

test('Base UI tabs whose chosen panel holds a shared component keep every tab\'s content rendered and show the chosen one', async () => {
	const { BaseTabsPlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="tabs"><div role="tablist"><button role="tab" id="base-ui-a" aria-selected="true" tabindex="0" data-active="" aria-controls="p-a">A</button><button role="tab" id="base-ui-b" aria-selected="false" tabindex="-1">B</button></div><div role="tabpanel" id="p-a" aria-labelledby="base-ui-a"><figure>a</figure></div></div></body>');
	const b = [...walk(body(doc))].find((el) => attr(el, 'id') === 'base-ui-b')!;
	const figure = [...walk(body(doc))].find((el) => el.tagName === 'figure')!;
	const plan = new BaseTabsPlan();
	plan.add(body(doc), (el) => /^base-ui-/.test(attr(el, 'id') ?? ''), (t) => (t === b ? { attrs: { role: 'tabpanel', id: 'p-b', 'aria-labelledby': 'base-ui-b' }, inner: '<figure>b</figure>' } : undefined), (h) => h);
	// The page's code block is a component several pages share (factor.ts).
	const out = emitElement(body(doc), { bind: (el) => (el === figure ? { replace: '<CodeBlock path={path} />' } : plan.bind(el)) });
	assert.match(out, /<div hidden=\{btab0 !== 0\}><CodeBlock path=\{path\} \/><\/div><div hidden=\{btab0 !== 1\}><figure>b<\/figure><\/div>/);
	// React Aria's Tabs alike.
	const rac = parseDocument('<body><div><div role="tablist"><div role="tab" data-rac="" id="react-aria-a" aria-selected="true" aria-controls="p-a">A</div><div role="tab" data-rac="" id="react-aria-b" aria-selected="false">B</div></div><div role="tabpanel" id="p-a" aria-labelledby="react-aria-a"><figure>a</figure></div></div></body>');
	const rb = [...walk(body(rac))].find((el) => attr(el, 'id') === 'react-aria-b')!;
	const rfigure = [...walk(body(rac))].find((el) => el.tagName === 'figure')!;
	const racPlan = new BaseTabsPlan();
	racPlan.add(body(rac), (el) => /^react-aria-/.test(attr(el, 'id') ?? ''), (t) => (t === rb ? { attrs: { role: 'tabpanel', id: 'p-b', 'aria-labelledby': 'react-aria-b' }, inner: '<figure>b</figure>' } : undefined), (h) => h);
	assert.match(emitElement(body(rac), { bind: (el) => (el === rfigure ? { replace: '<CodeBlock path={path} />' } : racPlan.bind(el)) }), /<div hidden=\{btab0 !== 0\}><CodeBlock path=\{path\} \/><\/div><div hidden=\{btab0 !== 1\}><figure>b<\/figure><\/div>/);
});

test('a disclosure that mounts its content where it opens renders that content in an arm at the same place', async () => {
	const { InsertedDisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div><button id="base-ui-t" aria-expanded="false">More</button><p>after</p></div></body>');
	const trigger = [...walk(body(doc))].find((el) => attr(el, 'id') === 'base-ui-t')!;
	const parent = trigger.parentNode as Element;
	const after = [...walk(body(doc))].find((el) => el.tagName === 'p')!;
	const plan = new InsertedDisclosurePlan();
	assert.equal(plan.add([{ trigger, parent, before: after, markup: '<div data-slot="collapsible-content">x</div>' }]), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /aria-expanded=\{ins0 \? "true" : "false"\}/);
	assert.match(out, /data-panel-open=\{ins0 \? "" : undefined\}/);
	assert.match(out, /<\/button>@if \(ins0 \|\| ins0x\) \{ <><div data-slot="collapsible-content">x<\/div><\/> \}<p>after<\/p>/, 'the content stays rendered while it closes');
});

test('a Base UI accordion keeps a closing panel rendered until its exit ends, and binds each item and header', async () => {
	const { InsertedDisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="accordion"><div data-slot="accordion-item" data-closed=""><h3 data-closed=""><button id="base-ui-a" aria-expanded="false" data-slot="accordion-trigger">A</button></h3></div><div data-slot="accordion-item" data-closed=""><h3 data-closed=""><button id="base-ui-b" aria-expanded="false" data-slot="accordion-trigger">B</button></h3></div></div></body>');
	const [a, b] = [...walk(body(doc))].filter((el) => el.tagName === 'button') as [Element, Element];
	const item = (t: Element) => (t.parentNode as Element).parentNode as Element;
	const plan = new InsertedDisclosurePlan();
	plan.add([
		{ trigger: a, parent: item(a), before: null, markup: '<div id="pa" data-open="">a</div>', panelId: 'pa' },
		{ trigger: b, parent: item(b), before: null, markup: '<div id="pb" data-open="">b</div>', panelId: 'pb' },
	]);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.deepEqual(plan.bind(a)?.declare, ['let ins0 = state(-1);', 'let ins0x = state(-1);']);
	assert.match(out, /@if \(ins0 === 1 \|\| ins0x === 1\) \{ <><div id="pb" data-open="">b<\/div><\/> \}/);
	assert.match(out, /if \(was >= 0 && was !== ins0\) \{ ins0x = was; panelExit\(\["pa", "pb"\]\[was\] \?\? '', \(\) => \{ if \(ins0x === was\) ins0x = -1; \}\); \} if \(ins0 === 1\) panelEnter\("pb"\);/, 'the item that was open is the one whose exit runs');
	assert.equal(out.match(/<div data-slot="accordion-item" data-open=\{ins0 === \d/g)?.length, 2, 'each Accordion.Item binds data-open');
	assert.equal(out.match(/<h3 data-open=\{ins0 === \d/g)?.length, 2, 'each Accordion.Header binds data-open');
});

test('controls that switch the same attributes share one state, and each use writes the cookies of its state', async () => {
	const { SwitchPlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="sidebar" data-state="expanded" data-collapsible=""></div><button data-slot="sidebar-trigger"></button><button data-slot="sidebar-rail"></button></body>');
	const [sidebar, trigger, rail] = [...walk(body(doc))].filter((el) => el.tagName !== 'body') as [Element, Element, Element];
	const changes = [{ sig: 's', nth: 0, attr: 'data-state', before: 'expanded', after: 'collapsed' }, { sig: 's', nth: 0, attr: 'data-collapsible', before: '', after: 'icon' }];
	const on = [{ name: 'sidebar_state', value: 'false', path: '/', maxAge: 604800 }];
	const off = [{ name: 'sidebar_state', value: 'true', path: '/', maxAge: 604800 }];
	const plan = new SwitchPlan();
	const placed = plan.add([{ sig: 't', nth: 0, changes, cookiesOn: on, cookiesOff: off }, { sig: 'r', nth: 0, changes, cookiesOn: on, cookiesOff: off }], (sig) => ({ s: sidebar, t: trigger, r: rail })[sig as 's' | 't' | 'r']);
	assert.equal(placed, 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /data-state=\{sw0 \? "collapsed" : "expanded"\}/);
	assert.match(out, /data-collapsible=\{sw0 \? "icon" : ""\}/);
	assert.equal(out.match(/sw0 = !sw0; writeCookies\(sw0 \? \[\{"name":"sidebar_state","value":"false"/g)?.length, 2, 'the trigger and the rail switch one state');
});

test('an accordion that lets several items be open gives each item its own state; one that does not shares one', async () => {
	const { DisclosurePlan } = await import('../src/convert/stateful.ts');
	const html = '<body><div data-slot="accordion"><div data-slot="accordion-item"><h3><button data-slot="accordion-trigger" aria-expanded="false" aria-controls="radix-a" data-state="closed">A</button></h3><div id="radix-a" data-slot="accordion-content" data-state="closed" hidden></div></div><div data-slot="accordion-item"><h3><button data-slot="accordion-trigger" aria-expanded="false" aria-controls="radix-b" data-state="closed">B</button></h3><div id="radix-b" data-slot="accordion-content" data-state="closed" hidden></div></div></div></body>';
	for (const several of [false, true]) {
		const doc = parseDocument(html);
		const plan = new DisclosurePlan();
		const groups = plan.add(body(doc), () => true, () => undefined, (el) => several && attr(el, 'data-slot') === 'accordion');
		assert.equal(groups, several ? 2 : 1);
		const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
		assert.match(out, several ? /aria-expanded=\{acc1 === 0 \? "true" : "false"\}/ : /aria-expanded=\{acc0 === 1 \? "true" : "false"\}/);
	}
});

test('a page that shows notifications renders their region between the other shared body children, one component each', async () => {
	const { bodyAfterModule, splitBody } = await import('../src/convert/document.ts');
	const pages = ['/a', '/b'].map((route) => {
		const doc = parseDocument(`<body><main></main><section aria-live="polite" id="_R_${route.slice(1)}_"></section><div data-slot="toast-portal"></div></body>`);
		const [, region, portal] = [...walk(body(doc))].slice(1) as Element[];
		return [route, { route, before: [], after: [region!, portal!], htmlAttrs: {}, bodyAttrs: {}, head: [] }] as const;
	});
	const split = splitBody(new Map(pages));
	const plain = bodyAfterModule(split, () => undefined, () => {})!;
	assert.doesNotMatch(plain, /from \?\? 0/);
	const ranged = bodyAfterModule(split, () => undefined, () => {}, true)!;
	assert.doesNotMatch(ranged, /@if/, 'an arm holding an attribute binding cannot be rebuilt when its condition changes');
	assert.match(ranged, /export function BodyAfter0\(\{ route \}[^@]*@\{\n\tconst values = [^\n]*\n\tvoid values;\n\t<><section aria-live="polite" id=\{values\["b0"\]\}/);
	assert.match(ranged, /export default function BodyAfter\(\{ route \}[^@]*@\{\n\t<><BodyAfter0 route=\{route\} \/><BodyAfter1 route=\{route\} \/><\/>/);
});

test('a Base UI tab list without panels (the line and vertical variants) still switches its triggers', async () => {
	const { BaseTabsPlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="tabs" data-activation-direction="none"><div role="tablist" data-activation-direction="none"><button role="tab" id="base-ui-a" aria-selected="true" tabindex="0" data-active="">A</button><button role="tab" id="base-ui-b" aria-selected="false" tabindex="-1">B</button></div></div></body>');
	const plan = new BaseTabsPlan();
	assert.equal(plan.add(body(doc), (el) => /^base-ui-/.test(attr(el, 'id') ?? ''), () => undefined, (h) => h), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /aria-selected=\{btab0 === 1 \? "true" : "false"\}/);
	assert.doesNotMatch(out, /aria-controls=\{/);
});

test('a Base UI tab list in a header beside other controls switches the panels of its Tabs root (the typeset Docs and Prompt tabs)', async () => {
	const { BaseTabsPlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="tabs" data-activation-direction="none"><div class="header"><div role="tablist" data-activation-direction="none"><button role="tab" id="base-ui-a" aria-selected="true" tabindex="0" data-active="">Docs</button><button role="tab" id="base-ui-b" aria-selected="false" tabindex="-1">Prompt</button></div><button>Next.js</button></div><div><div role="tabpanel" id="base-ui-p" aria-labelledby="base-ui-a" data-index="0"><p>docs</p></div></div></div></body>');
	const plan = new BaseTabsPlan();
	const revealed = (t: Element) => (attr(t, 'id') === 'base-ui-b' ? { attrs: { role: 'tabpanel', id: 'base-ui-q', 'aria-labelledby': 'base-ui-b', 'data-index': '1' }, inner: '<p>prompt</p>' } : undefined);
	assert.equal(plan.add(body(doc), (el) => /^base-ui-/.test(attr(el, 'id') ?? ''), revealed, (h) => h), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /@if \(btab0 === 0\) \{ <><p>docs<\/p><\/> \}@if \(btab0 === 1\) \{ <><p>prompt<\/p><\/> \}/);
	assert.match(out, /<div data-slot="tabs" data-activation-direction=\{btab0d\}>/);
});

test('a Radix collapsible whose trigger renders its child (asChild, data-slot="button") opens its content on state', async () => {
	const { DisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="collapsible" data-state="closed"><button data-slot="button" aria-controls="c1" aria-expanded="false" data-state="closed">Product details</button><div id="c1" data-slot="collapsible-content" data-state="closed" hidden></div></div></body>');
	const plan = new DisclosurePlan();
	assert.equal(plan.add(body(doc), () => false, () => '<p>more</p>'), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<button data-slot="button" aria-controls="c1" aria-expanded=\{acc0 === 0 \? "true" : "false"\}/);
	assert.match(out, /<div id="c1" data-slot="collapsible-content" data-state=\{acc0 === 0 \? "open" : "closed"\} hidden=\{!\(acc0 === 0 \|\| acc0x === 0\)\}>/);
});

test('a Radix collapsible content mounted while closed (forceMount) keeps its children shown and binds only data-state', async () => {
	const { DisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="collapsible" data-state="closed"><button data-slot="collapsible-trigger" aria-controls="c1" aria-expanded="false" data-state="closed">Expand</button><div id="c1" data-slot="collapsible-content" data-state="closed" class="data-[state=closed]:max-h-64"><figure>code</figure></div></div></body>');
	const plan = new DisclosurePlan();
	assert.equal(plan.add(body(doc), () => true, () => undefined), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<div id="c1" data-slot="collapsible-content" class="data-\[state=closed\]:max-h-64" data-state=\{acc0 === 0 \? "open" : "closed"\}><figure>code<\/figure><\/div>/);
	assert.doesNotMatch(out, /hidden=/);
});

test('a body child a load-time modal marked hidden (aria-hidden, Base UI inert) is still the shared one, shown in its at-rest look', async () => {
	const { bodyAfterModule, splitBody } = await import('../src/convert/document.ts');
	const marks: Record<string, string> = { '/a': '', '/b': ' aria-hidden="true" data-aria-hidden="true"', '/c': ' data-base-ui-inert=""' };
	const pages = Object.entries(marks).map(([route, mark]) => {
		const doc = parseDocument(`<body><main></main><section aria-label="Notifications"${mark}><span aria-hidden="true">x</span></section></body>`);
		const [, region] = [...walk(body(doc))].slice(1) as Element[];
		return [route, { route, before: [], after: [region!], htmlAttrs: {}, bodyAttrs: {}, head: [] }] as const;
	});
	const split = splitBody(new Map(pages));
	assert.equal(split.after.length, 1);
	assert.equal(split.extras.size, 0);
	const module = bodyAfterModule(split, () => undefined, () => {})!;
	assert.match(module, /<section aria-label="Notifications"><span aria-hidden="true">x<\/span><\/section>/);
});

test('a Radix Collapsible\'s root, around its trigger and content, binds data-state with them', async () => {
	const { DisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><li data-slot="sidebar-menu-item"><div data-slot="collapsible" data-state="closed"><button data-slot="collapsible-trigger" aria-controls="c1" aria-expanded="false" data-state="closed">More</button><div id="c1" data-slot="collapsible-content" data-state="closed" hidden></div></div></li></body>');
	const plan = new DisclosurePlan();
	assert.equal(plan.add(body(doc), () => true, () => '<p>more</p>'), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<div data-slot="collapsible" data-state=\{acc0 === 0 \? "open" : "closed"\}>/);
	assert.match(out, /<li data-slot="sidebar-menu-item">/, 'an item around it that is no Accordion\'s keeps its markup');
});

test('a Radix Collapsible whose content mounts on opening binds its root\'s data-state with its trigger\'s', async () => {
	const { InsertedDisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-slot="trace-collapsible" data-state="closed"><button data-slot="trace-collapsible-trigger" aria-expanded="false" data-state="closed">Ran</button></div></body>');
	const trigger = find(body(doc), (el) => el.tagName === 'button')!;
	const plan = new InsertedDisclosurePlan();
	plan.add([{ trigger, parent: trigger.parentNode as Element, before: null, markup: '<div data-slot="trace-collapsible-content">out</div>' }]);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<div data-slot="trace-collapsible" data-state=\{ins0 \? "open" : "closed"\}>/);
});

test("a Base UI Collapsible closed on load whose panel stays mounted (keepMounted) opens and closes that panel on Markless state", async () => {
	const { InsertedDisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-closed="" data-slot="trace-collapsible"><button type="button" aria-expanded="false" data-slot="trace-collapsible-trigger">Researched</button><div data-closed="" hidden="" id="base-ui-p" data-slot="trace-collapsible-content"><p>steps</p></div></div></body>');
	const plan = new InsertedDisclosurePlan();
	assert.equal(plan.add([], [body(doc)]), 1);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.deepEqual(plan.bind(find(body(doc), (el) => el.tagName === 'button')!)?.declare, ['let ins0 = state(false);', 'let ins0x = state(false);']);
	assert.match(out, /<div data-slot="trace-collapsible" data-open=\{ins0 \? "" : undefined\} data-closed=\{ins0 \? undefined : ""\}>/);
	assert.match(out, /aria-expanded=\{ins0 \? "true" : "false"\}/);
	assert.match(out, /aria-controls=\{ins0 \? "base-ui-p" : undefined\}/);
	assert.match(out, /<div id="base-ui-p" data-slot="trace-collapsible-content" hidden=\{!\(ins0 \|\| ins0x\)\}[^>]*><p>steps<\/p><\/div>/, 'the mounted panel is shown and hidden, its content kept');
});

test('React Aria ToggleButtonGroup radios leave the arrows to the toolbar part; React Aria radio inputs bind only their checked state', () => {
	const doc = parseDocument('<body><div data-rac="" role="radiogroup" aria-orientation="vertical"><label data-rac="" data-selected="true"><input type="radio" name="g" value="a" tabindex="0" checked=""></label><label data-rac=""><input type="radio" name="g" value="b" tabindex="-1"></label></div><div data-rac="" role="radiogroup"><button data-rac="" role="radio" aria-checked="true">x</button><button data-rac="" role="radio" aria-checked="false">y</button></div></body>');
	const [la, lb] = [...walk(body(doc))].filter((el) => el.tagName === 'label') as [Element, Element];
	const [x, y] = [...walk(body(doc))].filter((el) => el.tagName === 'button') as [Element, Element];
	const radio = (checked: boolean) => ({ attrs: { 'data-selected': checked ? 'true' : undefined } as Record<string, string>, inner: '' });
	const box = (checked: boolean) => ({ attrs: { role: 'radio', 'aria-checked': String(checked) }, inner: '' });
	const plan = new CheckablePlan();
	plan.add(body(doc), [
		{ kind: 'radio', controls: [{ sig: 'la', nth: 0, role: 'radio', initial: true, on: radio(true), off: radio(false) }, { sig: 'lb', nth: 0, role: 'radio', initial: false, on: radio(true), off: radio(false) }] },
		{ kind: 'radio', clears: true, controls: [{ sig: 'x', nth: 0, role: 'radio', initial: true, on: box(true), off: box(false) }, { sig: 'y', nth: 0, role: 'radio', initial: false, on: box(true), off: box(false) }] },
	], (sig) => ({ la, lb, x, y })[sig as 'la' | 'lb' | 'x' | 'y'], (h) => h);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<input type="radio" name="g" value="b" tabindex="-1" checked=\{rg0 === 1\} \/>/, 'the toggle part keeps its tab stop');
	assert.doesNotMatch(out, /radioKeys\(event, /, 'a React Aria ToggleButtonGroup moves focus as a toolbar');
});

test('an element the group\'s state is read by (a caption naming the chosen value) renders the markup each state showed', () => {
	const doc = parseDocument('<body><div role="group"><button role="radio" aria-checked="false">Light</button><button role="radio" aria-checked="true">Normal</button></div><p>Use <code>font-normal</code> here.</p></body>');
	const [a, b] = [...walk(body(doc))].filter((el) => attr(el, 'role') === 'radio') as [Element, Element];
	const code = find(body(doc), (el) => el.tagName === 'code')!;
	const state = (checked: boolean) => ({ attrs: { role: 'radio', 'aria-checked': String(checked) }, inner: '' });
	const plan = new CheckablePlan();
	plan.add(body(doc), [{ kind: 'radio', clears: true, controls: [{ sig: 'a', nth: 0, role: 'radio', initial: false, on: state(true), off: state(false) }, { sig: 'b', nth: 0, role: 'radio', initial: true, on: state(true), off: state(false) }], dependents: [{ sig: 'code', nth: 0, states: { '0': { attrs: {}, inner: 'font-light' }, '1': { attrs: {}, inner: 'font-normal' }, '-1': { attrs: {}, inner: 'font-' } } }] }], (sig) => ({ a, b, code })[sig as 'a' | 'b' | 'code'], (h) => h);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<code>@if \(rg0 === 0\) \{ <>font-light<\/> \}@if \(rg0 === 1\) \{ <>font-normal<\/> \}@if \(rg0 === -1\) \{ <>font-<\/> \}<\/code>/);
});

test('a control that another control\'s state is read by keeps its own group, and is no dependent', () => {
	const doc = parseDocument('<body><button role="checkbox" aria-checked="false">all</button><button role="checkbox" aria-checked="false">one</button></body>');
	const [all, one] = [...walk(body(doc))].filter((el) => el.tagName === 'button') as [Element, Element];
	const state = (checked: boolean) => ({ attrs: { role: 'checkbox', 'aria-checked': String(checked) }, inner: '' });
	const control = (sig: string) => ({ sig, nth: 0, role: 'checkbox', initial: false, on: state(true), off: state(false) });
	const plan = new CheckablePlan();
	const placed = plan.add(body(doc), [{ kind: 'toggle', controls: [control('one')], dependents: [{ sig: 'all', nth: 0, states: { off: state(false), on: { attrs: { role: 'checkbox', 'aria-checked': 'mixed' }, inner: '' } } }] }, { kind: 'toggle', controls: [control('all')] }], (sig) => (sig === 'all' ? all : one), (h) => h);
	assert.equal(placed, 2);
	assert.deepEqual(plan.bind(all)?.declare, ['let tg1 = state(false);']);
});

test('Base UI checkables take Space as their library does (a checkbox on key up, Enter submitting its form), and their hidden input hands focus to the control', () => {
	const doc = parseDocument('<body><span role="checkbox" aria-checked="false" data-unchecked=""></span><input type="checkbox" aria-hidden="true"><span role="switch" aria-checked="false"></span><input type="checkbox" aria-hidden="true"></body>');
	const [box, sw] = [...walk(body(doc))].filter((el) => el.tagName === 'span') as [Element, Element];
	const state = (role: string, checked: boolean) => ({ attrs: { role, 'aria-checked': String(checked) }, inner: '' });
	const control = (sig: string, role: string) => ({ sig, nth: 0, role, initial: false, on: state(role, true), off: state(role, false) });
	const plan = new CheckablePlan();
	plan.add(body(doc), [{ kind: 'toggle', controls: [control('box', 'checkbox')] }, { kind: 'toggle', controls: [control('sw', 'switch')] }], (sig) => (sig === 'box' ? box : sw), (h) => h);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<span role="checkbox"[^\n]*?onKeyDown=\{\(event\) => \{ if \(event\.key === ' '\) event\.preventDefault\(\); else if \(event\.key === 'Enter'\) \{ event\.preventDefault\(\); submitForm\(event\); \} \}\} onKeyUp=\{\(event\) => \{ if \(event\.key === ' '\) \{ tg0 = !tg0; \} \}\}/);
	assert.match(out, /<span role="switch"[^\n]*?else if \(event\.key === 'Enter'\) \{ event\.preventDefault\(\); tg1 = !tg1; \}/, 'a switch takes Enter too');
	assert.equal(out.match(/onFocus=\{\(event\) => focusControl\(event\)\}/g)?.length, 2);
});

test('a sonner toaster renders its lists and toasts from one state, each control adding the toast its use showed, each phase shown in its turn', async () => {
	const { NotifyPlan } = await import('../src/convert/stateful.ts');
	const { emitChildren } = await import('../src/convert/tsrx.ts');
	const { parseFragment } = await import('parse5');
	const doc = parseDocument('<body><main><button data-slot="button">Show</button><button data-slot="button">Promise</button><button data-slot="button">Left</button></main><section aria-label="Notifications alt+T" aria-live="polite"></section></body>');
	const [show, promise, left] = [...walk(body(doc))].filter((el) => el.tagName === 'button') as [Element, Element, Element];
	const region = find(body(doc), (el) => el.tagName === 'section')!;
	const toaster = { position: 'top-center', gap: 14, visibleToasts: 3, expand: false, hotkey: ['altKey', 'KeyT'], ol: [['dir', 'ltr'], ['tabindex', '-1'], ['data-sonner-toaster', 'true'], ['data-y-position', 'top'], ['data-x-position', 'center'], ['style', '--front-toast-height: 50px; --width: 356px; --gap: 14px;']] as [string, string][] };
	const li = (type: string): [string, string][] => [['tabindex', '0'], ['data-sonner-toast', ''], ['data-mounted', 'true'], ['data-type', type], ['data-front', 'true'], ['style', '--index: 0; --toasts-before: 0; --z-index: 1; --offset: 0px; --initial-height: 50px;']];
	const note = (sig: string, sonner: object) => ({ sig, nth: 0, into: { sig: 'r', nth: 0 }, html: '', ms: 4600, sonner: { toaster, dismissible: true, ...sonner } as never });
	const plan = new NotifyPlan();
	plan.add([note('s', { duration: 4000, promise: false, phases: [{ at: 0, attrs: li(''), inner: '<div data-title="">Event</div>' }] }), note('p', { duration: 4000, promise: true, phases: [{ at: 0, type: 'loading', attrs: li('loading'), inner: '<div data-title="">Loading...</div>' }, { at: 2000, type: 'success', attrs: li('success'), inner: '<div data-title="">Done</div>' }] }), note('l', { position: 'top-left', duration: 4000, promise: false, phases: [{ at: 0, attrs: li(''), inner: '<div data-title="">Left</div>' }] })], (sig) => ({ s: show, p: promise, l: left, r: region })[sig as 's' | 'p' | 'l' | 'r'], (html, bind) => emitChildren(parseFragment(html) as unknown as Element, bind ? { bind } : {}));
	assert.ok(plan.sonner);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<section aria-label="Notifications alt\+T" aria-live="polite" data-mm-toaster="tst0">@for \(const list of tst0\.lists; key list\.position\) \{ <ol dir="ltr" tabindex="-1" data-sonner-toaster="true" data-y-position=\{list\.y\} data-x-position=\{list\.x\} style=\{list\.style\} onMouseEnter=\{\(event\) => sonnerList\(\{[^}]*\}, list\.position, event, \(v\) => \(tst0 = v\)\)\}/);
	assert.match(out, /@for \(const item of list\.items; key item\.id\) \{ <li tabindex=\{item\.a\["tabindex"\]\} data-sonner-toast=\{item\.a\["data-sonner-toast"\]\} data-mounted=\{item\.a\["data-mounted"\]\} data-type=\{item\.a\["data-type"\]\} data-front=\{item\.a\["data-front"\]\}[^>]* style=\{item\.a\.style\}>/, 'a toast has no handler of its own');
	assert.match(out, /<div data-title="" style=\{item\.view === "1\.0" \? undefined : "display: none"\}>Loading\.\.\.<\/div><div data-title="" style=\{item\.view === "1\.1" \? undefined : "display: none"\}>Done<\/div>/, 'every phase is in the row, hidden but for its own');
	assert.doesNotMatch(out, /@if \(item\.view/, 'a row holding an arm is rebuilt whenever the rows move');
	assert.match(out, /<button data-slot="button" onClick=\{\(\) => sonnerAdd\(\{"id":"tst0","position":"top-center","gap":14,"visibleToasts":3,"expand":false,"hotkey":\["altKey","KeyT"\],"style":"--width: 356px; --gap: 14px;"\}, \{"view":1,"duration":4000,"dismissible":true,"promise":true,"style":"","phases":\[\{"at":0,"type":"loading","attrs":\{"tabindex":"0","data-sonner-toast":"","data-type":"loading"\}\}/);
	assert.deepEqual(plan.bind(show)?.declare, ['let tst0 = state(SONNER_EMPTY);']);
	assert.ok(plan.hosts(region));
});

test('a Base UI toast viewport renders a root per toast from one state, with the viewport and content state bound and each phase shown in its turn', async () => {
	const { NotifyPlan } = await import('../src/convert/stateful.ts');
	const { emitChildren } = await import('../src/convert/tsrx.ts');
	const { parseFragment } = await import('parse5');
	const doc = parseDocument('<body><main><button data-slot="button">Show</button><button data-slot="button">Create</button></main><div role="region" aria-live="polite" data-slot="toast-viewport" class="fixed"></div></body>');
	const [show, create] = [...walk(body(doc))].filter((el) => el.tagName === 'button') as [Element, Element];
	const region = find(body(doc), (el) => attr(el, 'data-slot') === 'toast-viewport')!;
	const root = (type?: string): [string, string][] => [['role', 'dialog'], ['tabindex', '0'], ['aria-modal', 'false'], ...(type ? [['data-type', type] as [string, string]] : []), ['data-slot', 'toast'], ['class', 'group/toast'], ['style', '--toast-swipe-movement-x: 0px; --toast-index: 0; --toast-offset-y: 0px; --toast-height: 78px;']];
	const content = (text: string) => `<div data-slot="toast-content" class="flex" data-expanded=""><div data-slot="toast-title">${text}</div><button data-slot="toast-close" aria-label="Close toast"></button></div>`;
	const provider = { timeout: 5000, limit: 3 };
	const note = (sig: string, base: object) => ({ sig, nth: 0, into: { sig: 'r', nth: 0 }, html: '', ms: 5600, base: { provider, ...base } as never });
	const plan = new NotifyPlan();
	plan.add([note('s', { priority: 'high', phases: [{ at: 0, attrs: root(), inner: content('Event created') }] }), note('p', { phases: [{ at: 0, type: 'loading', attrs: root('loading'), inner: content('Creating') }, { at: 2000, type: 'success', attrs: root('success'), inner: content('Created') }] })], (sig) => ({ s: show, p: create, r: region })[sig as 's' | 'p' | 'r'], (html, bind) => emitChildren(parseFragment(html) as unknown as Element, bind ? { bind } : {}));
	assert.ok(plan.baseToast);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<div role="region" aria-live="polite" data-slot="toast-viewport" class="fixed" data-mm-base-toaster="btst0" style=\{btst0\.style\} data-expanded=\{btst0\.expanded\} onMouseEnter=\{\(event\) => baseToastViewport\(\{"id":"btst0","timeout":5000,"limit":3\}, event, \(v\) => \(btst0 = v\)\)\}/);
	assert.match(out, /@for \(const item of btst0\.items; key item\.id\) \{ <div role=\{item\.a\["role"\]\} tabindex=\{item\.a\["tabindex"\]\} aria-modal=\{item\.a\["aria-modal"\]\} data-type=\{item\.a\["data-type"\]\} data-slot=\{item\.a\["data-slot"\]\} class=\{item\.a\["class"\]\}[^>]* data-starting-style=\{item\.a\["data-starting-style"\]\}[^>]* style=\{item\.a\.style\}>/);
	assert.match(out, /@if \(item\.view === "1\.0"\) \{ <><div data-slot="toast-content" class="flex" data-expanded=\{item\.c\.expanded\} data-behind=\{item\.c\.behind\}><div data-slot="toast-title">Creating<\/div>/, 'only its own phase is in the root (a hidden one would be announced), its content carrying the toast state');
	assert.match(out, /<button data-slot="button" onClick=\{\(\) => baseToastAdd\(\{"id":"btst0","timeout":5000,"limit":3\}, \{"view":1,"phases":\[\{"at":0,"type":"loading","attrs":\{"role":"dialog","tabindex":"0","aria-modal":"false","data-type":"loading","data-slot":"toast","class":"group\/toast"\}\}/);
	assert.deepEqual(plan.bind(show)?.declare, ['let btst0 = state(BASE_TOAST_EMPTY);']);
	assert.doesNotMatch(out, /@if \(nt\d/, 'not the generic notification arm');
	assert.match(out, /<\/div><div style="clip-path: inset\(50%\);[^"]*">@for \(const a of btst0\.alerts; key a\.id\) \{ <div role="alert" aria-atomic="true">@if \(a\.view === "0\.0"\) \{ <><div>Event created<\/div><div><\/div><\/> \}<\/div> \}<\/div><\/body>/, 'a high-priority toast is announced by a hidden alert after the viewport');
});

test("a toast template's controls all add its toast, each naming what the site's function made of the control clicked", async () => {
	const { NotifyPlan } = await import('../src/convert/stateful.ts');
	const { emitChildren } = await import('../src/convert/tsrx.ts');
	const { parseFragment } = await import('parse5');
	const doc = parseDocument('<body><main><button data-last-copied="false">a</button><button data-last-copied="false">b</button><button>Other</button></main><section aria-label="Notifications alt+T" aria-live="polite"></section></body>');
	const [a, b, other] = [...walk(body(doc))].filter((el) => el.tagName === 'button') as [Element, Element, Element];
	const region = find(body(doc), (el) => el.tagName === 'section')!;
	const toaster = { position: 'bottom-right', gap: 14, visibleToasts: 3, expand: false, hotkey: ['altKey', 'KeyT'], ol: [['data-sonner-toaster', 'true'], ['style', '--width: 356px;']] as [string, string][] };
	const sonner = { toaster, dismissible: true, duration: 4000, promise: false, phases: [{ at: 0, type: 'success', attrs: [['data-sonner-toast', ''], ['data-type', 'success']] as [string, string][], inner: '<div data-content=""><div data-title="">Copied hsl(0 0% 100%) to clipboard.</div></div>' }] };
	const plan = new NotifyPlan();
	const placed = plan.add([{ sig: 'a', nth: 0, into: { sig: 'r', nth: 0 }, html: '', ms: 4600, sonner: sonner as never, template: { name: 'copyColor', copied: 'hsl(0 0% 100%)', controls: [{ sig: 'a', nth: 0 }, { sig: 'b', nth: 0 }] } }], (sig) => ({ a, b, r: region })[sig as 'a' | 'b' | 'r'], (html, bind) => emitChildren(parseFragment(html) as unknown as Element, bind ? { bind } : {}));
	assert.equal(placed, 2);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<div data-title="">Copied \{item\.text\} to clipboard\.<\/div>/, 'the copied value is the toast\'s own text');
	for (const el of [a, b]) assert.match(plan.bind(el)!.extra![0]!, /^onClick=\{\(event\) => sonnerAdd\(\{"id":"tst0".*\{ \.\.\.\{"view":0,.*\}, text: copyColor\(event\.target as Element\) \}, \(v\) => \(tst0 = v\)\)\}$/);
	assert.equal(plan.bind(other), undefined);
});

test('a Base UI disclosure whose content holds disclosures of its own keeps that content in the page, shown while open, its own bound inside', async () => {
	const { InsertedDisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-closed=""><button id="base-ui-a" aria-expanded="false" data-base-ui-collapsible-trigger="">components</button><div data-open="" id="base-ui-pa"><div data-closed=""><button id="base-ui-b" aria-expanded="false" data-base-ui-collapsible-trigger="">ui</button></div></div></div></body>');
	const els = [...walk(body(doc))];
	const outerTrigger = els.find((e) => attr(e, 'id') === 'base-ui-a')!;
	const content = els.find((e) => attr(e, 'id') === 'base-ui-pa')!;
	const innerTrigger = els.find((e) => attr(e, 'id') === 'base-ui-b')!;
	const plan = new InsertedDisclosurePlan();
	const groups = plan.add([
		{ trigger: outerTrigger, parent: outerTrigger.parentNode as Element, before: null, markup: '', nodes: [content], panelId: 'base-ui-pa' },
		{ trigger: innerTrigger, parent: innerTrigger.parentNode as Element, before: null, markup: '<div data-open="">button.tsx</div>', panelId: 'base-ui-pb' },
	]);
	assert.equal(groups, 2);
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<div data-open="" id="base-ui-pa" hidden=\{!\(ins0 \|\| ins0x\)\}>/);
	assert.match(out, /<button id="base-ui-b" [^>]*aria-expanded=\{ins1 \? "true" : "false"\}/);
	assert.match(out, /@if \(ins1 \|\| ins1x\) \{ <><div data-open="">button\.tsx<\/div><\/> \}/);
});

test("a Base UI Select whose trigger renders the chosen value as bare text (button-group's currency) shows the chosen option's value, its icon kept", async () => {
	const { SelectPlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><button type="button" role="combobox" aria-haspopup="listbox" data-slot="select-trigger">$<svg aria-hidden="true"><path d="m6 9 6 6 6-6"></path>▼</svg></button></body>');
	const plan = new SelectPlan();
	assert.equal(plan.add(body(doc), () => true, (html) => html), 1);
	const trigger = find(doc, (el) => attr(el, 'data-slot') === 'select-trigger')!;
	const binding = plan.bind(trigger)!;
	assert.match(binding.declare!.join(' '), /let sel0 = state\("\$"\);/);
	assert.match(binding.children!, /^\{sel0\}<svg/);
	// The select part hands over what the trigger showed after the choice, its icon's text included.
	const handler = binding.extra!.find((e) => e.startsWith('onMmchoose'))!;
	assert.match(handler, /"▼"/);
});

test('a Radix Collapsible with two triggers (a code block\'s Expand and the fade under it) is one state, either trigger toggling it', async () => {
	const { DisclosurePlan } = await import('../src/convert/stateful.ts');
	const doc = parseDocument('<body><div data-state="closed" data-slot="collapsible"><div aria-controls="radix-_r_5_" aria-expanded="false" data-state="closed" data-slot="collapsible-trigger"><button>Expand</button></div><div id="radix-_r_5_" data-state="closed" data-slot="collapsible-content"><pre>code</pre></div><button type="button" aria-controls="radix-_r_5_" aria-expanded="false" data-state="closed" data-slot="collapsible-trigger">Expand</button></div></body>');
	const plan = new DisclosurePlan();
	assert.equal(plan.add(body(doc), () => true, () => undefined), 1, 'one group');
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.equal(out.match(/aria-expanded=\{acc0 === 0 \? "true" : "false"\}/g)?.length, 2, out);
	assert.match(out, /id="radix-_r_5_" [^>]*data-state=\{acc0 === 0 \? "open" : "closed"\}/);
	assert.doesNotMatch(out, /acc1|acc0 === 1/, 'both triggers open the one content');
});

test('content a tab reveals holding a Radix Collapsible of its own is kept in the page, where the Collapsible is bound', async () => {
	const { holdsRadixDisclosure } = await import('../src/convert/stateful.ts');
	const roots = (html: string) => [...walk(body(parseDocument(`<body>${html}</body>`)))].slice(0, 1);
	assert.equal(holdsRadixDisclosure(roots('<div><button aria-expanded="false" aria-controls="c">Expand</button><div id="c" data-state="closed" data-slot="collapsible-content"></div></div>')), true);
	assert.equal(holdsRadixDisclosure(roots('<div><button aria-expanded="false" aria-controls="p">Expand</button><pre id="p" data-state="closed"></pre></div>')), false);
});

test("a form's toast on a passing submit is added by its region's mmformsubmit, and the values it shows are the item's own text", async () => {
	const { NotifyPlan } = await import('../src/convert/stateful.ts');
	const { emitChildren } = await import('../src/convert/tsrx.ts');
	const { parseFragment } = await import('parse5');
	const doc = parseDocument('<body><main><div data-slot="card"><form></form></div></main><section aria-label="Notifications alt+T" aria-live="polite"></section></body>');
	const card = find(body(doc), (el) => attr(el, 'data-slot') === 'card')!;
	const region = find(body(doc), (el) => el.tagName === 'section')!;
	const values = JSON.stringify({ title: '' }, null, 2);
	const toaster = { position: 'bottom-right', gap: 14, visibleToasts: 3, expand: false, hotkey: ['altKey', 'KeyT'], ol: [['data-sonner-toaster', 'true'], ['style', '--width: 356px;']] as [string, string][] };
	const plan = new NotifyPlan();
	plan.add([{ sig: 'card', nth: 0, into: { sig: 'r', nth: 0 }, html: '', ms: 4600, onSubmit: true, texts: { v: values }, sonner: { toaster, dismissible: true, duration: 4000, promise: false, phases: [{ at: 0, attrs: [['data-sonner-toast', '']], inner: `<div data-title="">You submitted the following values:</div><div data-description=""><pre><code>${values}</code></pre></div>` }] } }], (sig) => (sig === 'card' ? card : region), (html, bind) => emitChildren(parseFragment(html) as unknown as Element, bind ? { bind } : {}));
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<div data-slot="card" onMmformsubmit=\{\(event\) => sonnerAdd\(\{"id":"tst0"[^}]*\}, \{"view":0,[^]*?\}, \(v\) => \(tst0 = v\), \{ v: JSON\.stringify\(\(event as CustomEvent\)\.detail, null, 2\) \}\)\}>/);
	assert.match(out, /<pre><code>\{item\.t\["v"\] \?\? ""\}<\/code><\/pre>/);
	assert.doesNotMatch(out, /onClick=\{\(\) => sonnerAdd/);
});
