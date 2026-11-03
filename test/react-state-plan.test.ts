// A component that keeps React state is read from the source (src/library/react-state.ts): its state and derived
// values, what it renders, and the handlers that set it, so convert can write it on Markless state.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { scanLibraries } from '../src/library/index.ts';
import type { StateCode, StateComponent, StateNode } from '../src/library/types.ts';

async function scan(files: Record<string, string>): Promise<StateComponent[]> {
	const dir = await mkdtemp(join(tmpdir(), 'mm-state-'));
	try {
		for (const [rel, text] of Object.entries({ 'package.json': JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0', 'react-hook-form': '7.0.0' } }), ...files })) {
			await mkdir(join(dir, rel, '..'), { recursive: true });
			await writeFile(join(dir, rel), text);
		}
		return (await scanLibraries(dir)).stateComponents ?? [];
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

// Each instance names its state its own way; these tests name slot i `s<i>`.
const code = (c: StateCode | undefined) => (c ?? []).map((x) => (typeof x === 'number' ? `s${x}` : x)).join('');
const only = (list: StateComponent[], name: string) => list.find((c) => c.component === name)!;

const BUTTON = 'import * as React from "react"\nexport function Button({ className, variant, asChild, ...props }: any) {\n\tconst Comp = asChild ? "span" : "button"\n\treturn <Comp data-slot="button" data-variant={variant} className={className} {...props} />\n}\n';

const PRE = `"use client"
import * as React from "react"
import { cn } from "../lib/cn"
import { Button } from "./ui/button"

export function CodeCollapsiblePre({ className, children, ...props }: React.ComponentProps<"pre">) {
  const id = React.useId()
  const [isOpened, setIsOpened] = React.useState(false)

  return (
    <>
      <pre id={id} data-state={isOpened ? "open" : "closed"} className={cn(className, "max-h-64")} {...props}>
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

test('useState becomes a slot with its initial value; attributes and text that read it are bound with their value at load', async () => {
	const list = await scan({ 'components/ui/button.tsx': BUTTON, 'lib/cn.ts': 'export const cn = (...c: any[]) => c.join(" ")\n', 'components/code-collapsible-pre.tsx': PRE, 'app/page.tsx': 'import { CodeCollapsiblePre } from "../components/code-collapsible-pre"\nexport default function Page() {\n\treturn <CodeCollapsiblePre>x</CodeCollapsiblePre>\n}\n' });
	const pre = only(list, 'CodeCollapsiblePre');
	assert.equal(pre.refused, undefined);
	assert.deepEqual(pre.slots, [{ name: 'isOpened', kind: 'state', init: ['false'] }]);
	const [p, button, fade] = pre.nodes!;
	if (p?.kind !== 'element' || button?.kind !== 'element' || fade?.kind !== 'if') throw new Error('shape');
	assert.equal(p.tag, 'pre');
	// The pre shows its children as the page has them; its class reads no state and its id is useId's, kept as captured.
	assert.equal(p.children, undefined);
	assert.deepEqual(Object.keys(p.bound!), ['data-state']);
	assert.equal(p.bound!['data-state']!.initial, 'closed');
	assert.deepEqual(button.slots, ['button']);
	assert.equal(button.bound!['aria-expanded']!.initial, 'false');
	assert.equal(button.text!.initial, 'Expand');
	// The setter call is an assignment to the state.
	assert.equal(code(button.events!.onClick), '() => (s0 = !s0)');
	assert.equal(fade.initial, true);
	assert.equal(code(fade.test), '!s0');
	const arm = fade.then[0]!;
	if (arm.kind !== 'element') throw new Error('arm');
	assert.deepEqual(arm.attrs, { type: 'button', tabindex: '-1', 'aria-hidden': 'true' });
	assert.deepEqual(arm.children, [{ kind: 'text', value: 'Expand' }]);
	assert.equal(code(arm.events!.onClick), '() => (s0 = true)');
	assert.equal(fade.markup, undefined);
});

test('an updater, a reducer dispatch and a component function that sets state become assignments inside the handler', async () => {
	const list = await scan({
		'app/page.tsx': `import * as React from "react"
const STEP = 2
function reducer(state: number, action: { type: "add" }) {
  return action.type === "add" ? state + STEP : state
}
export default function Counter() {
  const [count, setCount] = React.useState<number>(0)
  const [total, dispatch] = React.useReducer(reducer, 10)
  function reset(event: React.MouseEvent) {
    setCount(0)
  }
  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>Add one</button>
      <button onClick={() => dispatch({ type: "add" })}>Add two</button>
      <button onClick={reset}>Reset</button>
      <output>{count} of {total}</output>
    </div>
  )
}
`,
	});
	const c = only(list, 'Counter');
	assert.equal(c.refused, undefined);
	assert.deepEqual(c.slots, [{ name: 'count', kind: 'state', init: ['0'] }, { name: 'total', kind: 'state', init: ['10'] }]);
	const div = c.nodes![0]!;
	if (div.kind !== 'element') throw new Error('div');
	const [add, two, reset, out] = div.children as Extract<StateNode, { kind: 'element' }>[];
	assert.equal(code(add!.events!.onClick), '() => (s0 = ((c) => c + 1)(s0))');
	assert.match(code(two!.events!.onClick), /return \(\(\) => \(s1 = reducer\(s1, \{ type: "add" \}\)\)\)\(mmEvent\);/);
	// The handler names a component function: it is declared inside the handler, its types gone, with its setter call an assignment.
	const r = code(reset!.events!.onClick);
	assert.match(r, /function reset\(event\) \{\n\s*\(s0 = 0\)\n\s*\}/);
	assert.match(r, /return \(reset\)\(mmEvent\);/);
	// The reducer travels with its handler, with the module constant it reads.
	assert.match(code(two!.events!.onClick), /const STEP = 2;\nfunction reducer\(state, action\) \{/);
	assert.equal(out!.text!.initial, '0 of 10');
});

test('a derived const and a useMemo become computed slots; a conditional between elements writes the arm the page lacks from the source', async () => {
	const list = await scan({
		'app/page.tsx': `import * as React from "react"
export default function Panel() {
  const [open, setOpen] = React.useState(false)
  const label = open ? "Hide" : "Show"
  const count = React.useMemo(() => (open ? 3 : 0), [open])
  return (
    <section>
      <button aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open ? <p className="body" data-count={count}>Details here</p> : <p className="hint">Nothing shown</p>}
    </section>
  )
}
`,
	});
	const c = only(list, 'Panel');
	assert.equal(c.refused, undefined);
	assert.deepEqual(c.slots!.map((s) => [s.name, s.kind, code(s.init)]), [['open', 'state', 'false'], ['label', 'computed', 'open ? "Hide" : "Show"'.replace('open', 's0')], ['count', 'computed', 's0 ? 3 : 0']]);
	const section = c.nodes![0]!;
	if (section.kind !== 'element') throw new Error('section');
	const branch = section.children![1]!;
	if (branch.kind !== 'if') throw new Error('if');
	assert.equal(branch.initial, false);
	assert.equal(branch.else.length, 1);
	assert.equal(code(branch.markup), '<p class="body" data-count={s2}>Details here</p>');
});

test('a .map over state becomes a keyed @for whose row is written from the source', async () => {
	const list = await scan({
		'app/page.tsx': `import * as React from "react"
const START = [{ id: "a", name: "Apples" }, { id: "b", name: "Pears" }]
export default function Fruit() {
  const [items, setItems] = React.useState(START)
  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.id} data-id={item.id}>{item.name}</li>
        ))}
      </ul>
      <button onClick={() => setItems([])}>Clear the list</button>
    </div>
  )
}
`,
	});
	const c = only(list, 'Fruit');
	assert.equal(c.refused, undefined);
	assert.deepEqual(c.slots![0]!.init, ['[{"id":"a","name":"Apples"},{"id":"b","name":"Pears"}]']);
	const div = c.nodes![0]!;
	if (div.kind !== 'element') throw new Error('div');
	const ul = div.children![0]!;
	if (ul.kind !== 'element') throw new Error('ul');
	const row = ul.children![0]!;
	if (row.kind !== 'for') throw new Error('for');
	assert.deepEqual([code(row.list), row.item, code(row.key), row.initial, row.tag], ['s0', 'item', 'item.id', 2, 'li']);
	assert.equal(code(row.markup), '<li data-id={item.id}>{item.name}</li>');
});

test('effects, refs, library hooks and markup reading props are refused with why', async () => {
	const list = await scan({
		'app/page.tsx': `import * as React from "react"
import { useForm } from "react-hook-form"
export function Effect() {
  const [n, setN] = React.useState(0)
  React.useEffect(() => { document.title = String(n) }, [n])
  return <button onClick={() => setN(n + 1)}>{n}</button>
}
export function Ref() {
  const [n, setN] = React.useState(0)
  const ref = React.useRef(null)
  return <button onClick={() => setN(n + 1)}>{n}</button>
}
export function Form() {
  const [n, setN] = React.useState(0)
  const form = useForm()
  return <button onClick={() => setN(n + 1)}>{n}</button>
}
export function Props({ label }: { label: string }) {
  const [on, setOn] = React.useState(false)
  return <button aria-label={on ? label : "off"} onClick={() => setOn(!on)}>Toggle it</button>
}
export default function Page() {
  return <Effect />
}
`,
	});
	assert.deepEqual(list.map((c) => [c.component, c.refused]), [
		['Effect', 'runs useEffect (line 5), which has no Markless counterpart'],
		['Ref', 'keeps a useRef, which convert does not port yet'],
		['Form', 'calls useForm from react-hook-form, a library hook convert does not port yet'],
		['Props', "its state's markup reads the prop label"],
	]);
	assert.deepEqual(only(list, 'Effect').effects, [{ line: 5, reason: 'useEffect runs after React renders; Markless has no effects, and this one is not a handler or an attach behaviour' }]);
});

test('carried handler code runs as the source did: the counter reducer and updater move the state they name', async () => {
	const list = await scan({
		'app/page.tsx': `import * as React from "react"
function reducer(state: number, action: { by: number }) { return state + action.by }
export default function Counter() {
  const [count, setCount] = React.useState(1)
  const [total, dispatch] = React.useReducer(reducer, 10)
  return <div><button onClick={() => { setCount((c) => c * 3); dispatch({ by: 5 }) }}>Go now</button><span>{count}</span></div>
}
`,
	});
	const div = only(list, 'Counter').nodes![0]!;
	if (div.kind !== 'element') throw new Error('div');
	const button = div.children![0]!;
	if (button.kind !== 'element') throw new Error('button');
	const handler = code(button.events!.onClick);
	const run = new Function(`let s0 = 1, s1 = 10; function reducer(state, action) { return state + action.by }\n(${handler})(); return [s0, s1];`);
	assert.deepEqual(run(), [3, 15]);
});

test("a handler's parameter named as the state is the parameter inside its function, not the state", async () => {
	const list = await scan({
		'app/page.tsx': `import * as React from "react"
export default function Field() {
  const [value, setValue] = React.useState("a")
  return <div data-field=""><input data-value={value} onChange={(value) => setValue(value.target.value)} /><span>{value}</span></div>
}
`,
	});
	const div = only(list, 'Field').nodes![0]!;
	if (div.kind !== 'element') throw new Error(only(list, 'Field').refused);
	const input = div.children![0]!;
	if (input.kind !== 'element') throw new Error('input');
	assert.equal(code(input.events!.onInput), '(value) => (s0 = value.target.value)');
});

test("a setter given to a callback no DOM event fires (onStatusChange), or to a part's own onChange, is refused; so is a key that reads state", async () => {
	const list = await scan({
		'components/ui/item.tsx': 'export function Item({ ...props }: any) {\n\treturn <div data-slot="item" {...props} />\n}\n',
		'app/page.tsx': `import * as React from "react"
import { Item } from "../components/ui/item"
export default function Skip() {
  const [status, setStatus] = React.useState("unanswered")
  return <Item onStatusChange={setStatus}><p>{status}</p></Item>
}
`,
	});
	assert.equal(only(list, 'Skip').refused, "sets its state from <Item>'s onStatusChange, a callback no DOM event fires");
	const more = await scan({
		'package.json': JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0', 'react-aria-components': '1.0.0' } }),
		'components/ui/slider.tsx': 'import { Slider as S } from "react-aria-components"\nexport function Slider(props: any) {\n\treturn <S data-slot="slider" {...props} />\n}\n',
		'app/page.tsx': `import * as React from "react"
import { Slider } from "../components/ui/slider"
export function Range() {
  const [v, setV] = React.useState([1])
  return <div data-range=""><Slider onChange={(x: number[]) => setV(x)} /><span>{v.join(", ")}</span></div>
}
export default function Replay() {
  const [key, setKey] = React.useState(0)
  return <div><p key={key}>Generating a response</p><button onClick={() => setKey((k) => k + 1)}>Replay</button></div>
}
`,
	});
	assert.equal(only(more, 'Range').refused, "sets its state from <Slider>'s onChange, which <Slider> answers itself, not as the DOM event");
	assert.equal(only(more, 'Replay').refused, 'remounts <p> when its state changes its key, which convert does not port yet');
});

test("state passed to a library part's own prop (a radio group's value) is refused; aria- and data- props reach its element", async () => {
	const list = await scan({
		'package.json': JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0', 'radix-ui': '1.0.0' } }),
		'app/page.tsx': `import * as React from "react"
import { RadioGroup } from "radix-ui"
export function Group() {
  const [v, setV] = React.useState("a")
  return <RadioGroup.Root value={v} onClick={() => setV("b")}><p>Pick one of them</p></RadioGroup.Root>
}
function Picker(props: any) {
  return <RadioGroup.Root data-slot="radio-group" {...props} />
}
export default function Labelled() {
  const [v, setV] = React.useState("a")
  return <Picker data-picked={v} onClick={() => setV("b")}><p>Pick one of them</p></Picker>
}
`,
	});
	assert.equal(only(list, 'Group').refused, "passes its state to <RadioGroup.Root>'s value, a prop convert does not port yet");
	assert.equal(only(list, 'Labelled').refused, undefined);
});

const RADIX = JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0', 'radix-ui': '1.0.0' } });
const COLLAPSIBLE = 'import { Collapsible as P } from "radix-ui"\nexport function Collapsible(props: any) {\n\treturn <P.Root data-slot="collapsible" {...props} />\n}\nexport function CollapsibleTrigger(props: any) {\n\treturn <P.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />\n}\n';

test("a state a part's controlled prop only mirrors (its value and its change callback alone) is the part's own: dropped, the rest renumbered", async () => {
	const list = await scan({
		'package.json': RADIX,
		'components/ui/collapsible.tsx': COLLAPSIBLE,
		'app/page.tsx': `import * as React from "react"
import { Checkbox } from "radix-ui"
import { Collapsible, CollapsibleTrigger } from "../components/ui/collapsible"
export function Demo() {
  const [isOpen, setIsOpen] = React.useState(false)
  return <Collapsible open={isOpen} onOpenChange={setIsOpen}><CollapsibleTrigger>Toggle</CollapsibleTrigger><p>Order details</p></Collapsible>
}
export default function Mixed() {
  const [on, setOn] = React.useState(true)
  const [count, setCount] = React.useState(0)
  return (
    <div data-mixed="">
      <Checkbox.Root checked={on ?? false} onCheckedChange={(v) => setOn(v)} />
      <button type="button" onClick={() => setCount(count + 1)}>Add one</button>
      <span data-count={count}>{count}</span>
    </div>
  )
}
`,
	});
	const demo = only(list, 'Demo');
	assert.equal(demo.refused, undefined);
	assert.deepEqual(demo.slots, []);
	assert.deepEqual(demo.partState, [{ state: 'isOpen', part: 'radix-ui Collapsible.Root', prop: 'open' }]);
	const mixed = only(list, 'Mixed');
	assert.equal(mixed.refused, undefined);
	assert.deepEqual(mixed.slots, [{ name: 'count', kind: 'state', init: ['0'] }]);
	assert.deepEqual(mixed.partState, [{ state: 'on', part: 'radix-ui Checkbox.Root', prop: 'checked' }]);
	const [div] = mixed.nodes!;
	if (div?.kind !== 'element') throw new Error('shape');
	const [, button, span] = div.children!;
	if (button?.kind !== 'element' || span?.kind !== 'element') throw new Error('shape');
	assert.equal(code(button.events!.onClick), '() => (s0 = s0 + 1)');
	assert.equal(code(span.text!.code), 's0');
});

test("a part's controlled state the app also reads or writes elsewhere, or that two parts share, is not the part's own and is refused with why", async () => {
	const list = await scan({
		'package.json': RADIX,
		'components/ui/collapsible.tsx': COLLAPSIBLE,
		'app/page.tsx': `import * as React from "react"
import { Collapsible, CollapsibleTrigger } from "../components/ui/collapsible"
export function Reads() {
  const [open, setOpen] = React.useState(false)
  return <Collapsible open={open} onOpenChange={setOpen}><CollapsibleTrigger>Toggle</CollapsibleTrigger><p>{open ? "Shown" : "Hidden"}</p></Collapsible>
}
export function Writes() {
  const [open, setOpen] = React.useState(false)
  return <div data-writes=""><button type="button" onClick={() => setOpen(true)}>Open it</button><Collapsible open={open} onOpenChange={setOpen}><p>Body text</p></Collapsible></div>
}
export function Shared() {
  const [open, setOpen] = React.useState(false)
  return <div data-shared=""><Collapsible open={open} onOpenChange={setOpen}><p>One</p></Collapsible><Collapsible open={open} onOpenChange={setOpen}><p>Two</p></Collapsible></div>
}
export default function Handled() {
  const [open, setOpen] = React.useState(false)
  return <Collapsible open={open} onOpenChange={(o) => { setOpen(o); console.log(o) }}><p>Body text</p></Collapsible>
}
`,
	});
	assert.equal(only(list, 'Reads').refused, "passes its state open to <Collapsible>'s open and reads it elsewhere, which needs <Collapsible> to announce its changes");
	assert.equal(only(list, 'Writes').refused, "passes its state open to <Collapsible>'s open and sets it elsewhere, which needs <Collapsible> to follow it");
	assert.equal(only(list, 'Shared').refused, "passes its state open to the open of more than one part");
	assert.equal(only(list, 'Handled').refused, "passes its state to <Collapsible>'s open, a prop convert does not port yet");
});

test("a controlled prop is the part's only where each wrapper passes it on as given: in its spread props, or by its own name without a default", async () => {
	const list = await scan({
		'package.json': RADIX,
		'components/ui/parts.tsx': `import { Checkbox as C, Collapsible as P } from "radix-ui"
export function Named({ checked, className, ...props }: any) {
  return <C.Root data-slot="named" className={className} checked={checked} {...props} />
}
export function Defaulted({ open = true, ...props }: any) {
  return <P.Root data-slot="defaulted" open={open} {...props} />
}
export function Overridden(props: any) {
  return <P.Root data-slot="overridden" {...props} open={false} />
}
`,
		'app/page.tsx': `import * as React from "react"
import { Named, Defaulted, Overridden } from "../components/ui/parts"
export function UsesNamed() {
  const [on, setOn] = React.useState(false)
  return <Named checked={on} onCheckedChange={(v: boolean) => setOn(v as boolean)} />
}
export function UsesDefaulted() {
  const [open, setOpen] = React.useState(false)
  return <Defaulted open={open} onOpenChange={setOpen}><p>Body text</p></Defaulted>
}
export default function UsesOverridden() {
  const [open, setOpen] = React.useState(false)
  return <Overridden open={open} onOpenChange={setOpen}><p>Body text</p></Overridden>
}
`,
	});
	assert.equal(only(list, 'UsesNamed').refused, undefined);
	assert.deepEqual(only(list, 'UsesNamed').partState, [{ state: 'on', part: 'radix-ui Checkbox.Root', prop: 'checked' }]);
	assert.equal(only(list, 'UsesDefaulted').refused, "passes its state to <Defaulted>'s open, a prop convert does not port yet");
	assert.equal(only(list, 'UsesOverridden').refused, "passes its state to <Overridden>'s open, a prop convert does not port yet");
});

test("a part's controlled state the app reads elsewhere follows the part where its port announces the prop's changes: the callback runs on the announced value", async () => {
	const list = await scan({
		'package.json': JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0', 'radix-ui': '1.0.0', 'react-aria-components': '1.0.0' } }),
		'components/ui/slider.tsx': 'import { Slider as P } from "radix-ui"\nexport function Slider(props: any) {\n\treturn <P.Root data-slot="slider" {...props} />\n}\n',
		'components/ui/aria-slider.tsx': 'import { Slider as S } from "react-aria-components"\nexport function AriaSlider(props: any) {\n\treturn <S data-slot="slider" {...props} />\n}\n',
		'components/ui/select.tsx': 'import { Select as P } from "radix-ui"\nexport function Select(props: any) {\n\treturn <P.Root {...props} />\n}\n',
		'app/page.tsx': `import * as React from "react"
import { Slider } from "../components/ui/slider"
import { AriaSlider } from "../components/ui/aria-slider"
import { Select } from "../components/ui/select"
export function Range() {
  const [value, setValue] = React.useState([200, 800])
  return <div data-range=""><span data-low="">{value[0]}</span><Slider value={value} onValueChange={(v) => setValue(v as [number, number])} /></div>
}
export function One() {
  const [v, setV] = React.useState(50)
  return <div data-one=""><span data-at="">{v}</span><AriaSlider value={v} onChange={setV} /></div>
}
export default function Currency() {
  const [currency, setCurrency] = React.useState("$")
  return <div data-currency=""><span data-sign="">{currency}</span><Select value={currency} onValueChange={setCurrency} /></div>
}
`,
	});
	const range = only(list, 'Range');
	assert.equal(range.refused, undefined);
	assert.deepEqual(range.slots, [{ name: 'value', kind: 'state', init: ['[200,800]'] }]);
	assert.equal(range.partState, undefined);
	const [div] = range.nodes!;
	if (div?.kind !== 'element') throw new Error('shape');
	const [low, slider] = div.children!;
	if (low?.kind !== 'element' || slider?.kind !== 'element') throw new Error('shape');
	assert.equal(code(low.text!.code), 's0[0]');
	assert.deepEqual(slider.slots, ['slider']);
	assert.equal(code(slider.events!.onMmvalue), '(mmEvent) => ((v) => (s0 = v))((mmEvent as CustomEvent).detail)');
	const one = only(list, 'One');
	assert.equal(one.refused, undefined);
	const [oneDiv] = one.nodes!;
	if (oneDiv?.kind !== 'element') throw new Error('shape');
	const aria = oneDiv.children![1]!;
	if (aria.kind !== 'element') throw new Error('shape');
	// React Aria calls onChange with one number where the slider was given one: the first of the announced values.
	assert.equal(code(aria.events!.onMmvalue), '(mmEvent) => (((v) => (s0 = typeof v === "function" ? v(s0) : v)))((mmEvent as CustomEvent).detail[0])');
	assert.equal(only(list, 'Currency').refused, "passes its state currency to <Select>'s value and reads it elsewhere, which needs <Select> to announce its changes");
});

test("a tsconfig path without a star names that import alone: react's types path leaves react-aria-components a package, so its parts' controlled props are read", async () => {
	const list = await scan({
		'package.json': JSON.stringify({ name: 'state', dependencies: { next: '16.0.0', react: '19.0.0', 'react-aria-components': '1.0.0' } }),
		'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { react: ['node_modules/@types/react'], '@/*': ['./*'] } } }),
		'components/ui/slider.tsx': 'import { Slider as S } from "react-aria-components"\nexport function Slider(props: any) {\n\treturn <S data-slot="slider" {...props} />\n}\n',
		'app/page.tsx': `import * as React from "react"
import { Slider } from "@/components/ui/slider"
export default function Volume() {
  const [v, setV] = React.useState(50)
  return <Slider value={v} onChange={setV} />
}
`,
	});
	assert.deepEqual(only(list, 'Volume').partState, [{ state: 'v', part: 'react-aria-components Slider', prop: 'value' }]);
});

test("a state a part's config prop reads (dir, loop) with no callback binds the attribute its port reads: on the Root's trigger where the Root renders no element, on the bar where it does", async () => {
	const list = await scan({
		'package.json': RADIX,
		'app/page.tsx': `import * as React from "react"
import { DropdownMenu, Menubar } from "radix-ui"
export function Submenus() {
  const [rtl, setRtl] = React.useState(false)
  return (
    <div data-submenus="">
      <label><input type="checkbox" checked={rtl} onChange={(event) => setRtl(event.currentTarget.checked)} />Right-to-left</label>
      <DropdownMenu.Root dir={rtl ? "rtl" : "ltr"}>
        <DropdownMenu.Trigger data-slot="dropdown-menu-trigger">Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal data-slot="dropdown-menu-portal"><DropdownMenu.Content data-slot="dropdown-menu-content"><DropdownMenu.Item>New Tab</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
export default function Bar() {
  const [loop, setLoop] = React.useState(false)
  const [rtl, setRtl] = React.useState(false)
  const [portalled, setPortalled] = React.useState(false)
  const dir = rtl ? "rtl" : "ltr"
  const Portal = portalled ? Menubar.Portal : React.Fragment
  return (
    <div data-bar="">
      <label><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.currentTarget.checked)} />Loop</label>
      <label><input type="checkbox" checked={rtl} onChange={(event) => setRtl(event.currentTarget.checked)} />Right-to-left</label>
      <label><input type="checkbox" checked={portalled} onChange={(event) => setPortalled(event.currentTarget.checked)} />Portalled</label>
      <div dir={dir}>
        <Menubar.Root data-slot="menubar" loop={loop} dir={dir}>
          <Menubar.Menu data-slot="menubar-menu">
            <Menubar.Trigger data-slot="menubar-trigger">File</Menubar.Trigger>
            <Portal><Menubar.Content data-slot="menubar-content"><Menubar.Item>New Tab</Menubar.Item></Menubar.Content></Portal>
          </Menubar.Menu>
        </Menubar.Root>
      </div>
    </div>
  )
}
`,
	});
	const submenus = only(list, 'Submenus');
	assert.equal(submenus.refused, undefined);
	const [div] = submenus.nodes!;
	if (div?.kind !== 'element') throw new Error('shape');
	// The Root renders no element: its trigger is the menu's place on the page, its portal's content is a layer.
	const [, trigger, portal] = div.children!;
	if (trigger?.kind !== 'element') throw new Error('shape');
	assert.deepEqual(trigger.slots, ['dropdown-menu-trigger']);
	assert.deepEqual(trigger.bound, { 'data-mm-dir': { code: [0, ' ? "rtl" : "ltr"'], initial: 'ltr', added: true } });
	assert.deepEqual(portal, { kind: 'opaque' });
	const bar = only(list, 'Bar');
	assert.equal(bar.refused, undefined);
	assert.deepEqual(bar.slots!.map((s) => s.name), ['loop', 'rtl', 'portalled', 'dir']);
	const [barDiv] = bar.nodes!;
	if (barDiv?.kind !== 'element') throw new Error('shape');
	const wrap = barDiv.children![3]!;
	if (wrap.kind !== 'element') throw new Error('shape');
	assert.equal(code(wrap.bound!.dir!.code), 's3');
	const root = wrap.children![0]!;
	if (root.kind !== 'element') throw new Error('shape');
	assert.deepEqual(root.slots, ['menubar']);
	assert.deepEqual(root.bound, { 'data-mm-loop': { code: ['(', 0, ') ? "true" : "false"'], initial: 'false', added: true }, dir: { code: [3], initial: 'ltr' } });
});

test("a config prop no port reads, a Root whose trigger is not its child, and a state-chosen tag other than a portal stay refused with why", async () => {
	const list = await scan({
		'package.json': RADIX,
		'app/page.tsx': `import * as React from "react"
import { Dialog, DropdownMenu, Menubar } from "radix-ui"
export function Modal() {
  const [modal, setModal] = React.useState(true)
  return <div data-modal=""><input type="checkbox" checked={modal} onChange={(e) => setModal(e.currentTarget.checked)} /><Dialog.Root modal={modal}><Dialog.Trigger data-slot="dialog-trigger">open</Dialog.Trigger></Dialog.Root></div>
}
export function Nested() {
  const [rtl, setRtl] = React.useState(false)
  return <div data-nested=""><input type="checkbox" checked={rtl} onChange={(e) => setRtl(e.currentTarget.checked)} /><DropdownMenu.Root dir={rtl ? "rtl" : "ltr"}><div><DropdownMenu.Trigger data-slot="dropdown-menu-trigger">Open</DropdownMenu.Trigger></div></DropdownMenu.Root></div>
}
export default function Chosen() {
  const [big, setBig] = React.useState(false)
  const Tag = big ? Menubar.Root : React.Fragment
  return <div data-chosen=""><input type="checkbox" checked={big} onChange={(e) => setBig(e.currentTarget.checked)} /><Tag><p>Body text</p></Tag></div>
}
`,
	});
	assert.equal(only(list, 'Modal').refused, "passes its state to <Dialog.Root>'s modal, a prop convert does not port yet");
	assert.equal(only(list, 'Nested').refused, "passes its state to <DropdownMenu.Root>'s dir, which its port reads on <DropdownMenu.Trigger>, not a child of it here");
	assert.equal(only(list, 'Chosen').refused, "its state's markup reads Menubar, which the page has no value for");
});
