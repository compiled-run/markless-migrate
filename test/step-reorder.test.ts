import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { readReaction, watchReaction } from '../src/check/journeys.ts';

// A command list as cmdk draws it: groups of options it sorts by re-appending the nodes themselves.
const LIST = `<!doctype html><html lang="en"><body><main><h1>Commands</h1>
<div id="list" role="listbox" aria-label="Commands" style="display: flex; flex-direction: column">
	<div role="group" aria-label="Pages" style="display: flex; flex-direction: column"><div role="option">Home</div><div role="option">Docs</div><div role="option">Blocks</div></div>
	<div role="group" aria-label="Components" style="display: flex; flex-direction: column"><div role="option">Accordion</div><div role="option">Button</div><div role="option">Dialog</div></div>
</div></main></body></html>`;

let browser: Browser;
let page: Page;
before(async () => {
	browser = await chromium.launch();
	page = await browser.newPage();
});
after(async () => {
	await browser?.close();
});

async function affectedBy(step: () => void | Promise<void>): Promise<string[]> {
	await page.setContent(LIST);
	await page.evaluate(watchReaction);
	await page.evaluate(step);
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0))));
	return (await page.evaluate(readReaction)).affected;
}

test('an original that re-appends every option and group where it already stood changes nothing a visitor or assistive tech perceives', async () => {
	const affected = await affectedBy(() => {
		const list = document.getElementById('list')!;
		for (const group of [...list.children]) {
			for (const option of [...group.children]) group.appendChild(option);
			list.appendChild(group);
		}
	});
	assert.deepEqual(affected, []);
});

test('a sort that moves the options into another order changes the list, in the view and in the accessibility tree', async () => {
	const affected = await affectedBy(() => {
		const list = document.getElementById('list')!;
		for (const group of [...list.children]) for (const option of [...group.children].reverse()) group.appendChild(option);
	});
	assert.ok(affected.some((r) => /Pages|Components|Commands/.test(r)), JSON.stringify(affected));
});

test('a sort by CSS order that changes what is shown first changes the list, though no node moves', async () => {
	const affected = await affectedBy(() => {
		const options = [...document.querySelectorAll('[aria-label="Pages"] > [role="option"]')] as HTMLElement[];
		options.forEach((o, i) => (o.style.order = String(options.length - i)));
	});
	assert.ok(affected.some((r) => /Pages|Commands/.test(r)), JSON.stringify(affected));
});

test('a group taken out, reordered while out of the page and put back where it stood is a change', async () => {
	const affected = await affectedBy(async () => {
		const list = document.getElementById('list')!;
		const group = list.firstElementChild!;
		const next = group.nextSibling;
		group.remove();
		await new Promise((done) => setTimeout(done, 0));
		for (const option of [...group.children].reverse()) group.appendChild(option);
		list.insertBefore(group, next);
	});
	assert.ok(affected.some((r) => /Pages|Commands/.test(r)), JSON.stringify(affected));
});
