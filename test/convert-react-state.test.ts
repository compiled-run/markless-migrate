// A component that keeps React state (facts from src/library/react-state.ts) is found on the page and written on
// Markless state (src/convert/react-state.ts): state() per instance, bound attributes and text, @if, @for, and its
// handlers with their setter calls as assignments. Each case compiles.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { body, parseDocument } from '../src/convert/dom.ts';
import { ReactStatePlan } from '../src/convert/react-state.ts';
import { emitElement } from '../src/convert/tsrx.ts';
import { scanLibraries } from '../src/library/index.ts';
import type { StateComponent } from '../src/library/types.ts';

async function facts(files: Record<string, string>): Promise<StateComponent[]> {
	const dir = await mkdtemp(join(tmpdir(), 'mm-state-convert-'));
	try {
		for (const [rel, text] of Object.entries({ 'package.json': JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0' } }), ...files })) {
			await mkdir(join(dir, rel, '..'), { recursive: true });
			await writeFile(join(dir, rel), text);
		}
		return (await scanLibraries(dir)).stateComponents ?? [];
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function convert(list: StateComponent[], html: string) {
	const root = body(parseDocument(`<body><main>${html}</main></body>`));
	const plan = new ReactStatePlan(list);
	const found = plan.add(root);
	const declarations: string[] = [];
	const out = emitElement(root.childNodes[0] as never, { declarations, bind: (el) => plan.bind(el) });
	return { plan, found, out, declarations };
}

async function compiles(declarations: string[], out: string, computed = false): Promise<void> {
	const { compileTsrxModule, collectTsrxModuleDiagnostics } = await import('@markless/compiler');
	const source = `import { ${computed ? 'computed, ' : ''}state } from '@markless/core';\nexport default function Page() @{\n\t${declarations.join('\n\t')}\n\t${out}\n}\n`;
	const result = await compileTsrxModule({ filename: 'pages/t.tsrx', source, symbols: [] });
	assert.deepEqual(collectTsrxModuleDiagnostics(result).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`), [], source);
}

const BUTTON = 'import * as React from "react"\nexport function Button({ className, variant, asChild, ...props }: any) {\n\tconst Comp = asChild ? "span" : "button"\n\treturn <Comp data-slot="button" data-variant={variant} className={className} {...props} />\n}\n';
const PRE = `"use client"
import * as React from "react"
import { Button } from "./ui/button"
export function CodeCollapsiblePre({ className, children, ...props }: React.ComponentProps<"pre">) {
  const id = React.useId()
  const [isOpened, setIsOpened] = React.useState(false)
  return (
    <>
      <pre id={id} data-state={isOpened ? "open" : "closed"} className={className} {...props}>
        {children}
      </pre>
      <Button variant="ghost" aria-expanded={isOpened} aria-controls={id} onClick={() => setIsOpened(!isOpened)}>
        {isOpened ? "Collapse" : "Expand"}
      </Button>
      {!isOpened && (
        <button type="button" tabIndex={-1} aria-hidden onClick={() => setIsOpened(true)}>
          Expand
        </button>
      )}
    </>
  )
}
`;
// As the old shadcn docs page served it (components/code-collapsible-pre.tsx under a rehype figure).
const FIGURE = (id: string) => `<figure data-rehype-pretty-code-figure=""><figcaption>Prompt</figcaption><pre id="${id}" data-state="closed" class="data-[state=closed]:max-h-64" tabindex="0" data-prompt="" data-collapsible=""><button data-slot="copy-button">Copy</button><code>line one</code></pre><button data-slot="button" data-variant="ghost" data-size="sm" class="absolute" aria-expanded="false" aria-controls="${id}">Expand</button><button type="button" tabindex="-1" aria-hidden="true" class="absolute inset-x-0">Expand</button></figure>`;

test('the code block Expand: each instance on its own state, the fade an @if on it, both buttons setting it as the source does', async () => {
	const list = await facts({ 'components/ui/button.tsx': BUTTON, 'components/code-collapsible-pre.tsx': PRE });
	const { found, out, declarations, plan } = convert(list, FIGURE('_R_a_') + '<p>between</p>' + FIGURE('_R_b_'));
	assert.equal(found, 2);
	assert.deepEqual(declarations, ['let isOpened_0 = state(false);', 'let isOpened_1 = state(false);']);
	assert.ok(out.includes('<pre id="_R_a_" class="data-[state=closed]:max-h-64" tabindex="0" data-prompt="" data-collapsible="" data-state={isOpened_0 ? "open" : "closed"}>'), out);
	assert.ok(out.includes('<button data-slot="button" data-variant="ghost" data-size="sm" class="absolute" aria-controls="_R_a_" aria-expanded={(isOpened_0) ? "true" : "false"} onClick={() => (isOpened_0 = !isOpened_0)}>{isOpened_0 ? "Collapse" : "Expand"}</button>'), out);
	// The fade is removed while open, not hidden: an @if around the button the page showed.
	assert.match(out, /@if \(!isOpened_0\) \{ <><button type="button" tabindex="-1" aria-hidden="true" class="absolute inset-x-0" onClick=\{\(\) => \(isOpened_0 = true\)\}>Expand<\/button><\/> \}<\/figure>/);
	assert.match(out, /isOpened_1 = !isOpened_1/);
	assert.equal(plan.counts.get('CodeCollapsiblePre'), 2);
	await compiles(declarations, out);
});

test('a page element that only looks alike is left alone: a closed pre without the Expand row, or an expanded one', async () => {
	const list = await facts({ 'components/ui/button.tsx': BUTTON, 'components/code-collapsible-pre.tsx': PRE });
	assert.equal(convert(list, '<figure><pre data-state="closed"><code>x</code></pre><button data-slot="button" aria-expanded="false">Copy</button></figure>').found, 0);
	assert.equal(convert(list, FIGURE('_R_c_').replace('aria-expanded="false"', 'aria-expanded="true"')).found, 0);
});

test('an arm the page does not show is written from the source, and a derived value is a computed()', async () => {
	const list = await facts({
		'app/page.tsx': `import * as React from "react"
export default function Panel() {
  const [open, setOpen] = React.useState(false)
  const label = open ? "Hide details" : "Show details"
  return (
    <section data-panel="">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open ? <p className="body">Details here</p> : <p className="hint">Nothing shown</p>}
    </section>
  )
}
`,
	});
	const { found, out, declarations, plan } = convert(list, '<section data-panel=""><button type="button" aria-expanded="false">Show details</button><p class="hint">Nothing shown</p></section>');
	assert.equal(found, 1);
	assert.deepEqual(declarations, ['let open_0 = state(false);', 'const label_0 = computed(() => open_0 ? "Hide details" : "Show details");']);
	assert.ok(plan.declaresComputed(declarations[1]!));
	assert.match(out, /@if \(open_0\) \{ <><p class="body">Details here<\/p><\/> \} @else \{ <><p class="hint">Nothing shown<\/p><\/> \}/);
	await compiles(declarations, out, true);
});

test('a list on state is a keyed @for in place of the rows the page showed', async () => {
	const list = await facts({
		'app/page.tsx': `import * as React from "react"
const START = [{ id: "a", name: "Apples" }, { id: "b", name: "Pears" }]
export default function Fruit() {
  const [items, setItems] = React.useState(START)
  return (
    <div data-fruit="">
      <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
      <button type="button" onClick={() => setItems([])}>Clear the list</button>
    </div>
  )
}
`,
	});
	const { found, out, declarations } = convert(list, '<div data-fruit=""><ul><li>Apples</li><li>Pears</li></ul><button type="button">Clear the list</button></div>');
	assert.equal(found, 1);
	assert.ok(out.includes('<ul>@for (const item of items_0; key item.id) { <li>{item.name}</li> }</ul>'), out);
	assert.match(out, /onClick=\{\(\) => \(items_0 = \[\]\)\}/);
	await compiles(declarations, out);
});

test("a state a slider's value takes and its text reads follows the slider: the slider's root runs the callback on each value its port announces", async () => {
	const list = await facts({
		'package.json': JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0', 'radix-ui': '1.0.0' } }),
		'components/ui/slider.tsx': 'import { Slider as P } from "radix-ui"\nexport function Slider(props: any) {\n\treturn <P.Root data-slot="slider" {...props} />\n}\n',
		'app/page.tsx': `import * as React from "react"
import { Slider } from "../components/ui/slider"
export default function Range() {
  const [value, setValue] = React.useState([200, 800])
  return <div data-range=""><span data-low="">{value[0]}</span><Slider value={value} onValueChange={(v) => setValue(v as [number, number])} /></div>
}
`,
	});
	const { found, out, declarations } = convert(list, '<div data-range=""><span data-low="">200</span><span data-slot="slider" dir="ltr" data-orientation="horizontal"><span data-slot="slider-track"><span data-slot="slider-range"></span></span><span><span role="slider" aria-valuenow="200" data-slot="slider-thumb"></span></span><span><span role="slider" aria-valuenow="800" data-slot="slider-thumb"></span></span></span></div>');
	assert.equal(found, 1);
	assert.deepEqual(declarations, ['let value_0 = state([200,800]);']);
	assert.match(out, /<span data-low="">\{value_0\[0\]\}<\/span>/);
	assert.match(out, /<span data-slot="slider" dir="ltr" data-orientation="horizontal" onMmvalue=\{\(mmEvent\) => \(\(v\) => \(value_0 = v\)\)\(\(mmEvent as CustomEvent\)\.detail\)\}>/);
	await compiles(declarations, out);
});

test("a state a part's controlled prop only mirrors is not declared; the component's other state is, renumbered", async () => {
	const list = await facts({
		'package.json': JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0', 'radix-ui': '1.0.0' } }),
		'app/page.tsx': `import * as React from "react"
import { Checkbox } from "radix-ui"
export default function Mixed() {
  const [on, setOn] = React.useState(true)
  const [count, setCount] = React.useState(0)
  return (
    <div data-mixed="">
      <Checkbox.Root checked={on} onCheckedChange={setOn} />
      <button type="button" onClick={() => setCount(count + 1)}>Add one</button>
      <span data-count={count}>{count}</span>
    </div>
  )
}
`,
	});
	const { found, out, declarations } = convert(list, '<div data-mixed=""><button type="button" role="checkbox" aria-checked="true" data-state="checked" value="on"></button><button type="button">Add one</button><span data-count="0">0</span></div>');
	assert.equal(found, 1);
	assert.deepEqual(declarations, ['let count_0 = state(0);']);
	assert.ok(out.includes('<button type="button" role="checkbox" aria-checked="true" data-state="checked" value="on"></button>'), out);
	assert.ok(out.includes('onClick={() => (count_0 = count_0 + 1)}'), out);
	await compiles(declarations, out);
});
