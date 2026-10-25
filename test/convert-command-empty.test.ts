import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { keepCommandEmpty } from '../src/convert/capture.ts';

// A command as cmdk renders it: [cmdk-empty] is in the list only while a search leaves no item.
const PAGE = `<!doctype html><body><div cmdk-root=""><input cmdk-input="" value=""><div cmdk-list=""><div cmdk-list-sizer=""><div cmdk-group=""><div cmdk-item="" data-value="Calendar">Calendar</div></div></div></div></div>
<script>
const input = document.querySelector('[cmdk-input]');
const sizer = document.querySelector('[cmdk-list-sizer]');
input.addEventListener('input', () => requestAnimationFrame(() => {
	const left = 'calendar'.includes(input.value.toLowerCase());
	const empty = sizer.querySelector('[cmdk-empty]');
	if (!left && !empty) sizer.insertAdjacentHTML('afterbegin', '<div cmdk-empty="" role="presentation">No results found.</div>');
	if (left && empty) empty.remove();
}));
</script></body>`;

test("a command's empty state, rendered only while a search leaves nothing, is kept hidden where cmdk renders it", async () => {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.setContent(PAGE);
		await keepCommandEmpty(page);
		assert.equal(
			await page.evaluate(() => document.querySelector('[cmdk-list-sizer]')!.innerHTML),
			'<div cmdk-empty="" role="presentation" hidden="">No results found.</div><div cmdk-group=""><div cmdk-item="" data-value="Calendar">Calendar</div></div>',
		);
		assert.equal(await page.locator('[cmdk-input]').inputValue(), '', 'the search is cleared again');
	} finally {
		await browser.close();
	}
});
