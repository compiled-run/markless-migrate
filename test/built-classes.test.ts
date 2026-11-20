import assert from 'node:assert/strict';
import { test } from 'node:test';
import { builtStarts, classFacts, parseModule } from '../src/convert/built-classes.ts';

const facts = (files: Record<string, string>) => Object.entries(files).map(([file, text]) => classFacts(parseModule(file, text)!));

test('a template counts as a built class where its value reaches a class: an attribute, classList, a class helper, className, setAttribute("class")', () => {
	assert.deepEqual(
		builtStarts(
			facts({
				'a.tsrx': 'export default function A() @{ <div className={`size-${n}`} class={on ? `tone-${t}` : "x"}></div> }',
				'b.ts': 'el.classList.add(`style-${s}`); el.classList.toggle(`base-color-${c}`, true); cn(`text-${c}`, x); el.className = `gap-${g}`; el.setAttribute("class", `ring-${r}`);',
			}),
		).sort(),
		['base-color-', 'gap-', 'ring-', 'size-', 'style-', 'text-', 'tone-'],
	);
});

test("a template under a name another module puts in a class counts (/create's bodyClasses spread into classList.add)", () => {
	const files = {
		'params.ts': 'export function design(p) { return { bodyClasses: [`style-${p.style}`, `base-color-${p.color}`], key: `menu-${p.menu}` }; }',
		'preview.ts': 'const d = design(p); document.body.classList.add(...d.bodyClasses);',
	};
	assert.deepEqual(builtStarts(facts(files)).sort(), ['base-color-', 'style-']);
});

test('a template that names an id, an attribute, a selector, a key, a URL, a log line or a type is no class', () => {
	assert.deepEqual(
		builtStarts(
			facts({
				'a.tsrx': 'export default function A() @{ <div id={`create-${p}`} aria-labelledby={`create-${p}-tab`} data-mm-layer={`create-${p}`}></div> }',
				'b.ts': 'el.setAttribute(`data-${k}`, v); toggle(el, `data-overflow-${e}`, on); document.querySelector(`[data-slot="q-${s}"]`); const items = list.map((i) => ({ key: `ellipsis-${i}` })); console.log(`log-${x}`); fetch(`/api-${x}`); type A = { attribute: `data-${string}` };',
			}),
		),
		[],
	);
});

test("a class built by '+' from a fixed start counts; one with no fixed start in a class position is named as unseen", () => {
	const text = 'el.classList.add("tone-" + t);\nel.classList.add(`${size}-text`);\ncn(["a", b].join("-"));\nel.className = name;';
	const f = classFacts(parseModule('a.ts', text)!);
	assert.deepEqual(builtStarts([f]), ['tone-']);
	assert.deepEqual(f.unseen.map((at) => text.slice(0, at).split('\n').length), [2, 3]);
});
