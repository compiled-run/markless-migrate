import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { elementChildren, walk, type Element } from '../src/convert/dom.ts';
import { RadixFormPlan, radixForms } from '../src/convert/radix-form.ts';
import { emitChildren, emitElement } from '../src/convert/tsrx.ts';

// The Cypress story of radix-ui 1.4.3's apps/storybook/stories/form.stories.tsx, cut down to the fields it has of each kind.
const SOURCE = `import * as React from 'react';
import { Form } from 'radix-ui';

export const Cypress = () => {
  const [serverErrors, setServerErrors] = React.useState<{ email?: boolean; pin?: boolean }>({});
  return (
    <>
      <Form.Root data-slot="form" onClearServerErrors={() => setServerErrors({})}>
        <Form.Field data-slot="form-field" name="name">
          <Form.Label data-slot="form-label">Name (required)</Form.Label>
          <Form.Control data-slot="form-control" type="text" required />
          <Form.Message data-slot="form-message" match="valueMissing" />
          <Form.Message data-slot="form-message" match="valid">valid!</Form.Message>
        </Form.Field>
        <Form.Field data-slot="form-field" name="email" serverInvalid={serverErrors.email}>
          <Form.Label data-slot="form-label">Email</Form.Label>
          <Form.Control data-slot="form-control" type="email" />
          <Form.Message data-slot="form-message" match="typeMismatch" />
          {serverErrors.email ? (
            <Form.Message data-slot="form-message">Email is actually required server side!</Form.Message>
          ) : null}
        </Form.Field>
        <Form.Field data-slot="form-field" name="pin" serverInvalid={serverErrors.pin}>
          <Form.Label data-slot="form-label">Pin (4 digits)</Form.Label>
          <Form.Control data-slot="form-control" type="text" pattern="\\d{4,4}" />
          <Form.Message data-slot="form-message" match="patternMismatch" forceMatch={serverErrors.pin} />
        </Form.Field>
        <Form.Field data-slot="form-field" name="secret">
          <Form.Label data-slot="form-label">Secret 1</Form.Label>
          <Form.Control data-slot="form-control" type="text" />
          <Form.Message data-slot="form-message" match={(value) => value !== 'shush'} />
        </Form.Field>
        <Form.Field data-slot="form-field" name="asyncSecret">
          <Form.Label data-slot="form-label">Secret 2</Form.Label>
          <Form.Control data-slot="form-control" type="text" />
          <Form.Message data-slot="form-message"
            match={async (value) => {
              await wait(100);
              return value !== 'shush';
            }}
          />
        </Form.Field>
        <Form.Field data-slot="form-field" name="country">
          <Form.Label data-slot="form-label" htmlFor="my-country">Country</Form.Label>
          <Form.Control data-slot="form-control" id="my-country" type="text" pattern="France|Spain" />
          <Form.Message data-slot="form-message" match="patternMismatch">Country should be "France" or "Spain"</Form.Message>
        </Form.Field>
        <Form.Submit data-slot="form-submit">submit</Form.Submit>
      </Form.Root>
    </>
  );
};

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
`;

// What the old page renders at load, as convert copies it.
const PAGE = `<div id="storybook-root"><form data-slot="form"><div data-slot="form-field"><label data-slot="form-label" for="radix-_r_0_">Name (required)</label><input title="" data-slot="form-control" required id="radix-_r_0_" type="text" name="name"></div><div data-slot="form-field"><label data-slot="form-label" for="radix-_r_2_">Email</label><input title="" data-slot="form-control" id="radix-_r_2_" type="email" name="email"></div><div data-slot="form-field"><label data-slot="form-label" for="radix-_r_4_">Pin (4 digits)</label><input title="" data-slot="form-control" pattern="\\d{4,4}" id="radix-_r_4_" type="text" name="pin"></div><div data-slot="form-field"><label data-slot="form-label" for="radix-_r_5_">Secret 1</label><input title="" data-slot="form-control" id="radix-_r_5_" type="text" name="secret"></div><div data-slot="form-field"><label data-slot="form-label" for="radix-_r_7_">Secret 2</label><input title="" data-slot="form-control" id="radix-_r_7_" type="text" name="asyncSecret"></div><div data-slot="form-field"><label data-slot="form-label" for="my-country">Country</label><input title="" data-slot="form-control" id="my-country" pattern="France|Spain" type="text" name="country"></div><button type="submit" data-slot="form-submit">submit</button></form></div>`;

const pageRoot = () => elementChildren(parseFragment(PAGE) as unknown as Element)[0]!;
const emit = (html: string) => emitChildren(parseFragment(html) as unknown as Element);

test('the source gives each Form.Field its messages in order: built-in matches, custom matchers, and what renders only from page state', () => {
	const [form] = radixForms('src/form.tsx', SOURCE);
	assert.ok(form);
	assert.deepEqual(form.fields.map((f) => f.name), ['name', 'email', 'pin', 'secret', 'asyncSecret', 'country']);
	const name = form.fields[0]!;
	assert.deepEqual(name.children.map((c) => c.kind), ['label', 'control', 'message', 'message']);
	const messages = form.fields.flatMap((f) => f.children.flatMap((c) => (c.kind === 'message' ? [c] : [])));
	assert.deepEqual(messages.map((m) => m.match), ['valueMissing', 'valid', 'typeMismatch', 'patternMismatch', 0, 1, 'patternMismatch']);
	assert.deepEqual(messages.map((m) => m.html), [
		'<span data-slot="form-message">This value is missing</span>',
		'<span data-slot="form-message">valid!</span>',
		'<span data-slot="form-message">This value does not match the required type</span>',
		'<span data-slot="form-message">This value does not match the required pattern</span>',
		'<span data-slot="form-message">This value is not valid</span>',
		'<span data-slot="form-message">This value is not valid</span>',
		'<span data-slot="form-message">Country should be "France" or "Spain"</span>',
	]);
	// The server message renders only while the story's own state says so: nothing at load, and nothing the port shows.
	assert.deepEqual(form.fields[1]!.children.map((c) => c.kind), ['label', 'control', 'message', 'dynamic']);
	assert.ok(form.notes.some((n) => /pin.*forceMatch/.test(n)), form.notes.join('\n'));
	// The custom matchers are the source's functions, with the module function they call.
	assert.match(form.matchers!, /export const matchers = \[\(value\) => value !== 'shush', async \(value\) => \{/);
	assert.match(form.matchers!, /async function wait\(ms: number\)/);
});

test('the page form gets its messages as templates where Radix renders them, and its fields, labels and controls marked', () => {
	const plan = new RadixFormPlan(radixForms('src/form.tsx', SOURCE));
	const root = pageRoot();
	assert.equal(plan.add('/story/form--cypress/', root, emit), 1, plan.notes.join('\n'));
	const out = emitElement(root, { bind: (el) => plan.bind(el) });
	const key = /data-mm-rf="(rfm_[0-9a-f]+)"/.exec(out)?.[1];
	assert.ok(key, out);
	assert.match(out, /<form data-slot="form" data-mm-rf="rfm_[0-9a-f]+" onVisible=\{\(\) => mount\("data-mm-rf"\)\}>/);
	assert.match(out, /<div data-slot="form-field" data-mm-rf-field="name"><label data-slot="form-label" for="radix-_r_0_" data-mm-rf-label="name">Name \(required\)<\/label><input title="" data-slot="form-control" required id="radix-_r_0_" type="text" name="name" data-mm-rf-control="" \/><template data-mm-rf-message="name" data-mm-rf-match="valueMissing"><span data-slot="form-message">This value is missing<\/span><\/template><template data-mm-rf-message="name" data-mm-rf-match="valid"><span data-slot="form-message">valid!<\/span><\/template><\/div>/);
	assert.match(out, /<template data-mm-rf-message="secret" data-mm-rf-matcher="0">/);
	assert.match(out, /<template data-mm-rf-message="asyncSecret" data-mm-rf-matcher="1">/);
	assert.match(out, /<template data-mm-rf-message="country" data-mm-rf-match="patternMismatch"><span data-slot="form-message">Country should be "France" or "Spain"<\/span><\/template>/);
	const files = plan.files();
	assert.match(files.get('radix-forms.ts')!, new RegExp(`${key}: \\(\\) => import\\('./radix-form-matchers/${key}.ts'\\)\\.then\\(\\(m\\) => m\\.matchers\\)`));
	assert.match(files.get(`radix-form-matchers/${key}.ts`)!, /export const matchers = \[/);
	assert.ok(plan.used);
});

test('a page form no source Form.Root renders, or whose fields the page shows otherwise, is left as it is', () => {
	const plan = new RadixFormPlan(radixForms('src/form.tsx', SOURCE));
	const other = elementChildren(parseFragment('<form><input name="q"></form>') as unknown as Element)[0]!;
	assert.equal(plan.add('/', other, emit), 0);
	// A field showing a message at load the source renders only on a match: the page is not what the source says it is.
	const shown = pageRoot();
	const nameField = [...walk(shown)].find((el) => el.tagName === 'div' && el.attrs.some((a) => a.name === 'data-slot' && a.value === 'form-field'))!;
	(nameField.childNodes as unknown[]).push(...(parseFragment('<span>extra</span>').childNodes as unknown[]).map((n) => Object.assign(n as object, { parentNode: nameField })));
	const again = new RadixFormPlan(radixForms('src/form.tsx', SOURCE));
	again.add('/', shown, emit);
	assert.ok(again.notes.some((n) => /name/.test(n)), again.notes.join('\n'));
	assert.equal(again.bind(nameField), undefined);
});
