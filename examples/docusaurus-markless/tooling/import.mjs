// Imports the rendered docusaurus.io pages into TSRX: `node tooling/import.mjs http://127.0.0.1:4201`.
// The old site is built by Docusaurus from MDX through its theme's React components; this reads the page each
// route ends up as after hydration (light mode, desktop) and writes it as static Markless markup. The interactive
// parts (tabs, copy buttons, colour mode, sidebar, dropdowns) are wired by hand in components/ and lib/.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium } from '../../../node_modules/playwright/index.mjs';
import { toTsrx } from './serialize.js';

const origin = (process.argv[2] ?? 'http://127.0.0.1:4201').replace(/\/$/, '');
const app = join(import.meta.dirname, '..');
const ROUTES = [
	{ path: '/', name: 'home' },
	{ path: '/docs', name: 'intro' },
	{ path: '/docs/installation', name: 'installation' },
];

const browser = await chromium.launch();

// What only exists at a mobile width (the navbar's drawer), and what lazy images become once scrolled into view.
async function responsive(path) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await context.newPage();
	await page.goto(origin + path);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(500);
	const drawer = await page.evaluate(() => document.querySelector('nav.theme-layout-navbar > .theme-layout-navbar-sidebar')?.outerHTML ?? '');
	await context.close();
	const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const view = await desktop.newPage();
	await view.goto(origin + path);
	await view.waitForLoadState('networkidle');
	const lazy = [];
	const count = await view.evaluate(() => document.querySelectorAll('[style*="background-image:url(&quot;data:image"], [style*="background-image:url(\\"data:image"]').length);
	for (let index = 0; index < count; index++) {
		await view.evaluate((i) => document.querySelectorAll('.avatar__photo--xl')[i]?.scrollIntoView(), index);
		await view.waitForTimeout(800);
		lazy.push(await view.evaluate((i) => document.querySelectorAll('.avatar__photo--xl')[i]?.outerHTML ?? '', index));
	}
	await desktop.close();
	return { drawer, lazy };
}

async function capture(path, colorScheme) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme });
	const page = await context.newPage();
	await page.goto(origin + path);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(500);
	const data = await page.evaluate(`(${capturePage.toString()})(${toTsrx.toString()})`);
	await context.close();
	return data;
}

function capturePage(toTsrx) {
	const html = Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value]));
	const head = [...document.head.children]
		.filter((el) => {
			const tag = el.tagName.toLowerCase();
			if (tag === 'script') return el.getAttribute('type') === 'application/ld+json';
			if (tag === 'link' && el.getAttribute('rel') === 'stylesheet' && el.getAttribute('href')?.startsWith('/assets/css/')) return false;
			if (tag === 'link' && /preload|prefetch/.test(el.getAttribute('rel') ?? '') && /\.js$/.test(el.getAttribute('href') ?? '')) return false;
			if (tag === 'style') return false;
			return true;
		})
		.map((el) => ({ tag: el.tagName.toLowerCase(), attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])), text: el.textContent }));
	const root = document.getElementById('__docusaurus');
	const handlers = ' onIdle={() => siteBoot()}';
	const bodyScript = [...document.body.querySelectorAll(':scope > script:not([src])')].map((el) => el.textContent).join(';');
	const codeStyles = [...document.querySelectorAll('.theme-code-block, .theme-code-block [style]')].map((el) => el.getAttribute('style') ?? '');
	const urls = new Set();
	for (const el of document.querySelectorAll('[src], [href], [srcset], [poster]')) {
		for (const name of ['src', 'href', 'poster']) if (el.getAttribute(name)) urls.add(el.getAttribute(name));
		for (const part of (el.getAttribute('srcset') ?? '').split(',')) if (part.trim()) urls.add(part.trim().split(/\s+/)[0]);
	}
	for (const el of document.querySelectorAll('[style*="url("]')) for (const m of el.getAttribute('style').matchAll(/url\(["']?([^"')]+)/g)) urls.add(m[1]);
	const assets = [...urls].filter((url) => url.startsWith('/') && !url.startsWith('//') && !/\.js([?#].*)?$/.test(url) && /\.[a-z0-9]{2,5}([?#].*)?$/i.test(url));
	return { html, head, bodyScript, assets, body: toTsrx(root, { depth: 1, attrs: (el) => (el === root ? handlers : '') }), sprite: toTsrx(document.body.querySelector(':scope > svg'), { depth: 1 }), codeStyles };
}

function componentName(name) {
	return name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
}

const heads = {};
const themes = {};
const responsiveParts = {};
const assets = new Set(['/img/docusaurus.ico', '/img/docusaurus.png', '/manifest.json', '/opensearch.xml']);
let firstBodyScript = '';
for (const route of ROUTES) {
	const light = await capture(route.path, 'light');
	const dark = await capture(route.path, 'dark');
	if (light.codeStyles.length !== dark.codeStyles.length) throw new Error(`${route.path}: light and dark code blocks differ in shape`);
	heads[route.path] = { html: light.html, head: light.head };
	firstBodyScript ||= light.bodyScript;
	for (const asset of [...light.assets, ...dark.assets]) assets.add(asset);
	themes[route.path] = { light: light.codeStyles, dark: dark.codeStyles };
	responsiveParts[route.path] = await responsive(route.path);
	const file = join(app, 'components/generated', `${route.name}.tsrx`);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(
		file,
		`// Generated by tooling/import.mjs from ${route.path} on the old site; do not edit by hand.\nimport { siteBoot } from '../../lib/site.ts';\n\nexport default function ${componentName(route.name)}() @{\n${light.body}}\n`,
	);
	process.stdout.write(`${route.path} -> ${file}\n`);
}
// Files the imported pages load from the old site's own origin, copied from its build into public/.
const build = process.env.OLD_BUILD ?? join(app, '../../../mm-upstreams/docusaurus/website/build');
for (const asset of assets) {
	const path = decodeURIComponent(asset.split(/[?#]/)[0]);
	const from = join(build, path);
	const to = join(app, 'public', path);
	await mkdir(dirname(to), { recursive: true });
	await copyFile(from, to).catch((error) => process.stderr.write(`not copied ${asset}: ${error.message}\n`));
}
// A collapsed sidebar category has no items in the DOM until it is opened; open each one on the old site and keep
// the list it renders, keyed by its label path, for lib/site.ts to insert.
async function sidebarCategories(path) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await context.newPage();
	await page.goto(origin + path);
	await page.waitForLoadState('networkidle');
	const found = {};
	for (let round = 0; round < 200; round++) {
		const next = await page.evaluate(() => {
			const key = (item) => {
				const labels = [];
				for (let at = item; at; at = at.parentElement?.closest('li.theme-doc-sidebar-item-category') ?? null) labels.unshift(at.querySelector(':scope > .menu__list-item-collapsible > a')?.textContent ?? '');
				return labels.join(' / ');
			};
			const items = [...document.querySelectorAll('nav[aria-label="Docs sidebar"] li.theme-doc-sidebar-item-category')];
			const item = items.find((el) => !el.querySelector(':scope > ul.menu__list'));
			if (!item) return null;
			item.querySelector(':scope > .menu__list-item-collapsible > button.menu__caret')?.click();
			return key(item);
		});
		if (!next) break;
		await page.waitForTimeout(400);
		found[next] = await page.evaluate((wanted) => {
			const key = (item) => {
				const labels = [];
				for (let at = item; at; at = at.parentElement?.closest('li.theme-doc-sidebar-item-category') ?? null) labels.unshift(at.querySelector(':scope > .menu__list-item-collapsible > a')?.textContent ?? '');
				return labels.join(' / ');
			};
			const item = [...document.querySelectorAll('nav[aria-label="Docs sidebar"] li.theme-doc-sidebar-item-category')].find((el) => key(el) === wanted);
			const list = item?.querySelector(':scope > ul.menu__list');
			if (!list) return '';
			const copy = list.cloneNode(true);
			copy.removeAttribute('style');
			// Its own collapsed sub-categories stay empty here; they get their own entry.
			for (const nested of copy.querySelectorAll('li.theme-doc-sidebar-item-category')) {
				nested.classList.add('menu__list-item--collapsed');
				nested.querySelector(':scope > ul.menu__list')?.remove();
				const caret = nested.querySelector(':scope > .menu__list-item-collapsible > button.menu__caret');
				if (caret) {
					caret.setAttribute('aria-expanded', 'false');
					caret.setAttribute('aria-label', caret.getAttribute('aria-label').replace(/^Collapse/, 'Expand'));
				}
			}
			copy.setAttribute('style', 'display: none; overflow: hidden; height: 0px;');
			return copy.outerHTML;
		}, next);
	}
	await context.close();
	return found;
}
await writeFile(join(app, 'lib/sidebar-categories.json'), `${JSON.stringify({ ...(await sidebarCategories('/docs')), ...(await sidebarCategories('/docs/installation')) }, null, '\t')}\n`);
await writeFile(join(app, 'lib/heads.json'), `${JSON.stringify(heads, null, '\t')}\n`);

// The old site's first inline script and each route's <html> attributes, which document.tsrx writes.
const HTML_KEEP = ['dir', 'class', 'data-rh'];
const htmlAttrs = Object.fromEntries(Object.entries(heads).map(([path, { html }]) => [path, Object.fromEntries(Object.entries(html).filter(([name]) => HTML_KEEP.includes(name)).concat([['data-has-hydrated', 'false']]))]));
await writeFile(join(app, 'lib/document-init.json'), `${JSON.stringify({ script: firstBodyScript, html: htmlAttrs }, null, '\t')}\n`);

// Markless 0.4.0's document.tsrx cannot render child components or control flow, so every route shares one list of
// head elements and reads its attribute values from lib/head-slots.json; a route without an element leaves it empty.
const IDENTITY = ['name', 'property', 'rel', 'hreflang', 'type', 'title'];
const slotKey = ({ tag, attrs }) => `${tag}|${IDENTITY.map((name) => `${name}=${attrs[name] ?? ''}`).join('|')}`;
const slots = [];
const seenSlots = new Map();
for (const route of ROUTES) {
	const counts = new Map();
	for (const element of heads[route.path].head) {
		if (element.tag === 'title') continue;
		const base = slotKey(element);
		const n = counts.get(base) ?? 0;
		counts.set(base, n + 1);
		const key = `${base}#${n}`;
		if (!seenSlots.has(key)) {
			seenSlots.set(key, slots.length);
			slots.push({ tag: element.tag, attrs: new Set() });
		}
		for (const name of Object.keys(element.attrs)) slots[seenSlots.get(key)].attrs.add(name);
	}
}
const slotValues = {};
for (const route of ROUTES) {
	const counts = new Map();
	const values = slots.map(() => null);
	let title = '';
	let ld = '';
	for (const element of heads[route.path].head) {
		if (element.tag === 'title') {
			title = element.text;
			continue;
		}
		const base = slotKey(element);
		const n = counts.get(base) ?? 0;
		counts.set(base, n + 1);
		const index = seenSlots.get(`${base}#${n}`);
		values[index] = element.attrs;
		if (element.tag === 'script') ld = element.text;
	}
	slotValues[route.path] = { title, ld, slots: values };
}
await writeFile(join(app, 'lib/head-slots.json'), `${JSON.stringify(slotValues, null, '\t')}\n`);
const toProp = (name) => (/^[a-z][a-z0-9]*$/.test(name) ? name : null);
const headLines = slots
	.map((slot, index) => {
		const attrs = [...slot.attrs].map((name) => ` ${name}={s[${index}]?.[${JSON.stringify(name)}]}`).join('');
		if (slot.tag === 'script') return `\t\t\t<script${attrs}>{head.ld}</script>`;
		return `\t\t\t<${slot.tag}${attrs} />`;
	})
	.join('\n');
void toProp;
const sprite = (await capture('/docs/installation', 'light')).sprite;
await writeFile(
	join(app, 'document.tsrx'),
	`// Generated by tooling/import.mjs: each route's <head> as the old site served it, and its body prefix.
import type { Children } from '@markless/core';
import { Html } from '@markless/router';
import init from './lib/document-init.json';
import heads from './lib/head-slots.json';

type Slot = Readonly<Record<string, string>> | null;
const htmlAttributes = init.html as Record<string, Readonly<Record<string, string>>>;
const routes = heads as unknown as Record<string, { readonly title: string; readonly ld: string; readonly slots: readonly Slot[] }>;

export default function Document({ url, children }: { readonly url?: { readonly pathname: string }; readonly children?: Children }) @{
	const path = (url?.pathname ?? '/').replace(/\\/$/, '') || '/';
	const head = routes[path] ?? routes['/']!;
	const s = head.slots;
	const root = htmlAttributes[path] ?? htmlAttributes['/']!;

	<Html lang="en" dir={root['dir']} class={root['class']} data-rh={root['data-rh']} data-has-hydrated="false">
		<head>
			<script>{init.script}</script>
			<title>{head.title}</title>
${headLines}
			<link rel="stylesheet" href="/assets/css/styles.73b9aeb138.css" />
			<link rel="stylesheet" href="/mm-site.css" />
		</head>
		<body>
${sprite.replace(/^/gm, '\t\t')}
			{children}
		</body>
	</Html>
}
`,
);
await writeFile(join(app, 'lib/responsive.json'), `${JSON.stringify(responsiveParts)}\n`);
await writeFile(join(app, 'lib/code-themes.json'), `${JSON.stringify(themes)}\n`);
await browser.close();
