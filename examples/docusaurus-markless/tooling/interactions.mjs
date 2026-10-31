// Runs each interactive element of the old site and the port side by side and compares what happens: the CSS
// transitions and animations each step starts (property, duration, easing), and the state the step leaves behind.
// `node tooling/interactions.mjs [old-origin] [new-origin] [scenario-name...]`
import { chromium } from '../../../node_modules/playwright/index.mjs';

const [oldOrigin = 'http://127.0.0.1:4201', newOrigin = 'http://127.0.0.1:4312', ...wanted] = process.argv.slice(2);
const desktop = { width: 1280, height: 800 };
const mobile = { width: 400, height: 800 };

const sidebar = 'nav[aria-label="Docs sidebar"]';
const scenarios = [
	{ name: 'sidebar category expand + collapse', path: '/docs/installation', steps: [{ click: `${sidebar} li.theme-doc-sidebar-item-category.menu__list-item--collapsed >> nth=0 >> .menu__list-item-collapsible > a` }, { click: `${sidebar} li.theme-doc-sidebar-item-category-level-1:not(.menu__list-item--collapsed) >> nth=0 >> .menu__list-item-collapsible > a` }], watch: [sidebar] },
	{ name: 'sidebar category caret', path: '/docs/category/guides', steps: [{ click: `${sidebar} button.menu__caret >> nth=0` }, { click: `${sidebar} button.menu__caret >> nth=0` }], watch: [sidebar] },
	{ name: 'sidebar auto-collapse siblings', path: '/docs/installation', steps: [{ click: `${sidebar} li.theme-doc-sidebar-item-category.menu__list-item--collapsed >> nth=1 >> .menu__list-item-collapsible > a` }, { click: `${sidebar} li.theme-doc-sidebar-item-category.menu__list-item--collapsed >> nth=1 >> .menu__list-item-collapsible > a` }], watch: [sidebar] },
	{ name: 'sidebar hide + show', path: '/docs/installation', steps: [{ click: 'button[title="Collapse sidebar"]' }, { click: 'div[title="Expand sidebar"]' }], watch: ['aside.theme-doc-sidebar-container', 'main'] },
	{ name: 'details open + close', path: '/docs/installation', steps: [{ click: 'details summary >> nth=0' }, { click: 'details summary >> nth=0' }], watch: ['details >> nth=0'] },
	{ name: 'details in a blog post', path: '/blog/releases/3.0', steps: [{ click: 'details summary >> nth=0' }, { click: 'details summary >> nth=1' }, { click: 'details summary >> nth=0' }], watch: ['details >> nth=0', 'details >> nth=1'] },
	{ name: 'tabs click + group sync + storage', path: '/docs/installation', steps: [{ click: '.theme-tabs-container [role=tab]:not([aria-selected=true]) >> nth=0' }, { reload: true }], watch: ['.theme-tabs-container >> nth=0', '.theme-tabs-container >> nth=1'], storage: true },
	{ name: 'tabs keyboard', path: '/docs/markdown-features/tabs', steps: [{ focus: '.theme-tabs-container [role=tab][aria-selected=true] >> nth=0' }, { key: 'ArrowRight' }, { key: 'ArrowLeft' }], watch: ['.theme-tabs-container >> nth=0'] },
	{ name: 'tabs queryString', path: '/docs/markdown-features/tabs?current-os=ios', steps: [{ wait: 50 }], watch: ['.theme-tabs-container >> nth=-1'], url: true },
	{ name: 'code block copy', path: '/docs/installation', steps: [{ hover: '.theme-code-block >> nth=0' }, { click: '.theme-code-block >> nth=0 >> button[aria-label="Copy code to clipboard"]' }, { wait: 1200 }], watch: ['.theme-code-block >> nth=0'] },
	{ name: 'code block word wrap', path: '/docs/api/docusaurus-config', viewport: mobile, steps: [{ click: '.theme-code-block button[title="Toggle word wrap"] >> nth=0' }, { click: '.theme-code-block button[title="Toggle word wrap"] >> nth=0' }], watch: ['.theme-code-block:has(button[title="Toggle word wrap"]) >> nth=0'] },
	{ name: 'color mode toggle', path: '/docs/installation', steps: [{ click: '.navbar__inner button[title*="mode"]' }, { click: '.navbar__inner button[title*="mode"]' }, { click: '.navbar__inner button[title*="mode"]' }], watch: ['html', '.navbar__inner [class*=colorModeToggle]', '.theme-code-block >> nth=0'], storage: true },
	{ name: 'navbar dropdown hover + click', path: '/docs/installation', steps: [{ hover: '.navbar__items--right .dropdown >> nth=0 >> .navbar__link' }, { hover: 'main h1' }, { click: '.navbar__items--right .dropdown >> nth=0 >> .navbar__link' }, { click: 'main h1' }], watch: ['.navbar__items--right .dropdown >> nth=0'] },
	{ name: 'locale dropdown', path: '/docs/installation', steps: [{ hover: '.navbar__items--right .dropdown >> nth=1 >> .navbar__link' }], watch: ['.navbar__items--right .dropdown >> nth=1'] },
	{ name: 'search modal', path: '/docs/installation', steps: [{ click: 'button.DocSearch-Button' }, { type: ['input.DocSearch-Input', 'sidebar'], wait: 2500 }, { key: 'Escape' }], watch: ['.DocSearch-Modal', '.DocSearch-Footer', '.DocSearch-HitsFooter'] },
	{ name: 'search page', path: '/search?q=sidebar', steps: [{ wait: 2500 }], watch: ['main h1', 'main .container'] },
	{ name: 'TOC highlight on scroll', path: '/docs/installation', steps: [{ scroll: 1500 }, { scroll: 3000 }], watch: ['.table-of-contents'] },
	{ name: 'back to top', path: '/docs/api/docusaurus-config', steps: [{ scroll: 3000 }, { scroll: 2700 }, { click: '.theme-back-to-top-button', wait: 1500 }], watch: ['.theme-back-to-top-button'], scrollY: true },
	{ name: 'navbar hide on scroll', path: '/docs/api/docusaurus-config', steps: [{ scroll: 2000 }, { scroll: 1800 }], watch: ['nav.navbar'] },
	{ name: 'announcement bar close', path: '/docs/installation', steps: [{ click: '.theme-announcement-bar button[aria-label="Close"]' }, { reload: true }], watch: ['.theme-announcement-bar', 'html'], storage: true },
	{ name: 'pagination next', path: '/docs/installation', steps: [{ click: '.pagination-nav__link--next' }], watch: ['main h1'], url: true },
	{ name: 'blog sidebar link', path: '/blog', steps: [{ click: 'nav[aria-label="Blog recent posts navigation"] a >> nth=1' }], watch: ['main h1'], url: true },
	{ name: 'mobile drawer open + secondary + close', path: '/docs/installation', viewport: mobile, steps: [{ click: 'button.navbar__toggle' }, { click: '.navbar-sidebar__back' }, { click: '.navbar-sidebar__item >> nth=0 >> a.menu__link >> nth=0', noNavigate: true }, { click: 'button.navbar-sidebar__close' }], watch: ['nav.navbar', '.navbar-sidebar'] },
	{ name: 'mobile drawer versions dropdown', path: '/docs/installation', viewport: mobile, steps: [{ click: 'button.navbar__toggle' }, { click: '.navbar-sidebar__back' }, { click: '.navbar-sidebar__item >> nth=0 >> button.menu__caret >> nth=0' }, { click: '.navbar-sidebar__item >> nth=0 >> button.menu__caret >> nth=0' }], watch: ['.navbar-sidebar__item >> nth=0'] },
	{ name: 'mobile drawer sidebar category', path: '/docs/installation', viewport: mobile, steps: [{ click: 'button.navbar__toggle' }, { click: '.navbar-sidebar__item >> nth=1 >> li.menu__list-item--collapsed >> nth=0 >> .menu__list-item-collapsible > a' }, { click: 'button.navbar__toggle' }], watch: ['.navbar-sidebar__item >> nth=1', 'main h1'], url: true },
	{ name: 'mobile drawer doc link', path: '/docs/installation', viewport: mobile, steps: [{ click: 'button.navbar__toggle' }, { click: '.navbar-sidebar__item >> nth=1 >> a.menu__link[href="/docs/configuration"]' }, { click: 'button.navbar__toggle' }], watch: ['.navbar-sidebar', 'main h1'], url: true },
	{ name: 'sidebar link keeps state', path: '/docs/installation', steps: [{ click: `${sidebar} li.theme-doc-sidebar-item-category.menu__list-item--collapsed >> nth=1 >> button.menu__caret` }, { scroll: 0 }, { click: `${sidebar} a.menu__link[href="/docs/configuration"]` }], watch: [sidebar], url: true },
	{ name: 'version dropdown preference', path: '/docs/installation', steps: [{ hover: '.navbar__items--right .dropdown >> nth=0 >> .navbar__link' }, { click: '.navbar__items--right .dropdown >> nth=0 >> .dropdown__menu a.dropdown__link >> nth=1' }, { click: 'a.navbar__link[href="/blog"], .navbar__items a[href="/blog"] >> nth=0' }], watch: ['.navbar__inner'], url: true, storage: true },
	{ name: 'live code editor', path: '/docs/markdown-features/code-blocks', steps: [{ click: '.playgroundEditor_uqZ4 pre >> nth=1' }, { key: 'End' }, { type: ['.playgroundEditor_uqZ4 pre >> nth=1', ' '], wait: 500 }, { click: 'button[aria-label="Reset code to original"] >> nth=1' }], watch: ['.playgroundContainer_TDLX >> nth=1'] },
	{ name: 'mobile backdrop close', path: '/docs/installation', viewport: mobile, steps: [{ click: 'button.navbar__toggle' }, { mouse: [390, 400] }], watch: ['nav.navbar'] },
	{ name: 'mobile TOC collapsible', path: '/docs/installation', viewport: mobile, steps: [{ click: 'button:has-text("On this page")' }, { click: 'button:has-text("On this page")' }], watch: ['.theme-doc-toc-mobile'] },
	{ name: 'blog mobile drawer', path: '/blog', viewport: mobile, steps: [{ click: 'button.navbar__toggle' }], watch: ['.navbar-sidebar'] },
	{ name: 'hash link', path: '/docs/installation', steps: [{ click: 'main h2.anchor >> nth=1 >> a.hash-link' }], watch: ['nav.navbar'], url: true, scrollY: true },
	{ name: 'skip to content', path: '/docs/installation', steps: [{ key: 'Tab' }, { key: 'Enter' }], watch: ['body'], focus: true },
	{ name: 'image zoom', path: '/docs/advanced/architecture', steps: [{ click: '[data-rmiz-btn-zoom] >> nth=0' }, { key: 'Escape' }], watch: ['[data-rmiz] >> nth=0', 'dialog'] },
	{ name: 'ideal image lazy load', path: '/docs/api/plugins/@docusaurus/plugin-ideal-image', steps: [{ scroll: 1200, wait: 1500 }], watch: ['main article'] },
	{ name: 'showcase filter', path: '/showcase', steps: [{ click: 'label:has-text("Favorite") >> nth=0' }, { click: 'button:has-text("OR"), button:has-text("AND") >> nth=0' }], watch: ['main section >> nth=1'], url: true },
	{ name: 'color generator', path: '/docs/styling-layout', steps: [{ fill: ['input[type=color] + input, main input[type=text] >> nth=0', '#ff0000'] }], watch: ['main table >> nth=0'] },
	{ name: 'versions page', path: '/versions', steps: [{ wait: 1500 }], watch: ['main'] },
	{ name: 'changelog expand', path: '/changelog', steps: [{ click: 'main button[aria-label="expand"] >> nth=0' }], watch: ['main article >> nth=0'] },
];

const browser = await chromium.launch();

async function recorder(page, watch) {
	await page.evaluate((selectors) => {
		const label = (el) => {
			if (!el || !el.tagName) return String(el);
			const cls = [...el.classList].filter((c) => !/^(DocSearch-|menu__list-item--collapsed)/.test(c)).slice(0, 3).join('.');
			return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
		};
		const seen = new Map();
		const start = performance.now();
		window.__mmRec = { seen, done: false };
		const tick = () => {
			for (const a of document.getAnimations()) {
				const effect = a.effect;
				const target = effect?.target;
				if (!target) continue;
				const kind = a.transitionProperty ? `transition ${a.transitionProperty}` : `animation ${a.animationName ?? ''}`;
				const key = `${label(target)}${effect.pseudoElement ?? ''} ${kind}`;
				if (seen.has(key)) continue;
				const timing = effect.getTiming();
				seen.set(key, `${Math.round(Number(timing.duration))}ms ${timing.easing}${timing.delay ? ` delay ${timing.delay}` : ''}`);
			}
			if (performance.now() - start < 900) requestAnimationFrame(tick);
			else window.__mmRec.done = true;
		};
		requestAnimationFrame(tick);
		void selectors;
	}, watch);
}

async function snapshot(page, scenario) {
	const state = {};
	for (const selector of scenario.watch) {
		const loc = page.locator(selector).first();
		if (selector === 'html') {
			// The old framework's runtime markers are left out of the port on purpose.
			state.html = await page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].filter((a) => a.name !== 'data-has-hydrated' && a.name !== 'data-rh').map((a) => [a.name, a.value]).sort()));
			continue;
		}
		state[selector] = (await loc.count())
			? await loc.evaluate((el) => {
					const clone = el.cloneNode(true);
					const comments = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
					const drop = [];
					while (comments.nextNode()) drop.push(comments.currentNode);
					for (const node of drop) node.remove();
					for (const node of [clone, ...clone.querySelectorAll('*')]) {
						const attrs = [...node.attributes].map((a) => [a.name, a.value]).sort((x, y) => x[0].localeCompare(y[0]));
						for (const [name] of attrs) node.removeAttribute(name);
						for (const [name, value] of attrs) node.setAttribute(name, name === 'class' ? value.split(/\s+/).filter(Boolean).sort().join(' ') : value);
						const style = node.getAttribute?.('style');
						if (style) node.setAttribute('style', style.replace(/will-change: height;\s*/g, '').replace(/transition: [^;]+;\s*/g, '').trim());
						if (node.getAttribute?.('style') === '') node.removeAttribute('style');
					}
					const r = el.getBoundingClientRect();
					const cs = getComputedStyle(el);
					return { box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], visibility: cs.visibility, opacity: cs.opacity, transform: cs.transform, html: clone.outerHTML.replace(/\s+/g, ' ').slice(0, 20000) };
				})
			: null;
	}
	if (scenario.url) state.url = new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash;
	if (scenario.scrollY) state.scrollY = await page.evaluate(() => Math.round(window.scrollY));
	if (scenario.focus) state.focus = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200));
	if (scenario.storage) state.storage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().filter((k) => !/^(docusaurus\.announcement\.id|__)/.test(k)).map((k) => [k, localStorage.getItem(k)])));
	return state;
}

async function run(origin, scenario) {
	const context = await browser.newContext({ viewport: scenario.viewport ?? desktop, colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	const out = { steps: [], errors };
	try {
		await page.goto(origin + scenario.path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
		await page.waitForTimeout(500);
		await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
		out.initial = await snapshot(page, scenario);
		for (const step of scenario.steps) {
			await recorder(page, scenario.watch);
			let error;
			try {
				if (step.click) await page.locator(step.click).first().click({ timeout: 3000, noWaitAfter: true });
				if (step.hover) await page.locator(step.hover).first().hover({ timeout: 3000 });
				if (step.focus) await page.locator(step.focus).first().focus({ timeout: 3000 });
				if (step.key) await page.keyboard.press(step.key);
				if (step.mouse) await page.mouse.click(...step.mouse);
				if (step.type) await page.locator(step.type[0]).first().pressSequentially(step.type[1], { delay: 40, timeout: 5000 });
				if (step.fill) await page.locator(step.fill[0]).first().fill(step.fill[1], { timeout: 3000 });
				if (step.scroll !== undefined) await page.evaluate((y) => window.scrollTo(0, y), step.scroll);
				if (step.reload) await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
			} catch (e) {
				error = e.message.split('\n')[0];
			}
			await page.waitForTimeout(1000 + (step.wait ?? 0));
			const animations = await page.evaluate(() => (window.__mmRec ? Object.fromEntries(window.__mmRec.seen) : {})).catch(() => ({}));
			out.steps.push({ step, error, animations, state: await snapshot(page, scenario) });
		}
	} finally {
		await context.close();
	}
	return out;
}

const pad = (s) => `      ${s}`;
let same = 0;
let differ = 0;
for (const scenario of scenarios.filter((s) => !wanted.length || wanted.some((w) => s.name.includes(w)))) {
	const [a, b] = await Promise.all([run(oldOrigin, scenario), run(newOrigin, scenario)]);
	const lines = [];
	const cmp = (what, x, y) => {
		const keys = new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})]);
		for (const key of keys) {
			const vx = JSON.stringify(x?.[key]);
			const vy = JSON.stringify(y?.[key]);
			if (vx === vy) continue;
			let at = 0;
			while (vx && vy && at < vx.length && vx[at] === vy[at]) at++;
			const from = Math.max(0, at - 160);
			lines.push(`${what} ${key}:\n${pad(`old ${from ? '…' : ''}${vx?.slice(from, at + 300)}`)}\n${pad(`new ${from ? '…' : ''}${vy?.slice(from, at + 300)}`)}`);
		}
	};
	cmp('initial', a.initial, b.initial);
	a.steps.forEach((sa, i) => {
		const sb = b.steps[i];
		const name = `step ${i + 1} ${JSON.stringify(sa.step)}`;
		if (sa.error || sb.error) lines.push(`${name}: old ${sa.error ?? 'ok'} / new ${sb.error ?? 'ok'}`);
		cmp(`${name} animation`, sa.animations, sb.animations);
		cmp(`${name} state`, sa.state, sb.state);
	});
	if (a.errors.join() !== b.errors.join()) lines.push(`console errors: old ${JSON.stringify(a.errors)} new ${JSON.stringify(b.errors)}`);
	if (lines.length) differ++;
	else same++;
	process.stdout.write(`${lines.length ? 'DIFFERENT' : 'same     '} ${scenario.name}\n${lines.map((l) => `    ${l}\n`).join('')}`);
}
process.stdout.write(`${same} same, ${differ} different\n`);
await browser.close();
