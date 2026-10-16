import assert from 'node:assert/strict';
import { test } from 'node:test';
import { covers, describeRule, discoverStates, parseRules } from '../src/check/stylesheet.ts';

const css = `.nav a:hover > span, details[open] summary { color: red }
.card { &:focus-within .title { color: blue } }
input:checked + label, button:disabled { opacity: .5 }
@media (min-width: 40em) and (prefers-color-scheme: dark) { .x { color: white } }
@media (width < 600px) { .y { display: none } }
@media (prefers-reduced-motion: no-preference) { .z { transition: opacity .2s } }
@container sidebar (min-width: 300px) { .w { display: grid } }
@keyframes spin { from { rotate: 0deg } }`;

test('every state and condition the stylesheet styles is listed with what to force', () => {
	assert.deepEqual(
		discoverStates([{ url: '/a.css', text: css }]).map((s) => s.label),
		[
			':hover on .nav a',
			'[open] on details',
			':focus-within on .card',
			':checked on input',
			':disabled on button',
			'prefers-color-scheme: dark',
			'viewport width 639px',
			'viewport width 640px',
			'viewport width 599px',
			'viewport width 600px',
			'prefers-reduced-motion: no-preference',
			'container sidebar width 299px',
			'container sidebar width 300px',
		],
	);
});

test('rules keep their selector, file, line, column, conditions and specificity, and keyframes are not rules', () => {
	const rules = parseRules([{ url: '/a.css', text: css }]);
	const nested = rules.find((r) => r.selector.includes('.title'))!;
	assert.equal(nested.selector, '.card:focus-within .title');
	assert.equal(nested.line, 2);
	assert.deepEqual(nested.specificity, [0, 3, 0]);
	assert.equal(describeRule(rules.find((r) => r.selector === '.x')!), '`.x` inside @media (min-width:40em) and (prefers-color-scheme:dark) (/a.css:4:61)');
	assert.ok(!rules.some((r) => r.selector === 'from'));
	assert.deepEqual(rules.find((r) => r.selector === '.w')!.conditions, [{ kind: 'container', text: 'sidebar (min-width:300px)' }]);
});

test('a declared shorthand covers the computed longhands it sets', () => {
	assert.ok(covers('background', 'background-color'));
	assert.ok(covers('margin', 'margin-block-start'));
	assert.ok(covers('gap', 'row-gap'));
	assert.ok(covers('font', 'line-height'));
	assert.ok(!covers('border', 'outline-color'));
	assert.ok(!covers('color', 'background-color'));
});
