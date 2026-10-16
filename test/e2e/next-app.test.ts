import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { captureRoute } from '../../src/check/capture.ts';
import { compareRoute } from '../../src/check/compare.ts';
import { runCheck } from '../../src/check/run.ts';
import { VIEWPORTS } from '../../src/check/types.ts';
import { summarize } from '../../src/check/summary.ts';
import { plan } from '../../src/plan/inventory.ts';
import { buildNext, failuresIn as failure, limited, OTHER_FONT, redDimensions, startNext, type App, type Mutation } from './harness.ts';

const ROUTES = ['/', '/en', '/fr', '/ar', '/en/about', '/fr/about', '/en/contact', '/de', '/en/missing'];

const MUTATIONS: Mutation[] = [
	{
		name: 'title',
		route: '/en/about',
		edits: [{ file: 'app/dictionaries.ts', find: "title: 'About us | Harbour Coffee'", replace: "title: 'About | Harbour Coffee'" }],
		red: ['seo'],
		expect: (report) => {
			const title = failure(report, 'seo').find((f) => f.check === 'title');
			assert.equal(title?.expected, '"About us | Harbour Coffee"');
			assert.equal(title?.actual, '"About | Harbour Coffee"');
			assert.ok(failure(report, 'seo').some((f) => f.check === 'meta:og:title'));
		},
	},
	{
		name: 'hreflang',
		route: '/en',
		edits: [{ file: 'app/metadata.ts', find: 'fr: `/fr${path}`, ', replace: '' }],
		red: ['seo'],
		expect: (report) => {
			const seo = failure(report, 'seo');
			assert.deepEqual(seo.map((f) => f.check), ['hreflang:fr']);
			assert.equal(seo[0]!.expected, '"https://harbour.example/fr"');
			assert.equal(seo[0]!.actual, '(absent)');
		},
	},
	{
		name: 'heading',
		route: '/en',
		edits: [{ file: 'app/dictionaries.ts', find: "heading: 'Fresh coffee, roasted by the harbour'", replace: "heading: 'Fresh coffee from the harbour'" }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const aria = failure(report, 'rendered').find((f) => f.check === 'accessibility tree');
			assert.match(aria!.expected, /heading "Fresh coffee, roasted by the harbour"/);
			assert.match(aria!.actual, /heading "Fresh coffee from the harbour"/);
		},
	},
	{
		name: 'alt-text',
		route: '/en',
		edits: [{ file: 'app/[lang]/page.tsx', find: 'alt={t.heroAlt}', replace: 'alt=""' }],
		red: ['rendered'],
		expect: (report) => {
			const f = failure(report, 'rendered').find((x) => x.check === 'accessibility tree');
			assert.match(f!.expected, /img "Sacks of green coffee beans stacked by the roaster"/);
			assert.equal(f!.actual, '(absent)');
		},
	},
	{
		name: 'font-size',
		route: '/en',
		edits: [{ file: 'app/globals.css', find: '.lede { font-size: 18px;', replace: '.lede { font-size: 21px;' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const css = failure(report, 'css');
			assert.ok(css.length >= 1);
			assert.ok(css.every((f) => /paragraph "We roast in small batches/.test(f.check) && f.expected.startsWith('font-size: 18px') && f.actual.startsWith('font-size: 21px')), JSON.stringify(css, null, 1));
			assert.ok(css.every((f) => /^Old rule: `\.lede` \(.+:\d+:\d+\) sets font-size with `18px`/.test(f.hint)), JSON.stringify(css.map((f) => f.hint), null, 1));
		},
	},
	{
		name: 'missing-image',
		route: '/en',
		edits: [{ file: 'public/hero.png', remove: true }],
		red: ['assets', 'visual'],
		expect: (report) => {
			const assets = failure(report, 'assets');
			assert.ok(assets.some((f) => f.check.startsWith('image #2') && f.expected === '640x320' && f.actual === 'broken'), JSON.stringify(assets, null, 1));
			assert.ok(assets.some((f) => f.check.startsWith('image /_next/image?url=%2Fhero.png') && /^4\d\d$/.test(f.actual)));
		},
	},
	{
		name: 'status-code',
		route: '/',
		edits: [{ file: 'proxy.ts', find: '307)', replace: '308)' }],
		red: ['http'],
		expect: (report) => {
			const [f] = failure(report, 'http');
			assert.equal(f?.check, 'redirect chain hop 1');
			assert.equal(f?.expected, '307 /');
			assert.equal(f?.actual, '308 /');
		},
	},
	{
		name: 'extra-js',
		route: '/en',
		edits: [
			{
				file: 'app/[lang]/counter.tsx',
				append: `\nconst table = [${Array.from({ length: 6000 }, (_, i) => (i * 7919) % 10007).join(',')}];\nlet sum = 0;\nfor (const n of table) sum += n;\n(globalThis as { checksum?: number }).checksum = sum;\n`,
			},
		],
		red: ['weight'],
		expect: (report) => {
			const checks = failure(report, 'weight').map((f) => f.check).sort();
			assert.deepEqual(checks, ['JavaScript downloaded', 'JavaScript run at load']);
		},
	},
	{
		name: 'noise-word',
		route: '/en',
		edits: [{ file: 'app/dictionaries.ts', find: "rendered: 'Page rendered at'", replace: "rendered: 'Page generated at'" }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const text = failure(report, 'rendered').find((f) => f.check === 'visible text');
			assert.match(text!.expected, /^Page rendered at \d{4}-/);
			assert.match(text!.actual, /^Page generated at \d{4}-/);
		},
	},
	{
		name: 'renamed-public-file',
		route: '/en',
		edits: [
			{ file: 'public/logo-2024.png', renameTo: 'public/logo-2025.png' },
			{ file: 'app/[lang]/layout.tsx', find: 'src="/logo-2024.png"', replace: 'src="/logo-2025.png"' },
		],
		red: ['assets'],
		expect: (report) => {
			const [f] = failure(report, 'assets');
			assert.equal(f?.check, 'image /logo-2024.png');
			assert.equal(f?.actual, '404 text/html');
		},
	},
	{
		name: 'font-swap',
		route: '/en/about',
		edits: [{ file: 'app/fonts/inter-latin.woff2', copyFrom: OTHER_FONT }],
		red: ['assets', 'visual'],
		expect: (report) => {
			const fonts = failure(report, 'assets').filter((f) => f.check.startsWith('rendered font of'));
			assert.ok(fonts.length >= 1, JSON.stringify(failure(report, 'assets'), null, 1));
			assert.ok(fonts.every((f) => /^web font Inter.* \(sha256 \w{12}\)$/.test(f.expected) && /^web font Geist/.test(f.actual)), JSON.stringify(fonts, null, 1));
		},
	},
	{
		name: 'font-renamed',
		route: '/en/about',
		edits: [
			{ file: 'app/[lang]/layout.tsx', find: 'const inter = localFont(', replace: 'const bodyFace = localFont(' },
			{ file: 'app/[lang]/layout.tsx', find: 'className={inter.variable}', replace: 'className={bodyFace.variable}' },
		],
		red: [],
		expect: () => {},
	},
	{
		name: 'hover-color',
		route: '/en',
		edits: [{ file: 'app/globals.css', find: '.menu-button:hover { background: #8a3a18; }', replace: '.menu-button:hover { background: #2f6d3a; }' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const css = failure(report, 'css');
			assert.ok(css.length >= 1 && css.every((f) => /^computed style in :hover on (\.counter button|\.menu-button): button "/.test(f.check) && /^background-color: /.test(f.expected)), JSON.stringify(css, null, 1));
			const counter = css.find((f) => f.check.startsWith('computed style in :hover on .counter button'));
			assert.match(counter!.hint, /Old rule: `\.counter button:hover` \(.+:\d+:\d+\) sets background-color with `#[0-9a-f]+`/);
			assert.ok(failure(report, 'visual').every((f) => /^screenshot in :hover on (\.counter button|\.menu-button)$/.test(f.check)));
			assert.ok(report.routes[0]!.shots.some((s) => s.label === 'desktop in :hover on .counter button' && !s.ok));
		},
	},
	{
		name: 'dark-mode',
		route: '/en',
		edits: [{ file: 'app/globals.css', find: '--paper: #1b1712;', replace: '--paper: #101820;' }],
		red: ['css'],
		expect: (report) => {
			const css = failure(report, 'css');
			assert.ok(css.length >= 1 && css.every((f) => f.check.startsWith('computed style in prefers-color-scheme: dark')), JSON.stringify(css, null, 1));
			assert.ok(css.some((f) => /reading --paper from `:root` inside @media \(prefers-color-scheme:dark\)/.test(f.hint)), JSON.stringify(css.map((f) => f.hint), null, 1));
		},
	},
	{
		name: 'breakpoint',
		route: '/en',
		edits: [{ file: 'app/globals.css', find: '@media (max-width: 600px)', replace: '@media (max-width: 640px)' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const checks = [...new Set([...failure(report, 'css'), ...failure(report, 'visual')].map((f) => f.check.replace(/: .*$/, '')))];
			assert.deepEqual(checks.sort(), ['computed style in viewport width 601px', 'screenshot in viewport width 601px']);
			assert.ok(failure(report, 'css').some((f) => /Old rule: `\.site-header` \(.+\) sets (flex-direction|align-items) with/.test(f.hint)), JSON.stringify(failure(report, 'css').map((f) => f.hint), null, 1));
		},
	},
	{
		name: 'container',
		route: '/en',
		edits: [{ file: 'app/globals.css', find: '@container (min-width: 480px)', replace: '@container (min-width: 520px)' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const checks = [...new Set([...failure(report, 'css'), ...failure(report, 'visual')].map((f) => f.check.replace(/: .*$/, '')))];
			assert.deepEqual(checks.sort(), ['computed style in container width 480px', 'screenshot in container width 480px']);
			assert.ok(failure(report, 'css').some((f) => /`\.ro(ute|ast)` inside @container \((min-width:|width>=)480px\) \(.+\) sets display with `grid`/.test(f.hint)), JSON.stringify(failure(report, 'css').map((f) => f.hint), null, 1));
		},
	},
	{
		name: 'removed-label',
		route: '/en/contact',
		edits: [
			{ file: 'app/[lang]/contact/page.tsx', find: '<label>\n\t\t\t\t\t{t.name}', replace: '<div>\n\t\t\t\t\t{t.name}' },
			{ file: 'app/[lang]/contact/page.tsx', find: '</label>', replace: '</div>' },
		],
		red: ['a11y', 'behaviour', 'css', 'rendered', 'visual'],
		expect: (report) => {
			const axe = failure(report, 'a11y').find((f) => f.check.startsWith('axe label:'));
			assert.ok(axe, JSON.stringify(failure(report, 'a11y'), null, 1));
			assert.equal(axe.expected, '0 elements');
			assert.match(axe.hint, /dequeuniversity\.com\/rules\/axe\/.*\/label/);
		},
	},
	{
		name: 'tab-order',
		route: '/en',
		edits: [{ file: 'app/[lang]/layout.tsx', find: '<Link href={`/${lang}/contact`}>', replace: '<Link href={`/${lang}/contact`} tabIndex={1}>' }],
		red: ['a11y'],
		expect: (report) => {
			const f = failure(report, 'a11y').find((x) => x.check.startsWith('focus order'));
			assert.equal(f?.check, 'focus order (Tab), first difference at stop 1');
			assert.ok(failure(report, 'a11y').some((x) => x.check.startsWith('axe tabindex:')));
			assert.match(f!.expected, /^1\. link "Home" → 2\. link "About" → 3\. link "Contact"/);
			assert.match(f!.actual, /^1\. link "Contact" → 2\. link "Home"/);
		},
	},
	{
		name: 'button-as-div',
		route: '/en',
		edits: [
			{ file: 'app/[lang]/counter.tsx', find: '<button type="button" onClick', replace: '<div onClick' },
			{ file: 'app/[lang]/counter.tsx', find: '</button>', replace: '</div>' },
		],
		red: ['a11y', 'behaviour', 'rendered', 'visual'],
		expect: (report) => {
			const order = failure(report, 'a11y').find((f) => f.check.startsWith('focus order'));
			assert.match(order!.expected, /button "Pour a cup"/);
			assert.doesNotMatch(order!.actual, /Pour a cup/);
		},
	},
	{
		name: 'landmark',
		route: '/en/about',
		edits: [
			{ file: 'app/[lang]/layout.tsx', find: '<nav aria-label="Main">', replace: '<div aria-label="Main">' },
			{ file: 'app/[lang]/layout.tsx', find: '</nav>', replace: '</div>' },
		],
		red: ['a11y', 'css', 'rendered', 'visual'],
		expect: (report) => {
			const landmarks = failure(report, 'a11y').filter((f) => f.check === 'landmarks');
			assert.deepEqual(landmarks.map((f) => [f.expected, f.actual]), [['navigation "Main"', '(absent)']]);
		},
	},
	{
		name: 'reduced-motion',
		route: '/en/about',
		edits: [{ file: 'app/globals.css', find: '@media (prefers-reduced-motion: no-preference) {', replace: '@media all {' }],
		red: ['a11y', 'css'],
		expect: (report) => {
			const motion = failure(report, 'a11y').find((f) => f.check === 'motion under prefers-reduced-motion: reduce');
			assert.equal(motion?.expected, 'no running animations');
			assert.match(motion!.actual, /^running: .*glow/);
		},
	},
	{
		name: 'date-format',
		route: '/fr',
		edits: [{ file: 'app/dictionaries.ts', find: "dateLocale: 'fr-FR'", replace: "dateLocale: 'en-US'" }],
		red: ['i18n', 'rendered', 'visual'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'i18n');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(f?.check, 'date or number format for fr');
			assert.equal(f?.expected, '# MMMM # (27 octobre 2026)');
			assert.equal(f?.actual, 'MMMM #, # (October 27, 2026)');
		},
	},
	{
		name: 'accept-language',
		route: '/',
		edits: [{ file: 'proxy.ts', find: "const locale = wanted.find(isLocale) ?? 'en';", replace: "const locale = wanted.some(isLocale) ? 'en' : 'en';" }],
		red: ['i18n'],
		expect: (report) => {
			const failures = failure(report, 'i18n');
			assert.deepEqual(failures.map((f) => [f.check, f.expected, f.actual]), [
				['page a browser sending Accept-Language: ar lands on', '/ar', '/en'],
				['page a browser sending Accept-Language: fr lands on', '/fr', '/en'],
			]);
		},
	},
	{
		name: 'rtl',
		route: '/ar',
		edits: [{ file: 'app/[lang]/layout.tsx', find: "dir={lang === 'ar' ? 'rtl' : 'ltr'}", replace: 'dir="ltr"' }],
		red: ['css', 'i18n', 'visual'],
		expect: (report) => {
			const i18n = failure(report, 'i18n').map((f) => [f.check, f.expected, f.actual]);
			assert.deepEqual(i18n, [
				['<html dir>', 'rtl', 'ltr'],
				['text direction of the page', 'rtl', 'ltr'],
			]);
		},
	},
	{
		name: 'counter-by-two',
		route: '/en',
		edits: [{ file: 'app/[lang]/counter.tsx', find: 'setCount(count + 1)', replace: 'setCount(count + 2)' }],
		red: ['a11y', 'behaviour'],
		expect: (report) => {
			const click = failure(report, 'behaviour').find((f) => f.check === 'click button "Pour a cup"');
			assert.ok(click, JSON.stringify(failure(report, 'behaviour'), null, 1));
			assert.match(click.expected, /announced: output: 1/);
			assert.match(click.actual, /announced: output: 2/);
			assert.ok(failure(report, 'a11y').some((f) => f.check === 'press Enter on button "Pour a cup"'));
		},
	},
	{
		name: 'form-path',
		route: '/en/contact',
		edits: [
			{ file: 'app/[lang]/contact/page.tsx', find: 'action="/api/contact"', replace: 'action="/api/message"' },
			{ file: 'app/api/message/route.ts', write: "import { isLocale } from '../../dictionaries';\n\nexport async function POST(request: Request) {\n\tconst form = await request.formData();\n\tconst lang = String(form.get('lang') ?? 'en');\n\tconst target = new URL(`/${isLocale(lang) ? lang : 'en'}/contact?sent=1`, request.url);\n\treturn Response.redirect(target, 303);\n}\n" },
		],
		red: ['behaviour'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'behaviour');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.match(f!.check, /^fill textbox "Your name", textbox "Message" and submit with button "Send message"$/);
			assert.match(f!.expected, /requests: POST \/api\/contact \{lang: string, message: string, name: string\}/);
			assert.match(f!.actual, /requests: POST \/api\/message /);
		},
	},
	{
		name: 'menu-broken',
		route: '/en/about',
		edits: [{ file: 'app/[lang]/menu.tsx', find: 'onClick={() => setOpen(!open)}', replace: 'onClick={() => {}}' }],
		red: ['a11y', 'behaviour'],
		expect: (report) => {
			const click = failure(report, 'behaviour').find((f) => f.check === 'click button "More"');
			assert.ok(click, JSON.stringify(failure(report, 'behaviour'), null, 1));
			assert.match(click.expected, /appears: .*link "Wholesale"/);
			assert.ok(failure(report, 'a11y').some((f) => f.check === 'press Enter on button "More"'));
		},
	},
];

describe('next.js app router app', { concurrency: 4 }, () => {
	let browser: Browser;
	let old: App;
	let twin: App;
	const mutants = new Map<string, App>();

	before(async () => {
		browser = await chromium.launch();
		const builds = [{ name: 'original', edits: [] }, { name: 'rebuild', edits: [] }, ...MUTATIONS];
		const dirs = await limited(builds, 3, (b) => buildNext(b.name, b.edits));
		const apps = await Promise.all(dirs.map(startNext));
		old = apps[0]!;
		twin = apps[1]!;
		MUTATIONS.forEach((m, i) => mutants.set(m.name, apps[i + 2]!));
	});

	after(async () => {
		await Promise.all([old?.stop(), twin?.stop(), ...[...mutants.values()].map((m) => m.stop())]);
		await browser?.close();
	});

	test('an independent rebuild of the same source is green on every route', async () => {
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: ROUTES, browser });
		process.stdout.write(`\n${summarize(report)}`);
		assert.deepEqual(redDimensions(report), [], summarize(report));
	});

	test('without the noise baseline the same comparison goes red, so the baseline is doing work', async () => {
		const oldA = await captureRoute(browser, old.origin, '/en', VIEWPORTS);
		const next = await captureRoute(browser, twin.origin, '/en', VIEWPORTS);
		const result = compareRoute('/en', [oldA, oldA], next, new Map());
		assert.ok(result.failures.some((f) => f.dimension === 'rendered' && /Page rendered at/.test(f.expected)), JSON.stringify(result.failures, null, 1));
	});

	test('plan crawls every locale and records the root redirect', async () => {
		const inventory = await plan({ origin: old.origin, source: new URL('../../fixtures/next-app', import.meta.url).pathname, browser });
		assert.deepEqual(inventory.routes.map((r) => r.route), ['/', '/ar', '/ar/about', '/ar/contact', '/en', '/en/about', '/en/contact', '/fr', '/fr/about', '/fr/contact']);
		assert.equal(inventory.routes[0]!.redirectsTo, '/en');
		assert.deepEqual(inventory.locales, ['ar', 'en', 'fr']);
		assert.deepEqual(inventory.localeRouting, { prefixes: ['ar', 'en', 'fr'], negotiation: { ar: '/ar', en: '/en', fr: '/fr' } });
		assert.equal(inventory.source?.framework, 'next');
		assert.deepEqual(inventory.source?.fileRoutes, ['/[lang]', '/[lang]/about', '/[lang]/contact', '/api/contact']);
	});

	for (const mutation of MUTATIONS) {
		test(`mutation "${mutation.name}" ${mutation.red.length ? `turns ${mutation.red.join(' + ')} red and nothing else` : 'stays green'}`, async () => {
			const report = await runCheck({ oldOrigin: old.origin, newOrigin: mutants.get(mutation.name)!.origin, routes: [mutation.route], browser });
			if (process.env.SHOW_SUMMARY) process.stdout.write(`\n${summarize(report)}`);
			assert.deepEqual(redDimensions(report), [...mutation.red].sort(), summarize(report));
			mutation.expect(report);
		});
	}
});
