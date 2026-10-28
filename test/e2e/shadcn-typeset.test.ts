// The shadcn-ui port's /typeset designer (examples/shadcn-ui-markless/lib/site/typeset.tsrx), built alone in
// fixtures/shadcn-typeset with the repository's parts, driven control by control. The expected values are what
// ui.shadcn.com's /typeset at the pinned commit (mm-shadcn-ui-old.vercel.app) showed for the same steps.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { buildFixture, ROOT, startNitro, type App } from '../ports/servers.ts';

const FIXTURE = join(ROOT, 'fixtures/shadcn-typeset');
const BROWSERS = { chromium, webkit } as const;
const browsers: Partial<Record<keyof typeof BROWSERS, Browser>> = {};
let app: App;

before(async () => {
	await buildFixture(FIXTURE, '.output/server/index.mjs', ['vp', 'build']);
	app = await startNitro(FIXTURE);
});
after(async () => {
	await Promise.all([...Object.values(browsers).map((b) => b?.close()), app?.stop()]);
});

async function open(kind: keyof typeof BROWSERS, path = '/typeset', viewport = { width: 1440, height: 900 }): Promise<Page> {
	const browser = (browsers[kind] ??= await BROWSERS[kind].launch());
	const context = await browser.newContext({ viewport });
	if (kind === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.origin });
	// WebKit grants no clipboard permissions to automation: the page's writes are kept for the reads.
	else await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void ((globalThis as { copied?: string }).copied = t), readText: async () => (globalThis as { copied?: string }).copied ?? '' } }));
	const page = await context.newPage();
	await page.goto(app.origin + path);
	// The designer starts once the page is idle (onIdle): the history is seeded from the URL and the preview gets its params.
	await page.waitForLoadState('networkidle');
	for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise<void>((done) => (globalThis.requestIdleCallback ?? setTimeout)(() => done())));
	return page;
}

const search = (page: Page) => new URL(page.url()).search;
const trigger = (page: Page, label: string) => page.locator('[data-slot="designer"] [data-slot="card"] button[aria-haspopup="menu"]').filter({ hasText: label });
const item = (page: Page, text: string) => page.locator('[role="menu"]:visible [role="menuitemradio"]').filter({ hasText: new RegExp(`^${text}$`) });
const menuOpen = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].some((m) => m.getClientRects().length > 0));
const frame = (page: Page) => page.frameLocator('iframe[title="typeset preview"]');
// What the preview put on its <html> for a variable (the value as written, the fixture has no font faces to resolve it); WebKit serializes its quotes as double.
const previewVar = (page: Page, name: string) => frame(page).locator('html').evaluate((html, n) => html.style.getPropertyValue(n).replaceAll('"', "'"), name);
const until = (page: Page, test: () => Promise<boolean>, what: string) =>
	(async () => {
		for (const deadline = Date.now() + 5000; Date.now() < deadline; await page.waitForTimeout(50)) if (await test()) return;
		assert.fail(`timed out waiting for ${what}`);
	})();
const lock = async (page: Page, label: string) => {
	const picker = page.locator('[data-slot="designer"] .group\\/picker').filter({ hasText: label });
	await picker.hover();
	await picker.locator('button[aria-label]').click();
};
const seedRandom = (page: Page, sequence: readonly number[]) =>
	page.evaluate((seq) => {
		let i = 0;
		Math.random = () => seq[i++ % seq.length]!;
	}, sequence);
const pre = (page: Page, scope = '[data-slot="designer"]') => page.evaluate((s) => [...document.querySelectorAll(`${s} pre`)].filter((e) => e.getClientRects().length).map((e) => e.textContent), scope);

for (const kind of Object.keys(BROWSERS) as (keyof typeof BROWSERS)[]) {
	describe(kind, () => {
		test('a font pick writes the URL, relabels its trigger, checks the item in the menu it leaves open, and reaches the preview', async () => {
			const page = await open(kind);
			await trigger(page, 'Body').click();
			await item(page, 'Inter').click();
			await until(page, async () => search(page) === '?body=inter', 'the URL');
			assert.equal(await menuOpen(page), true, "Base UI's radio items do not close their menu");
			assert.deepEqual(await page.locator('[role="menu"]:visible [role="menuitemradio"][aria-checked="true"]').allTextContents(), ['Inter']);
			await until(page, async () => (await previewVar(page, '--preview-font')) === "var(--font-inter), 'Inter Variable', sans-serif", 'the preview font');
			await page.keyboard.press('Escape');
			assert.match(await trigger(page, 'Body').innerText(), /Body\s+Inter/);
			await trigger(page, 'Heading').click();
			assert.deepEqual(await page.locator('[role="menu"]:visible [role="menuitemradio"]').first().textContent(), 'Inter', "the heading's inherit item names the body font");
			await page.close();
		});

		test('a picker item the pointer rests on, or the keys move to, previews without touching the URL; leaving the menu puts the preview back', async () => {
			const page = await open(kind, '/typeset?body=inter');
			await trigger(page, 'Heading').click();
			const lora = item(page, 'Lora');
			await lora.scrollIntoViewIfNeeded();
			const box = (await lora.boundingBox())!;
			await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 3 });
			await until(page, async () => (await previewVar(page, '--preview-font-heading')) === "var(--font-lora), 'Lora Variable', serif", 'the hover preview');
			assert.equal(search(page), '?body=inter');
			await page.mouse.move(1300, 700);
			await until(page, async () => (await previewVar(page, '--preview-font-heading')) === "var(--font-inter), 'Inter Variable', sans-serif", 'the committed heading');
			await page.keyboard.press('Escape');
			await trigger(page, 'Mono').focus();
			await page.keyboard.press('Enter');
			assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Geist');
			await page.keyboard.press('ArrowDown');
			assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Inter');
			await until(page, async () => (await previewVar(page, '--preview-font-mono')) === "var(--font-inter), 'Inter Variable', sans-serif", 'the focused item previewed');
			assert.equal(search(page), '?body=inter');
			await page.close();
		});

		test('size, measure, leading and flow picks write their params; picking a default takes it out of the URL', async () => {
			const page = await open(kind);
			for (const [label, text] of [['Size', '16px'], ['Measure', '60ch'], ['Leading', 'Tight (1.6)'], ['Flow', 'Airy (2em)']] as const) {
				await trigger(page, label).click();
				await item(page, text.replace(/[()]/g, '\\$&')).click();
				await page.keyboard.press('Escape');
				assert.match(await trigger(page, label).innerText(), new RegExp(text.replace(/[()]/g, '\\$&')));
			}
			await until(page, async () => search(page) === '?scale=16&measure=60&leading=1.6&flow=2em', 'every param in the URL');
			assert.equal(await previewVar(page, '--preview-size'), '16px');
			assert.equal(await previewVar(page, '--preview-measure'), '28em');
			await trigger(page, 'Size').click();
			await item(page, '15px').click();
			await until(page, async () => search(page) === '?measure=60&leading=1.6&flow=2em', 'the default left out');
			await page.close();
		});

		test('shuffle draws every unlocked param as useShuffle does; a locked one keeps its value', async () => {
			const page = await open(kind);
			await seedRandom(page, [0.11, 0.52, 0.05, 0.9, 0.75, 0.06, 0.47]);
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Shuffle$/ }).click();
			await until(page, async () => search(page) === '?body=noto-sans&heading=oxanium&mono=jetbrains-mono&scale=18&measure=90&leading=1.6', 'the shuffle');
			await page.keyboard.press('Shift+R');
			await until(page, async () => search(page) === '', 'the reset');
			await lock(page, 'Mono');
			await lock(page, 'Size');
			assert.equal(await page.locator('[data-slot="designer"] .group\\/picker').filter({ hasText: 'Size' }).locator('button[aria-label]').getAttribute('aria-label'), 'Unlock');
			await seedRandom(page, [0.11, 0.52, 0.05, 0.9, 0.75, 0.06, 0.47]);
			await page.keyboard.press('r');
			await until(page, async () => search(page) === '?body=noto-sans&heading=oxanium&measure=90&leading=1.6', 'the shuffle with mono and size locked');
			await page.close();
		});

		test('undo and redo walk the URL history, from the keys and from the menu, whose items are disabled at either end', async () => {
			const page = await open(kind);
			const menuItems = async () => {
				await page.locator('#typeset-menu').click();
				const states = await page.locator('[role="menu"]:visible [role="menuitem"]').evaluateAll((items) => items.map((i) => `${i.textContent?.trim().split(/\s/)[0]}${i.getAttribute('aria-disabled') === 'true' ? ' (disabled)' : ''}`));
				await page.keyboard.press('Escape');
				return states;
			};
			assert.deepEqual(await menuItems(), ['Shuffle', 'Light/Dark', 'Undo (disabled)', 'Redo (disabled)', 'Reset']);
			await trigger(page, 'Size').click();
			await item(page, '16px').click();
			await page.keyboard.press('Escape');
			await trigger(page, 'Heading').click();
			await item(page, 'Lora').click();
			await page.keyboard.press('Escape');
			await until(page, async () => search(page) === '?scale=16&heading=lora', 'two picks');
			await page.keyboard.press('ControlOrMeta+z');
			await until(page, async () => search(page) === '?scale=16', 'the undo');
			assert.deepEqual(await menuItems(), ['Shuffle', 'Light/Dark', 'Undo', 'Redo', 'Reset']);
			await page.keyboard.press('ControlOrMeta+Shift+z');
			await until(page, async () => search(page) === '?scale=16&heading=lora', 'the redo');
			await page.locator('#typeset-menu').click();
			await page.locator('[role="menu"]:visible [role="menuitem"]').filter({ hasText: /^Undo/ }).click();
			await until(page, async () => search(page) === '?scale=16', 'the undo from the menu');
			await page.locator('#typeset-menu').click();
			await page.locator('[role="menu"]:visible [role="menuitem"]').filter({ hasText: /^Reset/ }).click();
			await until(page, async () => search(page) === '', 'the reset from the menu');
			await page.close();
		});

		test('the framework select rewrites the font step: next/font for Next.js, Fontsource for the others, in the package manager kept in config', async () => {
			const page = await open(kind, '/typeset?heading=lora&scale=16');
			assert.equal((await pre(page))[1], '// app/layout.tsx\nimport { Geist, Lora, Geist_Mono } from "next/font/google"\n\nconst geist = Geist({\n  subsets: ["latin"],\n  variable: "--font-geist",\n})\n\nconst lora = Lora({\n  subsets: ["latin"],\n  variable: "--font-lora",\n})\n\nconst geistMono = Geist_Mono({\n  subsets: ["latin"],\n  variable: "--font-geist-mono",\n})\n\n<html className={`${geist.variable} ${lora.variable} ${geistMono.variable}`}>');
			await page.locator('#typeset-panel-framework').click();
			assert.deepEqual(await page.locator('[role="listbox"]:visible [role="option"]').allTextContents(), ['Next.js', 'Vite', 'TanStack Start', 'Laravel', 'React Router', 'Astro']);
			await page.locator('[role="option"]:visible').filter({ hasText: /^Vite$/ }).click();
			await until(page, async () => (await page.locator('#typeset-panel-framework').innerText()) === 'Vite', 'the select value');
			assert.deepEqual((await pre(page)).slice(1, 3), [
				'pnpm add @fontsource-variable/geist @fontsource-variable/lora @fontsource-variable/geist-mono',
				"/* globals.css */\n@import \"@fontsource-variable/geist\";\n@import \"@fontsource-variable/lora\";\n@import \"@fontsource-variable/geist-mono\";\n\n:root {\n  --font-geist: 'Geist Variable', sans-serif;\n  --font-lora: 'Lora Variable', serif;\n  --font-geist-mono: 'Geist Mono Variable', monospace;\n}",
			]);
			await page.locator('[data-slot="designer"] button:visible').filter({ hasText: /^npm$/ }).click();
			await until(page, async () => (await pre(page))[1]!.startsWith('npm install @fontsource-variable/geist'), 'the npm command');
			assert.equal(JSON.parse((await page.evaluate(() => localStorage.getItem('config'))) ?? '{}').packageManager, 'npm');
			await page.close();
		});

		test('the Prompt tab writes the install prompt with the picks and the framework baked in, and copies it', async () => {
			const page = await open(kind, '/typeset?body=inter');
			await page.locator('[data-slot="designer"] [role="tab"]').filter({ hasText: 'Prompt' }).click();
			const prompt = (await pre(page))[0]!;
			assert.ok(prompt.startsWith('Install shadcn/typeset in this project.'));
			assert.ok(prompt.includes('3. Load the fonts in the root layout and update the HTML element:\n\n// app/layout.tsx\nimport { Inter, Geist_Mono } from "next/font/google"'));
			assert.ok(prompt.includes('.typeset-docs {\n  --typeset-font-body: var(--font-inter);\n  --typeset-font-heading: var(--font-inter);'));
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Copy Prompt$/ }).click();
			await until(page, async () => (await page.evaluate(() => navigator.clipboard.readText())) === prompt, 'the copied prompt');
			assert.equal(await page.locator('[data-slot="designer"] button').filter({ hasText: /^Copy Prompt$/ }).locator('svg:visible').getAttribute('class'), 'lucide lucide-check');
			await page.locator('[data-slot="designer"] [role="tab"]').filter({ hasText: 'Docs' }).click();
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Copy typeset.css$/ }).click();
			await until(page, async () => (await page.evaluate(() => navigator.clipboard.readText())).startsWith('/*\n * shadcn/typeset'), 'the copied stylesheet');
			await page.close();
		});

		test('a specimen pill reloads the preview with its page and the params, and Open in New Tab follows', async () => {
			const page = await open(kind, '/typeset?body=inter');
			await page.locator('#typeset-item-chat').click();
			await until(page, async () => search(page) === '?body=inter&item=chat', 'the URL');
			assert.equal(await page.locator('iframe[title="typeset preview"]').getAttribute('src'), '/preview/typeset/chat?body=inter&item=chat');
			assert.equal(await page.locator('[data-slot="designer"] a[target="_blank"]').getAttribute('href'), '/preview/typeset/chat?body=inter&item=chat');
			assert.equal(await page.locator('#typeset-item-chat').getAttribute('data-active'), 'true');
			await until(page, async () => (await frame(page).locator('h1').textContent().catch(() => '')) === 'How do I stream a reply?', 'the chat specimen');
			await page.close();
		});

		test('a shared link opens with its params: the triggers, the preview and its frame all show them', async () => {
			const page = await open(kind, '/typeset?body=lora&scale=18&measure=60');
			assert.deepEqual(await page.locator('[data-slot="designer"] [data-slot="card"] button[aria-haspopup="menu"]').evaluateAll((b) => b.map((x) => (x as HTMLElement).innerText.replace(/\s+/g, ' ').trim())), ['Menu', 'Measure 60ch', 'Heading Lora Aa', 'Body Lora Aa', 'Mono Geist Mono Aa', 'Size 18px', 'Leading Regular (1.75)', 'Flow Regular (1.25em)']);
			assert.equal(await page.locator('iframe[title="typeset preview"]').getAttribute('src'), '/preview/typeset/docs?body=lora&scale=18&measure=60');
			await until(page, async () => (await previewVar(page, '--preview-size')) === '18px', 'the preview size');
			assert.ok((await frame(page).locator('html').getAttribute('class'))?.includes('lora_89cfb44c-module__fAxLeq__variable'), "the preview layout's font variables on <html>");
			await page.close();
		});

		test("the preview's own keys reach the designer: R shuffles, Shift+R resets, D switches the theme of both", async () => {
			const page = await open(kind, '/typeset?body=lora');
			await frame(page).locator('body').click({ position: { x: 5, y: 5 } });
			await frame(page).locator('body').press('Shift+R');
			await until(page, async () => search(page) === '', 'the reset from the preview');
			const themes = async () => [await page.evaluate(() => document.documentElement.classList.contains('dark')), await frame(page).locator('html').evaluate((html) => html.classList.contains('dark'))];
			await frame(page).locator('body').press('d');
			await until(page, async () => (await themes()).join() === 'true,true', 'the dark theme in the designer and the preview');
			await page.locator('[data-slot="designer"] a').filter({ hasText: 'Read the docs' }).focus();
			await page.keyboard.press('d');
			await until(page, async () => (await themes()).join() === 'false,false', 'the light theme in both, switched from the designer');
			await frame(page).locator('body').press('r');
			await until(page, async () => search(page) !== '', 'the shuffle from the preview');
			await page.close();
		});

		test('below xl, Get Code opens the drawer with its own docs; its framework select is part of it and leaves it open', async () => {
			const page = await open(kind, '/typeset?body=inter', { width: 1100, height: 800 });
			await page.locator('#typeset-get-code').click();
			const drawer = page.locator('[role="dialog"]:visible');
			await until(page, async () => (await drawer.count()) === 1, 'the drawer');
			assert.equal(await drawer.getAttribute('data-swipe-direction'), 'right');
			await drawer.locator('[data-slot="select-trigger"]').click();
			await page.locator('[role="option"]:visible').filter({ hasText: /^Astro$/ }).click();
			await until(page, async () => (await pre(page, '[role="dialog"]'))[1] === 'pnpm add @fontsource-variable/inter @fontsource-variable/geist-mono', "the drawer's Fontsource step");
			assert.equal(await drawer.count(), 1, 'the drawer stays open');
			assert.equal(await page.locator('#typeset-panel-framework').innerText(), 'Next.js', "the panel's select keeps its own value");
			await drawer.locator('button').filter({ hasText: /^Done$/ }).focus();
			await page.keyboard.press('Enter');
			await until(page, async () => (await page.locator('[role="dialog"]:visible').count()) === 0, 'the drawer closed');
			await page.close();
		});
	});
}
