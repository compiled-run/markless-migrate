// A control whose layer was recorded at the phone viewport (shadcn's mobile sidebar Sheet) beside a switch recorded at
// desktop: on a phone it opens the layer and leaves the hidden desktop sidebar and its cookie alone; at desktop it switches.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import ts from 'typescript';
import { registryModule } from '../src/convert/parts.ts';

const PARTS = join(import.meta.dirname, '..', 'parts');
const FILE = '/_converted/layers/phone/';
const FLOATING_STUB = `export const computePosition = async () => ({ x: 0, y: 0, placement: 'bottom', middlewareData: {} });
export const autoUpdate = () => () => {};
export const arrow = () => ({}), flip = () => ({}), hide = () => ({}), limitShift = () => ({}), offset = () => ({}), shift = () => ({}), size = () => ({});`;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

// The page as convert writes it: the switch's handler as SwitchPlan emits it for a control with a phone layer.
const SWITCH = `import { onPhone, writeCookies } from '/parts/switch.ts';
let sw0 = false;
const sidebar = document.querySelector('.desk');
document.querySelector('[data-slot="sidebar-trigger"]').addEventListener('click', () => { if (onPhone()) return; sw0 = !sw0; sidebar.setAttribute('data-state', sw0 ? 'collapsed' : 'expanded'); writeCookies(sw0 ? [{ name: 'sidebar_state', value: 'false', path: '/' }] : [{ name: 'sidebar_state', value: 'true', path: '/' }]); });`;
const desk = (trigger: string) => `<style>.desk { display: none } @media (min-width: 768px) { .desk { display: block } } [hidden] { display: none !important }</style><div class="desk" data-slot="sidebar" data-state="expanded">Nav</div><main>${trigger}</main>`;
const KEYED = '<button data-slot="sidebar-trigger" data-mm-key="p:1">Toggle Sidebar</button>';
const OVERLAY = '<div data-mm-layer="p:1" data-mm-viewport="mobile" hidden data-slot="sheet-overlay" data-state="closed"></div>';
const SHEET = '<div data-mm-layer="p:1" data-mm-viewport="mobile" hidden role="dialog" data-slot="sidebar" data-mobile="true" data-state="closed"><div data-slot="sidebar-content"><a href="#a">Inbox</a></div></div>';

// Each library's mobile sidebar as convert renders its recorded layer, and the registry its page would have.
const CASES: readonly { readonly name: string; readonly body: string; readonly ports: readonly string[] }[] = [
	{ name: 'a Radix Sheet', body: `${desk(KEYED)}${OVERLAY}${SHEET}`, ports: ['radix/dialog', 'base-ui/dialog'] },
	{
		name: 'a served Radix Sheet',
		body: `${desk(KEYED)}<link rel="preload" href="${FILE}" as="fetch" crossorigin="anonymous" fetchpriority="low" media="(max-width: 767px)" /><template data-mm-layer-src="${FILE}" data-mm-layer-keys="p:1" data-mm-viewport="mobile">${OVERLAY}<div data-mm-layer="p:1" data-mm-viewport="mobile" hidden role="dialog" data-slot="sidebar" data-mobile="true" data-state="closed" data-mm-layer-fill="${FILE}"></div></template>`,
		ports: ['radix/dialog'],
	},
	{
		name: 'a Base UI Sheet',
		body: `${desk(KEYED)}<div data-mm-layer="p:1" data-mm-viewport="mobile" hidden data-base-ui-portal data-slot="sheet-portal"><div role="presentation" data-base-ui-inert aria-hidden="true" style="position:fixed;inset:0"></div><div data-slot="sheet-overlay" style="position:fixed;inset:0"></div><div role="dialog" tabindex="-1" data-slot="sidebar" data-mobile="true"><div data-slot="sidebar-content"><a href="#a">Inbox</a></div></div></div>`,
		ports: ['base-ui/dialog'],
	},
	{
		name: 'a React Aria Sheet',
		// The Sidebar's props replace the ModalOverlay's sheet-overlay slot.
		body: `${desk('<button data-slot="sidebar-trigger" data-rac="" type="button" id="react-aria-t">Toggle Sidebar</button>')}<span data-focus-scope-start="true" inert="" hidden data-mm-layer="react-aria-t" data-mm-viewport="mobile"></span><div data-slot="sidebar" data-mobile="true" data-rac="" hidden data-mm-layer="react-aria-t" data-mm-viewport="mobile"><div data-slot="sheet-content" data-rac=""><div><section role="dialog" tabindex="-1" data-slot="sheet" data-rac=""><div data-slot="sidebar-content"><a href="#a">Inbox</a></div></section></div></div></div><span data-focus-scope-end="true" inert="" hidden data-mm-layer="react-aria-t" data-mm-viewport="mobile"></span>`,
		ports: ['react-aria/dialog'],
	},
];

let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser.close();
});

async function open(body: string, viewport: { width: number; height: number }, ports: readonly string[], script = SWITCH): Promise<{ page: Page; asked: string[] }> {
	const page = await browser.newPage({ viewport });
	const asked: string[] = [];
	page.on('request', (r) => asked.push(new URL(r.url()).pathname));
	await page.route('http://parts.test/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width"><script type="importmap">{"imports":{"@floating-ui/dom":"/floating.js"}}</script></head><body>${body}<script type="module">${script}\nimport { listen } from '/parts/registry.ts'; listen(); window.ready = true;</script></body></html>` });
		if (path === '/floating.js') return route.fulfill({ contentType: 'text/javascript', body: FLOATING_STUB });
		if (path === '/parts/choices.ts') return route.fulfill({ contentType: 'text/javascript', body: 'export const CHOICES = {};' });
		if (path === FILE) return route.fulfill({ contentType: 'text/html', body: '<div data-slot="sidebar-content"><a href="#a">Inbox</a></div>' });
		const source = path === '/parts/registry.ts' ? registryModule(ports, '.') : await readFile(join(PARTS, path.replace(/^\/parts\//, '')), 'utf8').catch(() => undefined);
		if (source === undefined) return route.fulfill({ status: 404, body: '' });
		return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText });
	});
	await page.goto('http://parts.test/');
	await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
	return { page, asked };
}

const state = (page: Page) =>
	page.evaluate(() => ({
		desktop: document.querySelector('.desk')!.getAttribute('data-state'),
		shown: Boolean(document.querySelector<HTMLElement>('[data-mobile] a')?.checkVisibility()),
		cookie: document.cookie,
	}));
const sheetShown = (page: Page, shown: boolean) => page.waitForFunction((want) => Boolean(document.querySelector<HTMLElement>('[data-mobile] a')?.checkVisibility()) === want, shown);

for (const { name, body, ports } of CASES) {
	test(`on a phone the trigger opens ${name} and never switches the hidden desktop sidebar or writes its cookie`, async () => {
		const { page } = await open(body, PHONE, ports);
		try {
			await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
			await sheetShown(page, true);
			assert.deepEqual(await state(page), { desktop: 'expanded', shown: true, cookie: '' });
			await page.keyboard.press('Escape');
			await sheetShown(page, false);
			assert.equal((await state(page)).desktop, 'expanded');
		} finally {
			await page.close();
		}
	});

	test(`at desktop the trigger switches the sidebar and writes its cookie, and ${name} stays closed`, async () => {
		const { page, asked } = await open(body, DESKTOP, ports);
		try {
			await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
			await page.waitForFunction(() => document.querySelector('.desk')!.getAttribute('data-state') === 'collapsed');
			await page.waitForTimeout(300);
			assert.deepEqual(await state(page), { desktop: 'collapsed', shown: false, cookie: 'sidebar_state=false' });
			assert.ok(!asked.includes(FILE), "a phone layer's file is not fetched at desktop");
		} finally {
			await page.close();
		}
	});
}

test("a layer's trigger part comes from its content's slot, and from its overlay only where a dialog's content slot was overridden", async () => {
	const layers: [string, string][] = [
		['sheet-trigger', '<div data-mm-layer="k" hidden data-slot="sheet-overlay"></div><div data-mm-layer="k" hidden role="dialog" data-slot="sheet-content"></div>'],
		['drawer-trigger', '<div data-mm-layer="k" hidden data-slot="sheet-overlay"></div><div data-mm-layer="k" hidden role="dialog" data-slot="drawer-content"></div>'],
		['sheet-trigger', '<div data-mm-layer="k" hidden data-slot="sheet-overlay"></div><div data-mm-layer="k" hidden role="dialog" data-slot="sidebar"><div data-slot="sidebar-content"></div></div>'],
		['sheet-trigger', '<div data-mm-layer="k" hidden data-base-ui-portal><div data-slot="sheet-overlay"></div><div role="dialog" data-slot="sidebar"><div data-slot="sidebar-content"></div></div></div>'],
		['popover-trigger', '<div data-mm-layer="k" hidden data-radix-popper-content-wrapper><div role="dialog" data-slot="popover-content"></div></div>'],
		['sidebar-trigger', '<div data-mm-layer="k" hidden><div data-slot="sidebar-content"></div></div>'],
	];
	const { page } = await open('', DESKTOP, ['radix/dialog'], '');
	try {
		for (const [want, html] of layers) {
			const got = await page.evaluate(async (html) => {
				document.body.querySelectorAll('[data-mm-layer], button').forEach((n) => n.remove());
				document.body.insertAdjacentHTML('afterbegin', `<button data-mm-key="k" data-slot="button"></button>${html}`);
				const { triggerSlot } = await import('/parts/reveal.ts' as string);
				return triggerSlot(document.querySelector('button')!);
			}, html);
			assert.equal(got, want, html);
		}
	} finally {
		await page.close();
	}
});
