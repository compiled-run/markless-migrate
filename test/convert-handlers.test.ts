// A handler the source gives an element, carried as code (src/library/handlers.ts), is placed on the page element that
// shows what the source fixes for it and listened for where its part says the library calls it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { carriedBinding, CARRY_MARK, markHandlers, type HandlerFact } from '../src/convert/handlers.ts';
import { attr, body, find, parseDocument, textContent, walk, type Element } from '../src/convert/dom.ts';
import { NotifyPlan } from '../src/convert/stateful.ts';
import { emitChildren, emitElement } from '../src/convert/tsrx.ts';

const code = (title: string) => `(toast) => {\nfunction handleSubmit(event) { toast(${JSON.stringify(title)}, { description: 'x' }) }\nreturn handleSubmit;\n}`;
const fact = (words: string[], title: string, more: Partial<HandlerFact> = {}): HandlerFact => ({ file: 'examples/q.tsx', line: 1, element: 'Questionnaire', event: 'submit', slots: ['questionnaire'], words, code: code(title), calls: { toast: { from: 'sonner', imported: 'toast' } }, ...more });

const PAGE = `<main>
<form data-slot="questionnaire"><legend>What should the agent build next?</legend><input placeholder="Describe another feature"></form>
<form data-slot="questionnaire"><legend>When should work begin?</legend><p>Start now</p></form>
</main>`;

const marked = (html: string, facts: HandlerFact[]) => {
	const root = body(parseDocument(html));
	markHandlers([root], facts);
	return [...walk(root)].filter((el) => attr(el, CARRY_MARK) !== undefined).map((el) => `${attr(el, CARRY_MARK)} ${textContent(el)}`);
};

test('a handler marks the element of its slots that shows most of the text the source fixes for it, attributes included', () => {
	const facts = [fact(['When should work begin?', 'Start now'], 'B'), fact(['What should the agent build next?', 'Describe another feature'], 'A')];
	assert.deepEqual(marked(PAGE, facts), ['1 What should the agent build next?', '0 When should work begin?Start now']);
});

test('a handler two elements fit equally, or that shows too little of its text, is not placed; copies of one demo are one handler', () => {
	assert.deepEqual(marked(PAGE.replace('Start now', 'What should the agent build next?'), [fact(['What should the agent build next?'], 'A')]), []);
	assert.deepEqual(marked(PAGE, [fact(['What should the agent build next?', 'Not on the page', 'Nor this one'], 'A')]), []);
	assert.deepEqual(marked(PAGE, [fact(['When should work begin?'], 'B'), fact(['When should work begin?'], 'B', { file: 'registry/q.tsx' })]), ['0 When should work begin?Start now']);
	assert.deepEqual(marked(PAGE, [fact(['When should work begin?'], 'B'), fact(['When should work begin?'], 'C')]), []);
});

test('a carried handler is written inline on its element, on the event its part announces, given what the page calls for its library calls', () => {
	const root = body(parseDocument(PAGE));
	const facts = [fact(['When should work begin?', 'Start now'], 'Saved', { cancels: true })];
	markHandlers([root], facts);
	const form = find(root, (el) => attr(el, CARRY_MARK) !== undefined)!;
	const toast = { call: '(message, options) => sonnerToast(T, S, commit, message, options)', declare: ['let tst0 = state(SONNER_EMPTY);'] };
	const announced = carriedBinding(form, () => 'mmsubmit', true, () => toast, facts)!;
	assert.deepEqual(announced.declare, toast.declare);
	assert.deepEqual(announced.omit, [CARRY_MARK]);
	assert.equal(announced.extra![0], `onMmsubmit={(mmEvent) => { (${facts[0]!.code})(${toast.call})(mmEvent); }}`);
	// On the DOM event itself, the page cancels it as it dispatches, which the handler's own cancel could not.
	assert.match(carriedBinding(form, () => undefined, false, () => toast, facts)!.extra![0]!, /^onSubmit=\{\(mmEvent\) => \{ mmEvent\.preventDefault\(\); /);
	// A page with nothing to call for its library call leaves the handler out.
	assert.deepEqual(carriedBinding(form, () => undefined, false, () => undefined, facts), { omit: [CARRY_MARK] });
	assert.equal(emitElement(form, { bind: (el) => (el === form ? carriedBinding(el, () => 'mmsubmit', true, () => toast, facts) : undefined) }).includes(CARRY_MARK), false);
});

test("a toaster shows a toast the page's own code adds: a plain toast the old page showed, with the call's title and a description shaped like its title", () => {
	const doc = parseDocument('<body><main><button>Reset changes</button><form data-slot="questionnaire"></form></main><section aria-label="Notifications alt+T" aria-live="polite"></section></body>');
	const button = find(body(doc), (el) => el.tagName === 'button')!;
	const region = find(body(doc), (el) => el.tagName === 'section')!;
	const form = find(body(doc), (el) => el.tagName === 'form')!;
	const toaster = { position: 'top-center', gap: 14, visibleToasts: 3, expand: false, hotkey: ['altKey', 'KeyT'], ol: [['data-sonner-toaster', 'true']] as [string, string][] };
	const plan = new NotifyPlan();
	plan.programmatic = true;
	plan.add([{ sig: 'b', nth: 0, into: { sig: 'r', nth: 0 }, html: '', ms: 4600, sonner: { toaster, dismissible: true, duration: 4000, promise: false, phases: [{ at: 0, attrs: [['data-sonner-toast', '']], inner: '<div data-content="" class=""><div data-title="" class="">Saved answers restored</div></div>' }] } }], (sig) => (sig === 'b' ? button : region), (html, bind) => emitChildren(parseFragment(html) as unknown as Element, bind ? { bind } : {}));
	const out = emitElement(body(doc), { bind: (el) => plan.bind(el) });
	assert.match(out, /<div data-content="" class="" style=\{item\.view === "1\.0" \? undefined : "display: none"\}><div data-title="" class="">\{item\.t\["title"\] \?\? ""\}<\/div><div data-description="" class="" hidden=\{!item\.t\["description"\]\}>\{item\.t\["description"\] \?\? ""\}<\/div><\/div>/);
	const program = plan.programFor(form)!;
	assert.match(program.call, /^\(message, options\) => sonnerToast\(\{"id":"tst0"[^]*\{"view":1,[^]*\(v\) => \(tst0 = v\), message, options\)$/);
	assert.deepEqual(program.declare, ['let tst0 = state(SONNER_EMPTY);']);
	// Without a handler calling toast(), the toaster renders only what the old page showed.
	const plain = new NotifyPlan();
	plain.add([{ sig: 'b', nth: 0, into: { sig: 'r', nth: 0 }, html: '', ms: 4600, sonner: { toaster, dismissible: true, duration: 4000, promise: false, phases: [{ at: 0, attrs: [['data-sonner-toast', '']], inner: '<div data-content=""><div data-title="">Saved</div></div>' }] } }], (sig) => (sig === 'b' ? button : region), (html, bind) => emitChildren(parseFragment(html) as unknown as Element, bind ? { bind } : {}));
	assert.equal(plain.programFor(form), undefined);
});
