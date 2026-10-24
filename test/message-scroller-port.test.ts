// The MessageScroller port on a transcript of fixed-height rows: where it opens, the scroll buttons, an anchored turn held
// at the reading line, and the reader's row kept in place when earlier rows are prepended, as @shadcn/react does them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..');
let browser: Browser;
let source = '';

before(async () => {
	source = ts.transpileModule(await readFile(join(ROOT, 'parts/shadcn/message-scroller.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	browser = await chromium.launch();
});
after(() => browser.close());

const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `<div data-slot="message-scroller-item" data-message-id="m${from + i}" data-scroll-anchor="false" style="height:50px">row ${from + i}</div>`).join('');

function transcript(position: string, items: string): string {
	return `<div data-slot="message-scroller" ${position === 'start' ? '' : 'data-pending-scroll=""'} data-mm-default-scroll-position="${position}" style="position:relative;height:200px">
		<div data-slot="message-scroller-viewport" role="region" tabindex="0" ${position === 'start' ? '' : 'data-pending-scroll=""'} style="height:200px;overflow-y:auto">
			<div data-slot="message-scroller-content" role="log" aria-relevant="additions" style="display:flex;flex-direction:column">${items}<div aria-hidden="true" data-message-scroller-spacer="" hidden></div></div>
		</div>
		<button data-slot="message-scroller-button" data-direction="start" data-active="false" inert tabindex="-1" type="button">up</button>
		<button data-slot="message-scroller-button" data-direction="end" data-active="false" inert tabindex="-1" type="button">down</button>
	</div>`;
}

async function open(html: string): Promise<Page> {
	const page = await browser.newPage();
	await page.route('http://app.test/**', (route) => (new URL(route.request().url()).pathname === '/scroller.js' ? route.fulfill({ contentType: 'text/javascript', body: source }) : route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0">${html}</body>` })));
	await page.goto('http://app.test/');
	await page.evaluate(async () => {
		const part = (await import('/scroller.js' as string)) as typeof import('../parts/shadcn/message-scroller.ts');
		(globalThis as { part?: unknown }).part = part;
		document.addEventListener('click', (event) => part.click(event.target as Element));
		part.mount(document.querySelector('[data-slot="message-scroller"]')!);
	});
	await page.waitForTimeout(100);
	return page;
}

const read = (page: Page) =>
	page.evaluate(() => {
		const root = document.querySelector('[data-slot="message-scroller"]')!;
		const viewport = document.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')!;
		const [up, down] = [...document.querySelectorAll<HTMLButtonElement>('[data-slot="message-scroller-button"]')];
		return {
			top: Math.round(viewport.scrollTop),
			max: viewport.scrollHeight - viewport.clientHeight,
			pending: root.hasAttribute('data-pending-scroll') || viewport.hasAttribute('data-pending-scroll'),
			scrollable: root.getAttribute('data-scrollable'),
			up: `${up!.getAttribute('data-active')} inert=${up!.inert} tabindex=${up!.getAttribute('tabindex')}`,
			down: `${down!.getAttribute('data-active')} inert=${down!.inert} tabindex=${down!.getAttribute('tabindex')}`,
		};
	});

test('opens at the end, shows only the start button, and its end button scrolls back down', async () => {
	const page = await open(transcript('end', rows(10)));
	assert.deepEqual(await read(page), { top: 300, max: 300, pending: false, scrollable: 'start', up: 'true inert=false tabindex=null', down: 'false inert=true tabindex=-1' });
	await page.evaluate(() => {
		document.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')!.scrollTop = 0;
	});
	await page.waitForTimeout(100);
	assert.deepEqual(await read(page), { top: 0, max: 300, pending: false, scrollable: 'end', up: 'false inert=true tabindex=-1', down: 'true inert=false tabindex=null' });
	await page.click('[data-direction="end"]');
	assert.equal(await page.evaluate(() => document.querySelector('[data-slot="message-scroller"]')!.hasAttribute('data-autoscrolling')), true);
	await page.waitForTimeout(800);
	assert.deepEqual(await read(page), { top: 300, max: 300, pending: false, scrollable: 'start', up: 'true inert=false tabindex=null', down: 'false inert=true tabindex=-1' });
	assert.equal(await page.evaluate(() => document.querySelector('[data-slot="message-scroller"]')!.hasAttribute('data-autoscrolling')), false);
	await page.close();
});

test('opens at the start when the page asked for it', async () => {
	const page = await open(transcript('start', rows(10)));
	assert.deepEqual(await read(page), { top: 0, max: 300, pending: false, scrollable: 'end', up: 'false inert=true tabindex=-1', down: 'true inert=false tabindex=null' });
	await page.close();
});

test('a new anchored turn is held at the reading line, the previous row peeking 64 px above it', async () => {
	const page = await open(transcript('end', rows(10)));
	await page.evaluate(() => {
		const content = document.querySelector('[data-slot="message-scroller-content"]')!;
		const turn = document.createElement('div');
		turn.dataset.messageId = 'turn';
		turn.dataset.scrollAnchor = 'true';
		turn.style.height = '40px';
		content.insertBefore(turn, content.lastElementChild);
	});
	await page.waitForTimeout(100);
	const placed = await page.evaluate(() => {
		const viewport = document.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')!;
		const turn = document.querySelector('[data-message-id="turn"]')!;
		const spacer = document.querySelector<HTMLElement>('[data-message-scroller-spacer]')!;
		return { offset: Math.round(turn.getBoundingClientRect().top - viewport.getBoundingClientRect().top), spacer: spacer.hidden ? 0 : Math.round(spacer.getBoundingClientRect().height) };
	});
	assert.deepEqual(placed, { offset: 64, spacer: 96 });
	await page.close();
});

test('rows prepended above keep the row the reader was looking at in place', async () => {
	const page = await open(transcript('start', rows(10, 10)));
	await page.evaluate(() => {
		document.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')!.scrollTop = 120;
	});
	await page.waitForTimeout(100);
	const before = await page.evaluate(() => document.querySelector('[data-message-id="m12"]')!.getBoundingClientRect().top);
	await page.evaluate((html) => {
		const content = document.querySelector('[data-slot="message-scroller-content"]')!;
		content.insertAdjacentHTML('afterbegin', html);
	}, rows(5));
	await page.waitForTimeout(100);
	const afterTop = await page.evaluate(() => document.querySelector('[data-message-id="m12"]')!.getBoundingClientRect().top);
	assert.equal(Math.round(afterTop), Math.round(before));
	await page.close();
});
