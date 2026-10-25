import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { compareJourneys, explore, replayAll, timedOnly, type RecordedJourney } from '../src/check/journeys.ts';
import { VIEWPORTS } from '../src/check/types.ts';

// A step that only answered later is timed again one side at a time before it stands (run.ts retime); these tests compare what the steps did, so a busy machine's late answer is left to that.
const compared = (...args: Parameters<typeof compareJourneys>) => compareJourneys(...args).filter((f) => !timedOnly.has(f));

// A select-only combobox as Radix draws it: focus moves onto the highlighted option when the list opens and back to the trigger when it closes.
// `reopenAfter` is where a reopened list starts, as an offset from the chosen option: 0 as the old page does, 1 for the port's bug.
// `remount`: the list is put in and placed on every open, as React mounts a portal, instead of kept and shown.
// `spare`: another select's list with the same options is kept in the page, hidden.
const combobox = (reopenAfter: number, remount = false, spare = false) => `
<label id="fruit-label">Fruit</label>
<button id="fruit" type="button" role="combobox" aria-labelledby="fruit-label fruit" aria-expanded="false" aria-controls="fruits">Pick a fruit</button>
${(spare ? ['fruits', 'spare'] : ['fruits']).map((id) => `<div id="${id}" role="listbox" hidden>${['Apple', 'Banana', 'Cherry', 'Grape', 'Mango'].map((f) => `<div role="option" tabindex="-1" aria-selected="false">${f}</div>`).join('')}</div>`).join('')}
<div role="tablist" aria-label="Install"><button role="tab" aria-selected="true" tabindex="0">pnpm</button><button role="tab" aria-selected="false" tabindex="-1">npm</button><button role="tab" aria-selected="false" tabindex="-1">yarn</button></div>
<p style="height: 400px">Room to click outside.</p>
<script>
const trigger = document.getElementById('fruit');
const list = document.getElementById('fruits');
const options = [...list.querySelectorAll('[role="option"]')];
let chosen = -1;
let at = -1;
const highlight = (i) => {
	at = (i + options.length) % options.length;
	options.forEach((o, k) => o.toggleAttribute('data-highlighted', k === at));
	options[at].focus();
};
${remount ? "list.remove();" : "list.style.marginTop = '4px';"}
const open = (start) => {
	${remount ? "trigger.after(list); list.style.marginTop = '4px';" : ''}
	list.hidden = false;
	trigger.setAttribute('aria-expanded', 'true');
	highlight(start ?? (chosen >= 0 ? chosen + ${reopenAfter} : 0));
};
const close = () => {
	list.hidden = true;
	trigger.setAttribute('aria-expanded', 'false');
	options.forEach((o) => o.removeAttribute('data-highlighted'));
	${remount ? 'list.remove();' : ''}
	trigger.focus();
};
const choose = () => {
	chosen = at;
	options.forEach((o, k) => o.setAttribute('aria-selected', String(k === chosen)));
	trigger.textContent = options[chosen].textContent;
	close();
};
trigger.addEventListener('click', () => (list.hidden ? open() : close()));
trigger.addEventListener('keydown', (e) => {
	if (!list.hidden) return;
	if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
		e.preventDefault();
		open(e.key === 'ArrowUp' && chosen < 0 ? options.length - 1 : undefined);
	}
});
list.addEventListener('keydown', (e) => {
	const moves = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: options.length - 1 };
	if (e.key in moves) highlight(Math.max(0, Math.min(options.length - 1, moves[e.key])));
	else if (e.key === 'Enter' || e.key === ' ') choose();
	else if (e.key === 'Escape') close();
	else if (/^[a-z]$/i.test(e.key)) {
		const i = options.findIndex((o) => o.textContent.toLowerCase().startsWith(e.key.toLowerCase()));
		if (i >= 0) highlight(i);
	} else return;
	e.preventDefault();
});
document.addEventListener('pointerdown', (e) => {
	if (!list.hidden && !list.contains(e.target) && e.target !== trigger) close();
});
const tabs = [...document.querySelectorAll('[role="tab"]')];
document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
	const i = tabs.indexOf(document.activeElement);
	const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
	if (to === undefined) return;
	e.preventDefault();
	const k = (to + tabs.length) % tabs.length;
	tabs.forEach((t, n) => { t.setAttribute('aria-selected', String(n === k)); t.tabIndex = n === k ? 0 : -1; });
	tabs[k].focus();
});
</script>`;

const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Select</title></head><body><main><h1>Select</h1>${body}</main></body></html>`;

let browser: Browser;
const servers: Server[] = [];
after(async () => {
	await browser?.close();
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

function serve(html: string): Promise<string> {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html));
	servers.push(server);
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

const desktop = VIEWPORTS[0]!;
let old: string;
let journeys: RecordedJourney[];

before(async () => {
	browser = await chromium.launch();
	old = await serve(page(combobox(0)));
	journeys = (await explore(browser, defaultEnv(old), '/', desktop, { budgetMs: 60_000 })).journeys.filter((j) => j.pattern);
});

test('a custom combobox and a tablist get WAI-ARIA keyboard journeys in a fixed order, read the same on every old run', async () => {
	assert.deepEqual(journeys.map((j) => j.name), [
		'combobox keys on combobox "Fruit Pick a fruit": open with ArrowDown, choose with Enter, reopen with ArrowDown, then Escape, End, Home and typeahead',
		'combobox keys on combobox "Fruit Pick a fruit": open with Enter and with Space, choose with Enter, reopen with Enter',
		'combobox keys on combobox "Fruit Pick a fruit": open with ArrowUp, close by a click outside, reopen with ArrowDown',
		'tabs keys on tablist "Install": arrows both ways, Enter, End, Space, Home, and past the first tab',
	]);
	const first = journeys[0]!;
	assert.equal(first.expected.length, first.steps.length);
	assert.ok(first.expected.every((r) => !r.failed && r.widget));
	// After Enter chose Cherry, ArrowDown reopens on Cherry: the step the port's bug changes.
	assert.match(first.expected[4]!.widget!.join(' | '), /highlighted: option "Cherry"/);
	assert.match(first.expected[4]!.focus, /option "Cherry"/);
	assert.match(first.expected[3]!.widget!.join(' | '), /value: "Cherry" \| expanded: false/);
	const again = await replayAll(browser, defaultEnv(old), '/', desktop, journeys);
	assert.deepEqual(compared('/', [journeys.map((j) => j.expected)], journeys, again), []);
});

test('a port that matches passes the keyboard journeys', async () => {
	const next = await serve(page(combobox(0)));
	const runs = await replayAll(browser, defaultEnv(next), '/', desktop, journeys);
	assert.deepEqual(compared('/', [journeys.map((j) => j.expected)], journeys, runs), []);
});

test('a list the old page puts in and places on every open matches a port that keeps it placed and shows it, beside a hidden list with the same options', async () => {
	const remounted = await serve(page(combobox(0, true)));
	const expected = (await explore(browser, defaultEnv(remounted), '/', desktop, { budgetMs: 60_000 })).journeys.filter((j) => j.pattern?.startsWith('combobox'));
	assert.equal(expected.length, 3);
	const runs = await replayAll(browser, defaultEnv(await serve(page(combobox(0, false, true)))), '/', desktop, expected);
	assert.deepEqual(compared('/', [expected.map((j) => j.expected)], expected, runs), []);
});

test('a port whose reopened list starts on the option after the chosen one is red at the reopening step', async () => {
	const next = await serve(page(combobox(1)));
	const runs = await replayAll(browser, defaultEnv(next), '/', desktop, journeys);
	const failures = compared('/', [journeys.map((j) => j.expected)], journeys, runs);
	assert.deepEqual(failures.map((f) => [f.dimension, f.check]), [
		['a11y', 'combobox keys on combobox "Fruit Pick a fruit": open with ArrowDown, choose with Enter, reopen with ArrowDown, then Escape, End, Home and typeahead (step 5: press ArrowDown)'],
		['a11y', 'combobox keys on combobox "Fruit Pick a fruit": open with Enter and with Space, choose with Enter, reopen with Enter (step 7: press Enter)'],
	]);
	assert.match(failures[0]!.expected, /focus on option "Cherry" \[selected\]; widget: value: "Cherry" \| expanded: true \| highlighted: option "Cherry"/);
	assert.match(failures[0]!.actual, /focus on option "Grape"; widget: value: "Cherry" \| expanded: true \| highlighted: option "Grape"/);
});

// One of each other pop-up pattern, drawn by hand. With `bug`, Escape leaves the tooltip shown and moves focus out of a closing dialog to the body.
const widgets = (bug: boolean) => `
<button id="more" type="button" aria-expanded="false" aria-controls="more-panel">More</button><div id="more-panel" hidden>Details</div>
<button id="actions" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="actions-menu">Actions</button>
<div id="actions-menu" role="menu" hidden><div role="menuitem" tabindex="-1">Copy</div><div role="menuitem" tabindex="-1">Paste</div><div role="menuitem" tabindex="-1">Rename</div></div>
<button id="share" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="share-dialog">Share</button>
<div id="share-dialog" role="dialog" aria-modal="true" aria-label="Share" hidden><button type="button">Copy link</button><button type="button">Email</button></div>
<button id="save" type="button">Save</button><span id="save-tip" role="tooltip" hidden>Save the draft</span>
<div role="listbox" aria-label="Size" tabindex="0" aria-activedescendant="size-0"><div id="size-0" role="option" aria-selected="true">Small</div><div id="size-1" role="option" aria-selected="false">Medium</div><div id="size-2" role="option" aria-selected="false">Large</div></div>
<div role="menubar" aria-label="Edit"><div role="menuitem" tabindex="0">File</div><div role="menuitem" tabindex="-1">Edit</div><div role="menuitem" tabindex="-1">View</div></div>
<p style="height: 400px">Room to click outside.</p>
<script>
const $ = (id) => document.getElementById(id);
$('more').addEventListener('click', () => { const open = $('more').getAttribute('aria-expanded') !== 'true'; $('more').setAttribute('aria-expanded', String(open)); $('more-panel').hidden = !open; });
const roving = (items, i) => { items.forEach((x, k) => (x.tabIndex = k === i ? 0 : -1)); items[i].focus(); };
const menu = $('actions-menu'); const items = [...menu.children]; let at = 0;
const openMenu = (i) => { menu.hidden = false; $('actions').setAttribute('aria-expanded', 'true'); at = i; roving(items, at); };
const closeMenu = () => { menu.hidden = true; $('actions').setAttribute('aria-expanded', 'false'); $('actions').focus(); };
$('actions').addEventListener('keydown', (e) => { if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openMenu(e.key === 'ArrowUp' ? items.length - 1 : 0); } });
$('actions').addEventListener('click', (e) => { if (e.detail) menu.hidden ? openMenu(0) : closeMenu(); });
menu.addEventListener('keydown', (e) => {
	const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
	if (to !== undefined) { at = (to + items.length) % items.length; roving(items, at); }
	else if (e.key === 'Escape' || e.key === 'Enter') closeMenu();
	else if (/^[a-z]$/i.test(e.key)) { const i = items.findIndex((x) => x.textContent.toLowerCase().startsWith(e.key)); if (i >= 0) { at = i; roving(items, at); } }
	else return;
	e.preventDefault();
});
const dialog = $('share-dialog');
const openDialog = () => { dialog.hidden = false; $('share').setAttribute('aria-expanded', 'true'); dialog.querySelector('button').focus(); };
const closeDialog = () => { dialog.hidden = true; $('share').setAttribute('aria-expanded', 'false'); ${bug ? "document.activeElement.blur();" : "$('share').focus();"} };
$('share').addEventListener('click', () => (dialog.hidden ? openDialog() : closeDialog()));
dialog.addEventListener('keydown', (e) => {
	const buttons = [...dialog.querySelectorAll('button')];
	if (e.key === 'Escape') closeDialog();
	else if (e.key === 'Tab') buttons[(buttons.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
	else return;
	e.preventDefault();
});
document.addEventListener('pointerdown', (e) => {
	if (!menu.hidden && !menu.contains(e.target) && e.target !== $('actions')) closeMenu();
	if (!dialog.hidden && !dialog.contains(e.target) && e.target !== $('share')) closeDialog();
});
$('save').addEventListener('focus', () => { $('save-tip').hidden = false; $('save').setAttribute('aria-describedby', 'save-tip'); });
$('save').addEventListener('blur', () => { $('save-tip').hidden = true; $('save').removeAttribute('aria-describedby'); });
$('save').addEventListener('keydown', (e) => { if (e.key === 'Escape') ${bug ? '{}' : "$('save-tip').hidden = true;"} });
const listbox = document.querySelector('[role="listbox"]'); const sizes = [...listbox.children]; let size = 0;
listbox.addEventListener('keydown', (e) => {
	const to = { ArrowDown: size + 1, ArrowUp: size - 1, Home: 0, End: sizes.length - 1 }[e.key];
	if (to === undefined) return;
	e.preventDefault();
	size = Math.max(0, Math.min(sizes.length - 1, to));
	sizes.forEach((o, k) => o.setAttribute('aria-selected', String(k === size)));
	listbox.setAttribute('aria-activedescendant', sizes[size].id);
});
const bar = [...document.querySelector('[role="menubar"]').children]; let col = 0;
document.querySelector('[role="menubar"]').addEventListener('keydown', (e) => {
	const to = { ArrowRight: col + 1, ArrowLeft: col - 1, Home: 0, End: bar.length - 1 }[e.key];
	if (to === undefined) return;
	e.preventDefault();
	col = (to + bar.length) % bar.length;
	roving(bar, col);
});
</script>`;

test('a disclosure, a menu button, a dialog, a tooltip, a listbox and a menubar each get keyboard journeys; a port whose Escape keeps the tooltip and drops focus from the dialog is red at those steps', async () => {
	const old = await serve(page(widgets(false)));
	const found = (await explore(browser, defaultEnv(old), '/', desktop, { budgetMs: 60_000 })).journeys.filter((j) => j.pattern);
	assert.deepEqual([...new Set(found.map((j) => j.pattern))].sort(), ['disclosure', 'listbox', 'menu button', 'menubar', 'popup button', 'tooltip']);
	assert.ok(found.every((j) => j.expected.length === j.steps.length && j.expected.every((r) => !r.failed)), 'every journey runs to its end on the old page');
	const tip = found.find((j) => j.pattern === 'tooltip')!;
	assert.match(tip.expected[0]!.widget!.join(' | '), /tooltip: "Save the draft"/);
	assert.doesNotMatch(tip.expected[1]!.widget!.join(' | '), /tooltip/);
	assert.match(tip.expected[3]!.widget!.join(' | '), /tooltip: "Save the draft"/);
	const same = await replayAll(browser, defaultEnv(await serve(page(widgets(false)))), '/', desktop, found);
	assert.deepEqual(compared('/', [found.map((j) => j.expected)], found, same), []);
	const port = await replayAll(browser, defaultEnv(await serve(page(widgets(true)))), '/', desktop, found);
	assert.deepEqual(compared('/', [found.map((j) => j.expected)], found, port).map((f) => f.check), [
		'popup button keys on button "Share": open with Enter, Tab through it both ways, Escape, reopen with Space, close by a click outside, reopen with Enter (step 5: press Escape)',
		'tooltip keys on button "Save": show it by focus, hide it with Escape, Tab away, Shift+Tab back to show it again (step 2: press Escape)',
	]);
});
