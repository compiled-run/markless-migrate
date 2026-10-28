// The props each rendered instance of a library part was given, read from the old page's React fibers while capturing.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { INSTANCE_PROPS, instancePropMarks, legacyInstanceProps, markInstanceProps, type InstanceSpec } from '../src/convert/instance-props.ts';
import { missingMarks } from '../src/convert/marks.ts';

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(() => browser.close());

// A fiber tree as React 19 links it (tags: 0 function, 3 root, 4 portal, 5 host, 10 context provider, 11 forwardRef),
// described as [tag, props, children] with `#id` naming the host element a host fiber renders.
type Tree = [tag: number, props: Record<string, unknown> | string, children?: Tree[]];
async function fibers(page: Page, html: string, tree: Tree, fns: Record<string, string> = {}): Promise<void> {
	await page.setContent(html);
	await page.evaluate(
		({ tree, fns }: { tree: unknown; fns: Record<string, string> }) => {
			type F = { tag: number; type: unknown; stateNode: unknown; memoizedProps: unknown; return: F | null; child: F | null; sibling: F | null; alternate: null };
			const build = ([tag, props, children = []]: [number, Record<string, unknown> | string, unknown[]?], parent: F | null): F => {
				const host = typeof props === 'string';
				const el = host ? document.getElementById(props.slice(1))! : null;
				const resolved = host ? {} : Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === 'string' && v in fns ? new Function('v', fns[v]!) : v]));
				const f: F = { tag, type: host ? el!.tagName.toLowerCase() : () => null, stateNode: el ?? (tag === 4 ? { containerInfo: document.body } : null), memoizedProps: resolved, return: parent, child: null, sibling: null, alternate: null };
				if (el) Object.assign(el, { __reactFiber$t: f });
				let last: F | null = null;
				for (const c of children as [number, Record<string, unknown> | string, unknown[]?][]) {
					const child = build(c, f);
					if (last) last.sibling = child;
					else f.child = child;
					last = child;
				}
				return f;
			};
			build(tree as never, null);
		},
		{ tree: tree as unknown, fns },
	);
}
const attrs = (page: Page, name: string) => page.evaluate((name) => Object.fromEntries([...document.querySelectorAll('[id]')].map((e) => [e.id, e.getAttribute(name)])), name);

const COMBO = INSTANCE_PROPS.filter((s) => s.port === 'base-ui/combobox');

test('a prop is read from the instance that renders the element, not from another instance beside it', async () => {
	const page = await browser.newPage();
	const input = (id: string) => `<input id="${id}" role="combobox" aria-haspopup="listbox">`;
	await fibers(page, `<div id="page">${input('a')}${input('b')}</div>`, [3, {}, [[5, '#page', [
		[0, { autoHighlight: true, children: [] }, [[11, { placeholder: 'x' }, [[5, '#a']]]]],
		[0, { children: [] }, [[11, { placeholder: 'y' }, [[5, '#b']]]]],
	]]]]);
	await page.evaluate(markInstanceProps, { specs: COMBO, added: false });
	assert.deepEqual(await attrs(page, 'data-mm-auto-highlight'), { page: null, a: 'true', b: null });
	await page.close();
});

// Which of the two the prop was given to cannot be told: neither gets it, so each keeps the library's default.
test('a prop given only further out, where another instance renders too, is not this one\'s', async () => {
	const page = await browser.newPage();
	await fibers(page, `<div id="page"><input id="outer" role="combobox" aria-haspopup="listbox"><div id="pop"><input id="inner" role="combobox" aria-haspopup="listbox"></div></div>`, [3, {}, [[0, { autoHighlight: 'always' }, [[5, '#page', [
		[5, '#outer'],
		[4, {}, [[0, {}, [[5, '#pop', [[5, '#inner']]]]]]],
	]]]]]]);
	await page.evaluate(markInstanceProps, { specs: COMBO, added: false });
	assert.deepEqual(await attrs(page, 'data-mm-auto-highlight'), { page: null, outer: null, pop: null, inner: null });
	await page.close();
});

test("each option gets the value its form submits: an item object's value, a string as it is, or the root's itemToStringValue", async () => {
	const page = await browser.newPage();
	const option = (id: string) => `<div role="option" id="${id}">${id}</div>`;
	await fibers(
		page,
		`<div id="l1" role="listbox" data-base-ui-focusable>${option('ar')}${option('au')}</div><div id="l2" role="listbox" data-base-ui-focusable>${option('next')}</div><div id="l3" role="listbox" data-base-ui-focusable>${option('custom')}</div>`,
		[3, {}, [
			[0, { items: [] }, [[5, '#l1', [
				// A context provider between the item and its element carries a value of its own.
				[11, { value: { code: 'ar', value: 'argentina', label: 'Argentina' } }, [[10, { value: { index: 0 } }, [[5, '#ar']]]]],
				[11, { value: { code: 'au', value: 'australia', label: 'Australia' } }, [[5, '#au']]],
			]]]],
			[0, { items: [] }, [[5, '#l2', [[11, { value: 'Next.js' }, [[5, '#next']]]]]]],
			[0, { itemToStringValue: 'byCode' }, [[5, '#l3', [[11, { value: { code: 'zz', name: 'Custom' } }, [[5, '#custom']]]]]]],
		]],
		{ byCode: 'return v.code.toUpperCase()' },
	);
	await page.evaluate(markInstanceProps, { specs: COMBO, added: false });
	const values = await attrs(page, 'data-mm-value');
	assert.deepEqual([values.ar, values.au, values.next, values.custom], ['argentina', 'australia', 'Next.js', 'ZZ']);
	await page.close();
});

test('with `added`, only what the reveal added is marked', async () => {
	const page = await browser.newPage();
	await fibers(page, `<input id="kept" role="combobox" aria-haspopup="listbox"><div id="new"><input id="shown" role="combobox" aria-haspopup="listbox"></div>`, [3, {}, [
		[0, { autoHighlight: true }, [[5, '#kept']]],
		[0, { autoHighlight: true }, [[5, '#new', [[5, '#shown']]]]],
	]]);
	await page.evaluate(() => ((window as unknown as { __mmAdded: unknown[] }).__mmAdded = [{ node: document.getElementById('new') }]));
	await page.evaluate(markInstanceProps, { specs: COMBO, added: true });
	assert.deepEqual(await attrs(page, 'data-mm-auto-highlight'), { kept: null, new: null, shown: 'true' });
	await page.close();
});

test('a capture is taken again only where an older one holds what a spec reads, and a spec read again takes again only what holds its hints', () => {
	const spec: InstanceSpec = { port: 'x', selector: 'input', props: [{ name: 'p' }], hints: ['aria-haspopup="listbox"'] };
	const other: InstanceSpec = { port: 'y', selector: 'button', props: [{ name: 'q' }], hints: ['data-y'] };
	const missing = (htmls: string[], marked: Record<string, number>, specs: InstanceSpec[]) => missingMarks(htmls, marked, instancePropMarks(specs)).length > 0;
	assert.equal(missing(['<input aria-haspopup="listbox">'], {}, [spec]), true);
	assert.equal(missing(['<p>nothing</p>'], {}, [spec]), false);
	assert.equal(missing(['<input aria-haspopup="listbox">'], legacyInstanceProps(1, [spec]), [spec]), false);
	const read = legacyInstanceProps(1, [spec, other]);
	assert.equal(missing(['<input aria-haspopup="listbox">'], read, [spec, { ...other, version: 2 }]), false, 'a bump to another spec keeps it');
	assert.equal(missing(['<button data-y>'], read, [spec, { ...other, version: 2 }]), true);
});

test("a dialog trigger gets its root's disablePointerDismissal, which Drawer.Root takes and Drawer.Trigger does not render", async () => {
	const page = await browser.newPage();
	const trigger = (id: string) => `<button id="${id}" data-base-ui-click-trigger aria-haspopup="dialog">Open</button>`;
	await fibers(page, `<div id="page">${trigger('kept')}${trigger('plain')}</div>`, [3, {}, [[5, '#page', [
		[0, { modal: false, disablePointerDismissal: true, swipeDirection: 'right' }, [[0, { render: {} }, [[11, {}, [[5, '#kept']]]]], [4, {}]]],
		[0, { modal: false }, [[0, {}, [[5, '#plain']]]]],
	]]]]);
	await page.evaluate(markInstanceProps, { specs: INSTANCE_PROPS.filter((s) => s.port === 'base-ui/dialog'), added: false });
	assert.deepEqual(await attrs(page, 'data-mm-disable-pointer-dismissal'), { page: null, kept: 'true', plain: null });
	await page.close();
});

test("a React Aria popover gets the placement and offsets its own instance was given (a data table's menu at bottom end, 4 px off)", async () => {
	const page = await browser.newPage();
	await fibers(page, `<div id="page"><div id="menu" data-rac="" data-trigger="MenuTrigger" data-placement="bottom"></div><div id="tip" role="tooltip" data-rac="" data-placement="top"></div><div id="plain" data-rac="" data-trigger="DialogTrigger" data-placement="bottom"></div></div>`, [3, {}, [[5, '#page', [
		[0, { placement: 'bottom end', offset: 4, crossOffset: 0, className: 'w-44' }, [[11, {}, [[5, '#menu']]]]],
		[0, { placement: 'top', offset: 6 }, [[5, '#tip']]],
		[0, {}, [[5, '#plain']]],
	]]]]);
	await page.evaluate(markInstanceProps, { specs: INSTANCE_PROPS.filter((s) => s.port === 'react-aria/overlay'), added: false });
	assert.deepEqual(await attrs(page, 'data-mm-placement'), { page: null, menu: 'bottom end', tip: 'top', plain: null });
	assert.deepEqual(await attrs(page, 'data-mm-offset'), { page: null, menu: '4', tip: '6', plain: null });
	assert.deepEqual(await attrs(page, 'data-mm-cross-offset'), { page: null, menu: '0', tip: null, plain: null });
	await page.close();
});
