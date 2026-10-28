import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chosenTemplate } from '../src/convert/chosen-template.ts';

// shadcn's DataTableFacetedFilter trigger, past its title: a separator, the count (on small screens), and a badge per
// chosen label, or "N selected" past two.
const trigger = (labels: readonly string[]) => {
	const list = labels.length > 2 ? `<span data-slot="badge" class="rounded-sm">${labels.length} selected</span>` : labels.map((l) => `<span data-slot="badge" class="rounded-sm">${l}</span>`).join('');
	return `<div data-slot="separator" class="mx-2 h-4"></div><span data-slot="badge" class="lg:hidden">${labels.length}</span><div class="hidden space-x-1 lg:flex">${list}</div>`;
};

test('what a control shows of its chosen values is one template: the count read where it is shown, a badge per label, and the count past two', () => {
	const variants = [['Backlog'], ['Todo'], ['Done'], ['Backlog', 'Todo'], ['Backlog', 'Todo', 'Done']].map((labels) => ({ labels, html: trigger(labels) }));
	assert.equal(
		chosenTemplate(variants, 'n', 'ls'),
		'<div data-slot="separator" class="mx-2 h-4"></div><span data-slot="badge" class="lg:hidden">{n}</span><div class="hidden space-x-1 lg:flex">@if (n > 2) { <><span data-slot="badge" class="rounded-sm">{n}{" selected"}</span></> } @else { <>@for (const l of ls; key l) { <span data-slot="badge" class="rounded-sm">{l}</span> }</> }</div>',
	);
});

test('an alternately shaped list (items before and after the chosen ones, no count) is one template too, and markup no rule explains is none', () => {
	const shown = (labels: readonly string[]) => `<ul><li class="head">Picked</li>${labels.map((l) => `<li class="pick"><b>${l}</b></li>`).join('')}<li class="tail">end</li></ul>`;
	assert.equal(chosenTemplate([['a'], ['b'], ['a', 'b']].map((labels) => ({ labels, html: shown(labels) })), 'n', 'ls'), '<ul><li class="head">Picked</li>@for (const l of ls; key l) { <li class="pick"><b>{l}</b></li> }<li class="tail">end</li></ul>');
	assert.equal(chosenTemplate([{ labels: ['a'], html: '<p class="x">one</p>' }, { labels: ['b'], html: '<p class="y">one</p>' }], 'n', 'ls'), undefined);
});

test('with a hide expression every side is rendered and hidden on the others: no arm holds the count', () => {
	const variants = [['Backlog'], ['Todo'], ['Backlog', 'Todo'], ['Backlog', 'Todo', 'Done']].map((labels) => ({ labels, html: trigger(labels) }));
	assert.equal(
		chosenTemplate(variants, 'n', 'ls', '!(n > 0)'),
		'<div data-slot="separator" class="mx-2 h-4" hidden={!(n > 0)}></div><span data-slot="badge" class="lg:hidden" hidden={!(n > 0)}>{n}</span><div class="hidden space-x-1 lg:flex" hidden={!(n > 0)}><span data-slot="badge" class="rounded-sm" hidden={n <= 2}>{n}{" selected"}</span>@for (const l of ls; key l) { <span data-slot="badge" class="rounded-sm" hidden={n > 2}>{l}</span> }</div>',
	);
});
