// The shadcn-ui port's /create designer (examples/shadcn-ui-markless/lib/site/create.tsrx), built alone in
// fixtures/shadcn-create with the repository's parts, driven control by control. The expected values are what
// ui.shadcn.com's /create at the pinned commit (mm-shadcn-ui-old) showed for the same steps.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { buildFixture, ROOT, startNitro, type App } from '../ports/servers.ts';

const FIXTURE = join(ROOT, 'fixtures/shadcn-create');
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

async function open(kind: keyof typeof BROWSERS, path = '/create', viewport = { width: 1440, height: 900 }, random?: number): Promise<Page> {
	const browser = (browsers[kind] ??= await BROWSERS[kind].launch());
	const context = await browser.newContext({ viewport });
	// What the designer draws while the page loads (?preset=random), fixed.
	if (random !== undefined) await context.addInitScript((r) => window.top === window && (Math.random = () => r), random);
	if (kind === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.origin });
	// WebKit grants no clipboard permissions to automation: the page's writes are kept for the reads.
	else await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void ((globalThis as { copied?: string }).copied = t), readText: async () => (globalThis as { copied?: string }).copied ?? '' } }));
	const page = await context.newPage();
	await page.goto(app.origin + path);
	await page.waitForLoadState('networkidle');
	for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise<void>((done) => (globalThis.requestIdleCallback ?? setTimeout)(() => done())));
	// The preview is ready once its own idle work ran: the design is on its document and its keys are listened for.
	await frame(page).locator('style#design-system-theme-vars').waitFor({ state: 'attached' });
	return page;
}

const search = (page: Page) => decodeURIComponent(new URL(page.url()).search);
const until = (page: Page, test: () => Promise<boolean>, what: string) =>
	(async () => {
		for (const deadline = Date.now() + 5000; Date.now() < deadline; await page.waitForTimeout(50)) if (await test()) return;
		assert.fail(`timed out waiting for ${what}`);
	})();
const trigger = (page: Page, label: string) => page.locator('[data-slot="designer"] [data-slot="card-content"] button[aria-haspopup="menu"]').filter({ hasText: new RegExp(`^${label}`) });
const triggers = (page: Page) => page.locator('[data-slot="designer"] [data-slot="card-content"] button[aria-haspopup="menu"]').evaluateAll((bs) => bs.filter((b) => b.getClientRects().length).map((b) => [...b.querySelectorAll('div')].filter((d) => !d.children.length && d.getClientRects().length).map((d) => d.textContent?.trim()).filter(Boolean).join(' ')));
// The menu color picker's label, which the menu accent picker's begins with too.
const MENU_COLOR = 'Menu(?!\\s*Accent)';
const item = (page: Page, text: string) => page.locator('[role="menu"]:visible [role="menuitemradio"]').filter({ hasText: new RegExp(`^${text}$`) });
const rows = (page: Page) => page.locator('[role="menu"]:visible [role="menuitemradio"]').evaluateAll((xs) => xs.filter((x) => x.getClientRects().length).map((x) => `${x.textContent?.trim()}${x.getAttribute('aria-checked') === 'true' ? '*' : ''}${x.hasAttribute('data-disabled') ? '(d)' : ''}`));
const menuOpen = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].some((m) => m.getClientRects().length > 0));
const frame = (page: Page) => page.frameLocator('[data-slot="designer"] iframe[title="Preview"]');
async function pick(page: Page, label: string, text: string): Promise<void> {
	await trigger(page, label).click();
	await item(page, text).click();
	await page.keyboard.press('Escape');
}
/** What the preview applied: the style and base color classes on its body, its fonts, and some of its theme's variables. */
const design = (page: Page) =>
	frame(page)
		.locator('html')
		.evaluate((html) => {
			const css = document.getElementById('design-system-theme-vars')?.textContent ?? '';
			const v = (name: string) => new RegExp(`--${name}: ([^;]*)`).exec(css)?.[1];
			const quote = (s: string) => s.replaceAll('"', "'");
			return {
				body: [...document.body.classList].filter((c) => /^(style|base-color)-/.test(c)).join(' '),
				fonts: `${quote(html.style.getPropertyValue('--font-sans'))} | ${quote(html.style.getPropertyValue('--font-heading'))}`,
				primary: v('primary'),
				radius: v('radius'),
				chart1: v('chart-1'),
				menu: [...document.querySelectorAll('.cn-menu-target')].map((m) => `${m.classList.contains('dark')},${m.classList.contains('cn-menu-translucent')}`).join(' '),
			};
		});
const seedRandom = (page: Page, sequence: readonly number[]) =>
	page.evaluate((seq) => {
		let i = 0;
		Math.random = () => seq[i++ % seq.length]!;
	}, sequence);
const menuItems = async (page: Page) => {
	await page.locator('#create-menu').click();
	const states = await page.locator('[role="menu"]:visible [role="menuitem"]').evaluateAll((items) => items.map((i) => `${i.firstChild?.textContent?.trim().split(/\s/)[0]}${i.getAttribute('aria-disabled') === 'true' ? ' (disabled)' : ''}`));
	await page.keyboard.press('Escape');
	return states;
};
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

for (const kind of Object.keys(BROWSERS) as (keyof typeof BROWSERS)[]) {
	describe(kind, () => {
		test('each pick re-encodes the design system into the preset code, relabels its trigger, keeps its menu open and reaches the preview', async () => {
			const page = await open(kind);
			assert.equal(search(page), '');
			await trigger(page, 'Theme').click();
			await item(page, 'Rose').click();
			await until(page, async () => search(page).startsWith('?preset='), 'the preset code');
			assert.equal(await menuOpen(page), true, "Base UI's radio items do not close their menu");
			assert.deepEqual(await page.locator('[role="menu"]:visible [role="menuitemradio"][aria-checked="true"]').allTextContents(), ['Rose']);
			await page.keyboard.press('Escape');
			for (const [label, text] of [['Style', 'Vega'], ['Base Color', 'Stone'], ['Theme', 'Blue'], ['Chart Color', 'Rose'], ['Heading', 'Lora'], ['Font', 'Geist'], ['Icon Library', 'Tabler Icons'], ['Radius', 'Large'], ['Menu Accent', 'Bold']] as const) await pick(page, label, text);
			await until(page, async () => search(page) === '?preset=b4GlTyYWVs', 'the code the old page wrote');
			assert.deepEqual(await triggers(page), ['Style Vega', 'Base Color Stone', 'Theme Blue', 'Chart Color Rose', 'Heading Lora Aa', 'Font Geist Aa', 'Icon Library Tabler Icons', 'Radius Large', 'Menu Default / Solid', 'Menu Accent Bold']);
			assert.equal(await page.locator('#create-style svg:not([hidden])').count(), 1, "the trigger shows the style's own icon");
			await until(page, async () => (await design(page)).body === 'style-vega base-color-stone', 'the preview design');
			assert.deepEqual({ ...(await design(page)), menu: undefined }, { body: 'style-vega base-color-stone', fonts: "var(--font-geist-sans), 'Geist Variable', sans-serif | var(--font-lora), 'Lora Variable', serif", primary: 'oklch(0.488 0.243 264.376)', radius: '0.875rem', chart1: 'oklch(0.81 0.117 11.638)', menu: undefined });
			await page.close();
		});

		test('a hovered or arrowed-to item previews without touching the URL; leaving the menu puts the preview back', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			await trigger(page, 'Font').click();
			const lora = item(page, 'Lora');
			await lora.scrollIntoViewIfNeeded();
			const box = (await lora.boundingBox())!;
			await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 3 });
			await until(page, async () => (await design(page)).fonts.startsWith('var(--font-lora)'), 'the hover preview');
			assert.equal(search(page), '?preset=b4GlTyYWVs');
			await page.mouse.move(1300, 800, { steps: 3 });
			await until(page, async () => (await design(page)).fonts.startsWith('var(--font-geist-sans)'), 'the committed font');
			await page.keyboard.press('Escape');
			await trigger(page, 'Theme').focus();
			await page.keyboard.press('Enter');
			await page.keyboard.press('ArrowDown');
			await until(page, async () => (await design(page)).primary !== 'oklch(0.488 0.243 264.376)', 'the arrowed-to theme previewed');
			assert.equal(search(page), '?preset=b4GlTyYWVs');
			await page.keyboard.press('Escape');
			await until(page, async () => (await design(page)).primary === 'oklch(0.488 0.243 264.376)', 'the preview back');
			await page.close();
		});

		test("the menus' rows follow the params: the base color's themes, a bold accent off on a translucent menu, Rhea's large radius, Lyra's locked radius", async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			await trigger(page, 'Theme').click();
			assert.equal((await rows(page))[0], 'Stone');
			await page.keyboard.press('Escape');
			await pick(page, 'Base Color', 'Mauve');
			await trigger(page, 'Theme').click();
			assert.deepEqual((await rows(page)).slice(0, 3), ['Mauve', 'Amber', 'Blue*'], "the base color's own theme leads the list");
			await page.keyboard.press('Escape');
			await pick(page, MENU_COLOR, 'Translucent');
			await trigger(page, 'Menu Accent').click();
			assert.deepEqual(await rows(page), ['Subtle*', 'Bold(d)']);
			await page.keyboard.press('Escape');
			await pick(page, MENU_COLOR, 'Inverted');
			await until(page, async () => (await design(page)).menu === 'true,true', 'the inverted translucent menu in the preview');
			await pick(page, 'Style', 'Rhea');
			await trigger(page, 'Radius').click();
			assert.deepEqual(await rows(page), ['Default', 'None', 'Small', 'Medium', 'Large*(d)']);
			await page.keyboard.press('Escape');
			await pick(page, 'Style', 'Lyra');
			assert.equal(await trigger(page, 'Radius').isDisabled(), true);
			assert.match((await triggers(page))[7]!, /^Radius None/);
			await until(page, async () => (await design(page)).radius === '0', "the preview's radius");
			await page.close();
		});

		test('undo and redo walk the preset history, from the keys and from the menu, whose items are disabled at either end', async () => {
			const page = await open(kind);
			assert.deepEqual(await menuItems(page), ['Navigate...', 'Open', 'Shuffle', 'Light/Dark', 'Undo (disabled)', 'Redo (disabled)', 'Reset']);
			await pick(page, 'Style', 'Vega');
			await pick(page, 'Radius', 'Small');
			await until(page, async () => search(page) === '?preset=bIkeyoK', 'two picks');
			await page.keyboard.press('ControlOrMeta+z');
			await until(page, async () => search(page) === '?preset=bIkeymG', 'the undo');
			await page.keyboard.press('ControlOrMeta+z');
			await until(page, async () => search(page) === '', 'the undo to the start');
			assert.deepEqual(await menuItems(page), ['Navigate...', 'Open', 'Shuffle', 'Light/Dark', 'Undo (disabled)', 'Redo', 'Reset']);
			await page.keyboard.press('ControlOrMeta+Shift+z');
			await until(page, async () => search(page) === '?preset=bIkeymG', 'the redo');
			await page.locator('#create-menu').click();
			await page.locator('[role="menu"]:visible [role="menuitem"]').filter({ hasText: /^Undo/ }).click();
			await until(page, async () => search(page) === '' && !(await menuOpen(page)), 'the undo from the menu, which closes it');
			await page.close();
		});

		test('Shuffle draws a curated preset; R draws twice, as two useRandom hooks listened for it; locked params keep their value', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			await seedRandom(page, [0.11, 0.52, 0.05, 0.9, 0.75, 0.06, 0.47]);
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Shuffle$/ }).click();
			await until(page, async () => search(page) === '?preset=bKsFBxgG', 'the shuffle');
			for (const label of ['Font', 'Radius']) {
				const picker = page.locator('[data-slot="designer"] .group\\/picker').filter({ has: page.locator('button[aria-haspopup="menu"]', { hasText: new RegExp(`^${label}`) }) });
				await picker.hover();
				await picker.locator('button[aria-label]').click();
			}
			assert.equal(await page.locator('[data-slot="designer"] .group\\/picker').filter({ has: page.locator('button[aria-haspopup="menu"]', { hasText: /^Radius/ }) }).locator('button[aria-label]').getAttribute('aria-label'), 'Unlock');
			await seedRandom(page, [0.33, 0.71, 0.2]);
			await page.keyboard.press('r');
			await until(page, async () => search(page) === '?preset=b6TqMNazvl', 'the R shuffle with font and radius locked');
			await page.close();
		});

		test('Shift+R resets at once; the menu opens the reset dialog, whose Escape gives focus back to the menu trigger', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			await page.keyboard.press('Shift+R');
			await until(page, async () => search(page) === '?preset=bIkeymG', 'the reset to the preset of the base and style');
			assert.equal(await page.locator('[role="alertdialog"]:visible').count(), 0);
			await pick(page, 'Font', 'Lora');
			await page.locator('#create-menu').click();
			await page.locator('[role="menu"]:visible [role="menuitem"]').filter({ hasText: /^Reset/ }).click();
			await until(page, async () => (await page.evaluate(() => document.activeElement?.textContent)) === 'Cancel', 'the dialog, Cancel focused');
			await page.keyboard.press('Escape');
			await until(page, async () => (await page.evaluate(() => document.activeElement?.id)) === 'create-menu', 'focus back on the menu trigger');
			assert.notEqual(search(page), '?preset=bIkeymG');
			await page.locator('#create-menu').click();
			await page.locator('[role="menu"]:visible [role="menuitem"]').filter({ hasText: /^Reset/ }).click();
			await page.locator('[role="alertdialog"]:visible button').filter({ hasText: /^Reset$/ }).click();
			await until(page, async () => search(page) === '?preset=bIkeymG', 'the confirmed reset');
			await page.close();
		});

		test('the preview pills switch the item, a new iframe loads it, and the browser goes back to the one before', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^02$/ }).click();
			await until(page, async () => search(page) === '?preset=b4GlTyYWVs&item=preview', 'the item');
			assert.equal(await page.locator('[data-slot="designer"] iframe').getAttribute('src'), '/preview/base/preview?preset=b4GlTyYWVs&item=preview&iconLibrary=tabler&style=vega&theme=blue&chartColor=rose&font=geist&fontHeading=lora&baseColor=stone&menuAccent=bold&radius=large');
			assert.deepEqual(await page.locator('[data-slot="designer"] button[data-active]').evaluateAll((bs) => bs.map((b) => `${b.textContent}:${b.getAttribute('data-active')}`)), ['01:false', '02:true']);
			await page.goBack();
			await until(page, async () => search(page) === '?preset=b4GlTyYWVs', 'the URL before');
			await until(page, async () => (await page.locator('[data-slot="designer"] iframe').getAttribute('src'))!.startsWith('/preview/base/preview-02?'), 'the iframe before');
			await page.close();
		});

		test('the preset button copies --preset CODE and says Copied for two seconds', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			const copy = page.locator('[data-slot="designer"] [data-slot="card-footer"] button').first();
			assert.equal(await copy.innerText(), '--preset b4GlTyYWVs');
			await copy.click();
			await until(page, async () => (await copy.innerText()) === 'Copied' && (await copy.getAttribute('title')) === 'Copied', 'Copied');
			assert.equal(await clipboard(page), '--preset b4GlTyYWVs');
			await until(page, async () => (await copy.innerText()) === '--preset b4GlTyYWVs', 'the label back');
			await page.close();
		});

		test('O opens Open Preset; it takes a code or a --preset flag, loads it, and is empty when opened again', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			await page.keyboard.press('o');
			const dialog = page.locator('[role="dialog"]:visible');
			await until(page, async () => (await page.evaluate(() => document.activeElement?.id)) === 'preset-code', 'the input focused');
			assert.equal(await dialog.locator('button[type=submit]').isDisabled(), true);
			await page.keyboard.type('nonsense');
			assert.equal(await page.locator('#preset-code').getAttribute('aria-invalid'), 'true');
			await page.locator('#preset-code').fill('--preset b1W4tDrk');
			assert.equal(await dialog.locator('button[type=submit]').isDisabled(), false);
			await page.keyboard.press('Enter');
			await until(page, async () => search(page) === '?preset=b1W4tDrk', 'the preset');
			await until(page, async () => (await page.locator('[role="dialog"]:visible').count()) === 0, 'Open Preset closed');
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Open Preset$/ }).click();
			assert.equal(await page.locator('#preset-code').inputValue(), '');
			await page.close();
		});

		test("Cmd+P opens the palette of the base's items; typing filters them, Enter previews the chosen one", async () => {
			const page = await open(kind, '/create?preset=b1W4tDrk');
			await page.keyboard.press('ControlOrMeta+p');
			const palette = page.locator('[role="dialog"]:visible');
			await until(page, async () => (await page.evaluate(() => document.activeElement?.getAttribute('placeholder'))) === 'Search', 'the search focused');
			assert.equal(await palette.locator('[cmdk-item]:visible').count(), 68);
			await page.keyboard.type('acc');
			const shown = await palette.locator('[cmdk-item]:visible').evaluateAll((xs) => xs.map((x) => [x.getBoundingClientRect().top, x.textContent?.trim()] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
			assert.deepEqual(shown, ['Accordion', 'Attachment', 'Aspect Ratio', 'Trace', 'Breadcrumb', 'Sidebar (Icon)', 'Message Scroller', 'Native Select']);
			await page.keyboard.press('Enter');
			await until(page, async () => search(page) === '?preset=b1W4tDrk&item=accordion-example', 'the item');
			assert.equal(await page.locator('[data-slot="designer"] iframe').getAttribute('src'), '/preview/base/accordion-example?preset=b1W4tDrk&item=accordion-example&style=luma&theme=blue&chartColor=stone&baseColor=stone');
			await until(page, async () => (await page.locator('[role="dialog"]:visible').count()) === 0, 'the palette closed');
			await page.close();
		});

		test('Get Code writes the init command from the template, base and options, the apply command per mode, and the theme', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Get Code$/ }).click();
			const dialog = page.locator('[role="dialog"]:visible');
			const code = () => dialog.locator('code:visible').innerText();
			assert.equal(await code(), 'shadcn init --preset b4GlTyYWVs --template next');
			await dialog.locator('label[for=template-vite]').click();
			await dialog.locator('label[for=monorepo]').click();
			await until(page, async () => (await code()) === 'shadcn init --preset b4GlTyYWVs --template vite --monorepo', 'vite in a monorepo');
			assert.equal(search(page), '?preset=b4GlTyYWVs&template=vite-monorepo');
			await dialog.locator('label[for=template-laravel]').click();
			await dialog.locator('label[for=base-radix]').click();
			await dialog.locator('#pointer-switch').click();
			await dialog.locator('label[for=rtl]').click();
			await until(page, async () => (await code()) === 'shadcn init --preset b4GlTyYWVs --base radix --template laravel --rtl --pointer', 'every option');
			assert.deepEqual(await dialog.locator('[role=switch]').evaluateAll((xs) => xs.map((x) => `${x.getAttribute('aria-checked')}${x.hasAttribute('data-disabled') ? '/disabled' : ''}`)), ['true', 'false/disabled', 'true'], "Laravel has no monorepo");
			await dialog.locator('[role=tab]:visible').filter({ hasText: /^bun$/ }).click();
			assert.equal(JSON.parse((await page.evaluate(() => localStorage.getItem('config'))) ?? '{}').packageManager, 'bun');
			await dialog.locator('button:visible').filter({ hasText: /^Copy Command$/ }).click();
			await until(page, async () => (await dialog.locator('button:visible').filter({ hasText: /^Copied$/ }).count()) === 1, 'Copied');
			assert.equal(await clipboard(page), 'shadcn init --preset b4GlTyYWVs --base radix --template laravel --rtl --pointer');
			await dialog.locator('[data-slot=toggle-group-item]').filter({ hasText: /^Existing Project$/ }).click();
			await dialog.locator('label[for=apply-theme]').click();
			await until(page, async () => (await code()) === 'shadcn apply --preset b4GlTyYWVs --only theme', 'the apply command');
			await dialog.locator('[data-slot=toggle-group-item]').filter({ hasText: /^Theme$/ }).click();
			const css = await dialog.locator('pre:visible').innerText();
			assert.ok(css.startsWith(':root {\n  --background: oklch(1 0 0);\n  --foreground: oklch(0.147 0.004 49.25);'));
			assert.equal(css.split('\n').length, 68);
			await dialog.locator('[data-slot=toggle-group-item]').filter({ hasText: /^Theme$/ }).click();
			assert.deepEqual(await dialog.locator('[data-slot=toggle-group-item][aria-pressed=true]').allTextContents(), ['New Project'], 'pressing the pressed item goes back to New Project');
			await page.keyboard.press('Escape');
			await until(page, async () => (await page.evaluate(() => document.activeElement?.textContent)) === 'Get Code', 'focus back on Get Code');
			await page.close();
		});

		test("the preview's keys reach the designer: D switches both themes, R shuffles, Cmd+Z undoes, Shift+R opens the reset dialog, O and Cmd+P open theirs", async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs');
			const body = frame(page).locator('body');
			await body.click({ position: { x: 5, y: 5 } });
			const themes = async () => [await page.evaluate(() => document.documentElement.classList.contains('dark')), await frame(page).locator('html').evaluate((h) => h.classList.contains('dark'))].join();
			await body.press('d');
			await until(page, async () => (await themes()) === 'true,true', 'both dark');
			await body.press('d');
			await until(page, async () => (await themes()) === 'false,false', 'both light');
			await seedRandom(page, [0.33, 0.71, 0.2]);
			await body.press('r');
			await until(page, async () => search(page) === '?preset=b6TqMNb5Wb', 'the shuffle');
			await until(page, async () => (await design(page)).body === 'style-mira base-color-olive', 'the shuffled design in the preview');
			await body.press('ControlOrMeta+z');
			await until(page, async () => search(page) === '?preset=b4GlTyYWVs', 'the undo');
			await body.press('Shift+R');
			await until(page, async () => (await page.locator('[role="alertdialog"]:visible').count()) === 1, 'the reset dialog');
			assert.equal(search(page), '?preset=b4GlTyYWVs');
			await page.keyboard.press('Escape');
			await body.click({ position: { x: 5, y: 5 } });
			await body.press('o');
			await until(page, async () => (await page.locator('[role="dialog"]:visible h2').count()) === 1, 'Open Preset');
			await page.keyboard.press('Escape');
			await body.click({ position: { x: 5, y: 5 } });
			await body.press('ControlOrMeta+p');
			await until(page, async () => (await page.locator('[role="dialog"]:visible input:visible').count()) === 1, 'the palette');
			await page.close();
		});

		test('on a phone the menus open above the card and close on a pick, Open Preset is a drawer, and Base is a picker', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs', { width: 390, height: 844 });
			assert.deepEqual((await triggers(page)).at(-1), 'Base Base UI');
			await trigger(page, 'Style').click();
			assert.equal(await page.locator('[role="menu"]:visible').getAttribute('data-side'), 'top');
			await item(page, 'Vega').click();
			await until(page, async () => !(await menuOpen(page)), 'the menu closed');
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Open$/ }).click();
			const drawer = page.locator('[role="dialog"]:visible');
			await until(page, async () => (await drawer.getAttribute('data-swipe-direction')) === 'down', 'the drawer');
			await drawer.locator('input').fill('b1W4tDrk');
			await drawer.locator('button[type=submit]').click();
			await until(page, async () => search(page) === '?preset=b1W4tDrk', 'the preset');
			await page.close();
		});

		test('an RTL link keeps rtl and its template; its controls work, and Get Code writes --rtl', async () => {
			const page = await open(kind, '/create?template=start&base=base&rtl=true');
			assert.equal(search(page), '?template=start&rtl=true', 'the defaults leave the URL as the first code is written');
			await seedRandom(page, [0.2]);
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Shuffle$/ }).click();
			await until(page, async () => search(page) === '?template=start&rtl=true&preset=b870VEw0in', 'the shuffle the old page made');
			await pick(page, 'Style', 'Nova');
			assert.match(search(page), /^\?template=start&rtl=true&preset=b\w+$/);
			await page.locator('#create-menu').click();
			assert.equal(await menuOpen(page), true);
			await page.keyboard.press('Escape');
			await page.locator('[data-slot="designer"] button').filter({ hasText: /^Get Code$/ }).click();
			const dialog = page.locator('[role="dialog"]:visible');
			assert.match(await dialog.locator('code:visible').innerText(), /^shadcn init --preset b\w+ --template start --rtl$/);
			assert.equal(await dialog.locator('#rtl-switch').getAttribute('aria-checked'), 'true');
			await page.close();
		});

		test('?preset=random is replaced by a random preset, alone in the URL', async () => {
			const page = await open(kind, '/create?preset=random&template=vite', undefined, 0.3);
			assert.equal(search(page), '?preset=b2c3AMVcun', "generateRandomPreset's pick for 0.3 in every field");
			await page.close();
		});

		test('a shared link opens with its params, and a link without a code keeps its own keys', async () => {
			const page = await open(kind, '/create?preset=b4GlTyYWVs&item=preview&template=vite');
			assert.deepEqual((await triggers(page)).slice(0, 3), ['Style Vega', 'Base Color Stone', 'Theme Blue']);
			assert.equal(await page.locator('[data-slot="designer"] iframe').getAttribute('src'), '/preview/base/preview?preset=b4GlTyYWVs&item=preview&iconLibrary=tabler&style=vega&theme=blue&chartColor=rose&font=geist&fontHeading=lora&baseColor=stone&menuAccent=bold&radius=large&template=vite');
			assert.equal((await design(page)).body, 'style-vega base-color-stone');
			await page.close();
			const legacy = await open(kind, '/create?style=vega&theme=blue');
			assert.equal(search(legacy), '');
			assert.deepEqual((await triggers(legacy)).slice(0, 3), ['Style Nova', 'Base Color Neutral', 'Theme Neutral']);
			await legacy.close();
		});
	});
}
