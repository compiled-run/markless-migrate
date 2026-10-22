import assert from 'node:assert/strict';
import { after, before, describe } from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { CONTENT, startCms, type Cms } from '../../fixtures/cms/server.ts';
import { readAuthFile } from '../../src/check/auth.ts';
import { captureRoute } from '../../src/check/capture.ts';
import { compareRoute } from '../../src/check/compare.ts';
import { runCheck } from '../../src/check/run.ts';
import { loadSourceFacts } from '../../src/check/source-facts.ts';
import { VIEWPORTS } from '../../src/check/types.ts';
import { summarize } from '../../src/check/summary.ts';
import { defaultEnv } from '../../src/check/browser.ts';
import { discoverEndpoints } from '../../src/check/endpoints.ts';
import { plan, writeInventory } from '../../src/plan/inventory.ts';
import { routeTargets } from '../../src/plan/routes.ts';
import { recordResults, status, summarizeStatus } from '../../src/status.ts';
import { buildNext, failuresIn as failure, limited, OTHER_FONT, redByRole, redDimensions, sharded, startGuard, startNext, SUITE_CONCURRENCY, writeAuth, type App, type Edit, type Mutation } from './harness.ts';
import type { Dimension, Report } from '../../src/check/types.ts';

const FIXTURE = new URL('../../fixtures/next-app', import.meta.url).pathname;
const ROUTES = ['/', '/en', '/fr', '/ar', '/en/about', '/fr/about', '/en/contact', '/de', '/en/missing', '/feed.xml', '/robots.txt', '/sitemap.xml', '/api/news'];

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
			assert.match(aria!.where ?? '', /^old app\/\[lang\]\/page\.tsx:\d+ renders heading "Fresh coffee, roasted by the harbour" \(text from app\/dictionaries\.ts:\d+\); new app\/\[lang\]\/page\.tsx:\d+ renders heading "Fresh coffee from the harbour" \(text from app\/dictionaries\.ts:\d+\)$/, aria!.where);
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
			assert.ok(css.every((f) => /^Old rule: `\.lede` \(app\/globals\.css:\d+:\d+, served as \/_next\/static\/chunks\//.test(f.hint) && f.old?.how === 'source map' && f.old.file === 'app/globals.css'), JSON.stringify(css.map((f) => [f.hint, f.old]), null, 1));
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
	{
		name: 'tip-label',
		route: '/en',
		edits: [{ file: 'app/[lang]/page.tsx', find: '<Tip label="Barista’s tip" />', replace: '<Tip label="Baristas’ tip" />' }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const text = failure(report, 'rendered').find((f) => f.check === 'visible text');
			assert.match(text!.expected, /^Barista’s tip: \S/);
			assert.equal(text!.actual, text!.expected.replace('Barista’s', 'Baristas’'), 'the random tip is the same on both sides, so only the label differs');
			// A client component: its React fiber names the component function, the build's source map its file, and the source the line.
			assert.match(text!.where ?? '', /^old app\/\[lang\]\/tip\.tsx:10 renders paragraph "Barista’s tip:" \(text from app\/\[lang\]\/page\.tsx:\d+\); new app\/\[lang\]\/tip\.tsx:10 renders paragraph "Baristas’ tip:" \(text from app\/\[lang\]\/page\.tsx:\d+\)$/, text!.where);
			assert.equal(text!.old?.how, 'react component + source map');
		},
	},
	{
		name: 'network-query-field',
		route: '/en',
		edits: [{ file: 'app/[lang]/page.tsx', find: 'fields=title,summary,slug', replace: 'fields=title,summary' }],
		red: ['network'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'network');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(f!.check, 'server request changed');
			assert.match(f!.expected, /^server GET 127\.0\.0\.1:\d+\/coffee\/news\?fields=title,summary,slug&locale=en$/);
			assert.match(f!.actual, /^server GET 127\.0\.0\.1:\d+\/coffee\/news\?fields=title,summary&locale=en$/);
		},
	},
	{
		name: 'network-endpoint',
		route: '/en',
		edits: [{ file: 'app/[lang]/page.tsx', find: '/coffee/news?', replace: '/coffee/articles?' }],
		red: ['network'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'network');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(f!.check, 'server request to a different endpoint');
			assert.match(f!.expected, /\/coffee\/news\?/);
			assert.match(f!.actual, /\/coffee\/articles\?/);
		},
	},
	{
		name: 'network-twice',
		route: '/en',
		edits: [{ file: 'app/[lang]/hours.tsx', find: 'void load();', replace: 'void load().then(load);' }],
		red: ['network'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'network');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.match(f!.check, /^browser request GET 127\.0\.0\.1:\d+\/coffee\/hours$/);
			assert.equal(f!.actual, '2 times');
		},
	},
	{
		name: 'network-server-request',
		route: '/en',
		edits: [{ file: 'app/[lang]/layout.tsx', find: "const settings = await cms<{ tagline: string }>('/coffee/settings');", replace: `const settings = { tagline: '${CONTENT.coffee!.settings.tagline}' };` }],
		red: ['network'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'network');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(f!.check, 'server request missing');
			assert.match(f!.expected, /^server GET 127\.0\.0\.1:\d+\/coffee\/settings$/);
		},
	},
	{
		name: 'feed-item',
		route: '/feed.xml',
		edits: [{ file: 'app/feed.xml/route.ts', find: '(news?.items ?? []).map(', replace: '(news?.items ?? []).slice(1).map(' }],
		red: ['data'],
		expect: (report) => {
			assert.equal(report.routes[0]!.endpoint, 'feed');
			assert.deepEqual(failure(report, 'data').map((f) => [f.check, f.expected, f.actual]), [['feed item missing', '"Ethiopian lot arrives Tuesday" (https://harbour.example/en/news/ethiopian-lot)', '(absent)']]);
		},
	},
	{
		name: 'robots',
		route: '/robots.txt',
		edits: [{ file: 'app/robots.ts', find: "disallow: ['/api/']", replace: "disallow: ['/api/', '/en/contact']" }],
		red: ['seo'],
		expect: (report) => {
			assert.deepEqual(failure(report, 'seo').map((f) => [f.check, f.expected, f.actual]), [['robots.txt line', '(absent)', 'Disallow: /en/contact']]);
		},
	},
	{
		name: 'json-field',
		route: '/api/news',
		edits: [{ file: 'app/api/news/route.ts', find: '({ title: item.title,', replace: '({ headline: item.title,' }],
		red: ['data'],
		expect: (report) => {
			assert.deepEqual(failure(report, 'data').map((f) => f.check), ['JSON field items[].title missing', 'JSON field items[].headline not in the old response']);
			assert.equal(failure(report, 'data')[0]!.expected, '"Ethiopian lot arrives Tuesday" (and 1 more entry)');
		},
	},
];

const WALL = 'harbour-staging-pass';
process.env.FIXTURE_MEMBER_PASSWORD = 'tuesday-roast';

interface AuthMutation {
	readonly name: string;
	readonly route: string;
	readonly edits: readonly Edit[];
	readonly red: Readonly<Record<'anonymous' | 'member' | 'admin', readonly Dimension[]>>;
	readonly expect: (report: Report) => void;
}

const authFailure = (report: Report, role: string, dimension: Dimension) => [...report.routes.filter((r) => r.role === role).flatMap((r) => r.failures), ...(report.logins ?? []).filter((l) => l.role === role).flatMap((l) => l.failures)].filter((f) => f.dimension === dimension);

const AUTH_MUTATIONS: AuthMutation[] = [
	{
		name: 'auth-anonymous-members',
		route: '/en/members',
		edits: [{ file: 'app/[lang]/members/page.tsx', find: 'if (!user) redirect(`/${lang}/login`);', replace: '' }],
		red: { anonymous: ['auth', 'http'], member: [], admin: [] },
		expect: (report) => {
			const [f] = authFailure(report, 'anonymous', 'auth');
			assert.equal(f!.check, 'access as anonymous');
			assert.equal(f!.expected, 'denied: 307 to /en/login (200)');
			assert.equal(f!.actual, 'let in: 200');
			assert.equal(report.routes.find((r) => r.role === 'anonymous')!.dimensions.rendered, 'skipped', 'a login page is not compared with a members page');
		},
	},
	{
		name: 'auth-admin-for-members',
		route: '/en/admin',
		edits: [{ file: 'app/[lang]/admin/page.tsx', find: "if (user.role !== 'admin') forbidden();", replace: '' }],
		red: { anonymous: [], member: ['auth', 'http'], admin: [] },
		expect: (report) => {
			const [f] = authFailure(report, 'member', 'auth');
			assert.deepEqual([f!.check, f!.expected, f!.actual], ['access as member', 'denied: 403', 'let in: 200']);
		},
	},
	{
		name: 'auth-login-target',
		route: '/en/members',
		edits: [{ file: 'app/[lang]/members/page.tsx', find: 'redirect(`/${lang}/login`)', replace: 'redirect(`/${lang}/login?next=/${lang}/members`)' }],
		red: { anonymous: ['auth', 'http'], member: [], admin: [] },
		expect: (report) => {
			const [f] = authFailure(report, 'anonymous', 'auth');
			assert.deepEqual([f!.check, f!.expected, f!.actual], ['where anonymous is sent', '/en/login', '/en/login?next=/en/members']);
		},
	},
	{
		name: 'auth-session-cookie',
		route: '/en/members',
		edits: [{ file: 'app/api/login/route.ts', find: 'Path=/; HttpOnly; SameSite=Lax', replace: 'Path=/; SameSite=Strict' }],
		red: { anonymous: [], member: ['auth'], admin: [] },
		expect: (report) => {
			const [f] = authFailure(report, 'member', 'auth');
			assert.equal(f!.check, 'session cookie session after signing in as member');
			assert.equal(f!.expected, 'session: Path=/; host-only; HttpOnly; not Secure; SameSite=Lax; session');
			assert.equal(f!.actual, 'session: Path=/; host-only; readable by scripts; not Secure; SameSite=Strict; session');
			assert.ok(report.logins!.find((l) => l.role === 'admin')!.ok, 'a storage state file carries its own cookie, so the admin role cannot see what the new login sets');
		},
	},
];

describe('next.js app router app', { concurrency: SUITE_CONCURRENCY }, () => {
	const shard = sharded();
	let browser: Browser;
	let old: App;
	let twin: App;
	let twinOnOtherCms: App;
	let cms: Cms;
	let otherCms: Cms;
	const mutants = new Map<string, App>();
	const sources = new Map<string, string>();
	let walled: App;

	before(async () => {
		browser = await chromium.launch();
		cms = await startCms();
		otherCms = await startCms({ coffee: { ...CONTENT.coffee!, news: CONTENT.coffee!.news.map((n) => ({ ...n, title: `${n.title} (staging copy)` })), hours: { today: 'Shop closed for a private tasting' } } });
		const chosen = [...MUTATIONS, ...AUTH_MUTATIONS].filter((m) => shard.mutants.has(m.name));
		const builds = [{ name: 'original', edits: [] }, { name: 'rebuild', edits: [] }, ...chosen];
		const dirs = await limited(builds, 3, (b) => buildNext(b.name, b.edits));
		const apps = await Promise.all([...dirs.map((dir) => startNext(dir, cms.origin)), startNext(dirs[1]!, otherCms.origin), startNext(dirs[0]!, cms.origin, { BOT_WALL: WALL })]);
		old = apps[0]!;
		twin = apps[1]!;
		twinOnOtherCms = apps.at(-2)!;
		walled = apps.at(-1)!;
		chosen.forEach((m, i) => mutants.set(m.name, apps[i + 2]!));
		chosen.forEach((m, i) => sources.set(m.name, dirs[i + 2]!));
	});

	after(async () => {
		await Promise.all([old?.stop(), twin?.stop(), twinOnOtherCms?.stop(), walled?.stop(), ...[...mutants.values()].map((m) => m.stop())]);
		await Promise.all([cms?.stop(), otherCms?.stop()]);
		await browser?.close();
	});

	shard.test('an independent rebuild of the same source is green on every route', async () => {
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: ROUTES, browser });
		process.stdout.write(`\n${summarize(report)}`);
		assert.deepEqual(redDimensions(report), [], summarize(report));
	});

	shard.test('without the noise baseline the same comparison goes red, so the baseline is doing work', async () => {
		const oldA = await captureRoute(browser, old.origin, '/en', VIEWPORTS);
		const next = await captureRoute(browser, twin.origin, '/en', VIEWPORTS);
		const result = compareRoute('/en', [oldA, oldA], next, new Map());
		assert.ok(result.failures.some((f) => f.dimension === 'rendered' && /Page rendered at/.test(f.expected)), JSON.stringify(result.failures, null, 1));
	});

	shard.test('the source scan of the old app feeds the noise report: server time stays noise, the seeded Math.random tip is pinned', async () => {
		const { facts: source } = await loadSourceFacts(FIXTURE);
		const serverTime = source!.nondeterminism.find((f) => f.what === 'new Date()' && f.side === 'server')!;
		assert.equal(serverTime.file, 'app/[lang]/layout.tsx');
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: ['/en'], browser, source: source! });
		assert.deepEqual(redDimensions(report), [], summarize(report));
		const noisy = report.routes[0]!.noise!.noisy;
		assert.ok(noisy.some((n) => /^time /.test(n.element) && /comes from the server/.test(n.why) && n.why.includes(`app/[lang]/layout.tsx:${serverTime.line} (new Date())`)), JSON.stringify(noisy, null, 1));
		assert.ok(!noisy.some((n) => /tip/i.test(n.element)), JSON.stringify(noisy, null, 1));
		const pinned = Object.fromEntries(report.sources!.map((s) => [`${s.file} ${s.what}`, s.pinned]));
		assert.equal(pinned['app/[lang]/layout.tsx new Date()'], 'not pinned: runs on the server, left to the noise baseline (repeated OLD loads)');
		assert.equal(pinned['app/[lang]/tip.tsx Math.random()'], 'pinned in the browser (seeded)');
		const network = report.routes[0]!.network!;
		assert.deepEqual(network.server, { old: true, new: true });
		assert.ok(network.old.some((line) => /^server GET 127\.0\.0\.1:\d+\/coffee\/settings$/.test(line)), network.old.join('\n'));
		assert.ok(network.old.some((line) => /^browser GET 127\.0\.0\.1:\d+\/coffee\/hours$/.test(line)), network.old.join('\n'));
	});

	shard.test('recorded data: record from OLD, replay to both apps, so a NEW app on another CMS sees the same content', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'mm-data-'));
		const live = await runCheck({ oldOrigin: old.origin, newOrigin: twinOnOtherCms.origin, routes: ['/en'], browser });
		assert.ok(redDimensions(live).includes('rendered'), summarize(live));
		await runCheck({ oldOrigin: old.origin, newOrigin: twinOnOtherCms.origin, routes: ['/en'], browser, data: { mode: 'record', dir } });
		const file = JSON.parse(await readFile(join(dir, 'en.json'), 'utf8')) as { responses: { side: string; url: string }[] };
		assert.deepEqual(file.responses.map((r) => `${r.side} ${new URL(r.url).pathname}`).sort(), ['browser /coffee/hours', 'server /coffee/news', 'server /coffee/settings']);
		const before = otherCms.requests.length;
		const replayed = await runCheck({ oldOrigin: old.origin, newOrigin: twinOnOtherCms.origin, routes: ['/en'], browser, data: { mode: 'replay', dir } });
		assert.deepEqual(redDimensions(replayed), [], summarize(replayed));
		const asked = otherCms.requests.slice(before);
		// Pages reached through the locale links are not in /en's recording, so they fetch live.
		assert.deepEqual(asked.filter((r) => !/locale=(fr|ar)$/.test(r)), [], 'what the recording covers never reaches the other CMS');
	});

	shard.test('writes to an origin that is neither staging nor localhost are held back, compared unsent, and never reach it', async () => {
		const guardOld = await startGuard(old.origin);
		const guardNew = await startGuard(mutants.get('form-path')!.origin);
		const { facts: source } = await loadSourceFacts(FIXTURE);
		try {
			const report = await runCheck({ oldOrigin: guardOld.origin, newOrigin: guardNew.origin, routes: ['/en/contact'], browser, ...(source ? { source } : {}) });
			assert.equal(guardOld.writes.length + guardNew.writes.length, 0, [...guardOld.writes, ...guardNew.writes].join(', '));
			assert.equal(report.writes, 'held back');
			assert.deepEqual(redDimensions(report), ['behaviour'], summarize(report));
			const [f] = failure(report, 'behaviour');
			assert.match(f!.expected, /requests: would POST \/api\/contact \{lang: string, message: string, name: string\}/);
			assert.match(f!.actual, /requests: would POST \/api\/message /);
			assert.ok(report.routes[0]!.writes!.some((w) => w.line.startsWith('would POST /api/contact') && !w.sent && w.reason === 'writes per the source: route-handler at app/api/contact/route.ts:3'), JSON.stringify(report.routes[0]!.writes));

			const staged = await runCheck({ oldOrigin: guardOld.origin, newOrigin: guardNew.origin, routes: ['/en/contact'], browser, staging: { old: true, new: true } });
			assert.equal(staged.writes, 'sent');
			assert.ok(guardOld.writes.includes('POST /api/contact'), 'marked staging, the write is sent, so the guard does see writes');
		} finally {
			await Promise.all([guardOld.stop(), guardNew.stop()]);
		}
	}, ['form-path']);

	shard.test('check --all fills dynamic segments from the crawl, asks for a sample where none exists, and compares the feed, robots.txt, sitemap and JSON route as data; status follows the migration order', async () => {
		const inventory = await plan({ origin: old.origin, source: FIXTURE, browser });
		const targets = routeTargets(inventory);
		assert.deepEqual(targets.needsSample, [{ route: '/:lang/news/:slug', params: ['slug'], file: 'app/[lang]/news/[slug]/page.tsx', line: 6 }]);
		assert.deepEqual(targets.endpoints, ['/api/news', '/feed.xml']);
		const sampled = routeTargets(inventory, { slug: 'ethiopian-lot' });
		assert.deepEqual(sampled.pages.filter((p) => p.includes('/news/')), ['/ar/news/ethiopian-lot']);
		const endpoints = await discoverEndpoints(defaultEnv(old.origin), targets.pages, targets.endpoints);
		assert.deepEqual(endpoints, ['/api/news', '/feed.xml', '/robots.txt', '/sitemap.xml']);
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: ['/ar/news/ethiopian-lot'], endpoints, browser, unchecked: targets.needsSample });
		assert.deepEqual(report.routes.map((r) => [r.route, r.endpoint ?? 'page']), [['/ar/news/ethiopian-lot', 'page'], ['/api/news', 'json'], ['/feed.xml', 'feed'], ['/robots.txt', 'robots'], ['/sitemap.xml', 'sitemap']]);
		assert.deepEqual(redDimensions(report), [], summarize(report));
		assert.match(summarize(report), /needs a sample[\s\S]*\/:lang\/news\/:slug {2}no value for :slug/);

		const cwd = await mkdtemp(join(tmpdir(), 'mm-order-'));
		await writeInventory(inventory, join(cwd, '.migrate'));
		await recordResults(cwd, report);
		const s = await status(cwd);
		const order = s.order!.map((o) => o.name);
		assert.ok(order.indexOf('Tip') < order.indexOf('Home') && order.indexOf('LangLayout') < order.indexOf('About'), order.join(', '));
		assert.deepEqual(s.order!.find((o) => o.name === 'NewsItem'), { kind: 'route', name: 'NewsItem', file: 'app/[lang]/news/[slug]/page.tsx', routes: ['/ar/news/ethiopian-lot'], green: 1, state: 'green' });
		assert.equal(s.order!.find((o) => o.name === 'Home')!.state, 'unchecked');
		assert.ok(s.routes.findIndex((r) => r.route === '/en/about') < s.routes.findIndex((r) => r.route === '/en'), 'routes follow the order: About converts before Home');
		assert.deepEqual(s.routes.at(-1), { route: '/:lang/news/:slug', state: 'needs a sample', red: [] });
		assert.match(summarizeStatus(s), /Migration order:\n +1\. unchecked +component Counter/);
	});

	shard.test('plan crawls every locale and records the root redirect', async () => {
		const inventory = await plan({ origin: old.origin, source: new URL('../../fixtures/next-app', import.meta.url).pathname, browser });
		assert.deepEqual(inventory.routes.map((r) => r.route), ['/', '/ar', '/ar/about', '/ar/contact', '/en', '/en/about', '/en/contact', '/fr', '/fr/about', '/fr/contact']);
		assert.equal(inventory.routes[0]!.redirectsTo, '/en');
		assert.deepEqual(inventory.locales, ['ar', 'en', 'fr']);
		assert.deepEqual(inventory.localeRouting, { prefixes: ['ar', 'en', 'fr'], negotiation: { ar: '/ar', en: '/en', fr: '/fr' } });
		assert.equal(inventory.source?.framework, 'next');
		assert.deepEqual(inventory.source?.fileRoutes, ['/[lang]', '/[lang]/about', '/[lang]/admin', '/[lang]/contact', '/[lang]/login', '/[lang]/members', '/[lang]/news/[slug]', '/api/contact', '/api/login', '/api/news', '/feed.xml']);
	});

	shard.test('plan proposes the roles and login route from the auth guards, and its starter, given credentials, checks every role green', async () => {
		const inventory = await plan({ origin: old.origin, source: FIXTURE, browser });
		const auth = inventory.auth!;
		assert.equal(auth.loginRoute, '/en/login');
		assert.deepEqual(Object.keys(auth.roles), ['signed-in', 'admin']);
		assert.deepEqual(auth.guards, ['/en/admin: admin (app/[lang]/admin/page.tsx:11)', '/en/members: signed-in (app/[lang]/members/page.tsx:11)']);
		assert.deepEqual(auth.roles.admin!.login, [{ goto: '/en/login' }, { fill: { label: 'Email' }, value: '${ADMIN_EMAIL}' }, { fill: { label: 'Password' }, value: '${ADMIN_PASSWORD}' }, { click: { role: 'button', name: 'Sign in' } }, { wait: '!/en/login' }], 'the last step waits until the browser has left the login page, so the session cookie is set');
		const dir = await mkdtemp(join(tmpdir(), 'mm-starter-'));
		await writeFile(join(dir, 'auth.json'), JSON.stringify(auth));
		Object.assign(process.env, { SIGNED_IN_EMAIL: 'mia@harbour.example', SIGNED_IN_PASSWORD: 'tuesday-roast', ADMIN_EMAIL: 'ada@harbour.example', ADMIN_PASSWORD: 'green-beans' });
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: ['/en/members', '/en/admin'], browser, auth: await readAuthFile(join(dir, 'auth.json')), authStateDir: join(dir, 'state') });
		assert.equal(report.ok, true, summarize(report));
		assert.deepEqual(report.roles, ['anonymous', 'signed-in', 'admin']);
		assert.deepEqual(report.routes.map((r) => `${r.role} ${r.route}`), ['anonymous /en/members', 'anonymous /en/admin', 'signed-in /en/members', 'signed-in /en/admin', 'admin /en/members', 'admin /en/admin']);
		assert.deepEqual(report.logins!.map((l) => [l.role, l.cookies.old]), [['signed-in', ['session: Path=/; host-only; HttpOnly; not Secure; SameSite=Lax; session']], ['admin', ['session: Path=/; host-only; HttpOnly; not Secure; SameSite=Lax; session']]]);
		const state = JSON.parse(await readFile(join(dir, 'state', 'admin.old.json'), 'utf8')) as { cookies: { name: string; value: string }[] };
		assert.equal(state.cookies[0]!.value, Buffer.from('ada@harbour.example').toString('base64url'), 'the signed-in state is kept for reuse as a storage state file');
	});

	shard.test('a Cloudflare-style challenge on OLD stops the route with what to do; the staging pass as a header or cookie gets through', async () => {
		const report = await runCheck({ oldOrigin: walled.origin, newOrigin: twin.origin, routes: ['/en'], browser });
		const [route] = report.routes;
		assert.equal(report.ok, false);
		assert.deepEqual(route!.failures, [], 'a wall is not reported as differences');
		assert.ok(Object.values(route!.dimensions).every((d) => d === 'skipped'));
		assert.equal(route!.blocked!.message, 'blocked by Cloudflare on OLD (403, header cf-mitigated: challenge): use a staging URL or pass --header/--cookie with a bypass token');
		assert.match(summarize(report), /BLOCKED +\/en +blocked by Cloudflare on OLD/);
		const header = await runCheck({ oldOrigin: walled.origin, newOrigin: twin.origin, routes: ['/en'], browser, headers: { 'x-staging-pass': WALL } });
		assert.deepEqual(redDimensions(header), [], summarize(header));
		assert.equal(header.routes[0]!.blocked, undefined);
		const cookie = await runCheck({ oldOrigin: walled.origin, newOrigin: twin.origin, routes: ['/en/about'], browser, cookies: [{ name: 'staging_pass', value: WALL }] });
		assert.deepEqual(redDimensions(cookie), [], summarize(cookie));
		assert.equal(cookie.routes[0]!.blocked, undefined);
	});

	for (const mutation of AUTH_MUTATIONS) {
		shard.test(`auth mutation "${mutation.name}" turns ${Object.entries(mutation.red).filter(([, d]) => d.length).map(([role, d]) => `${d.join(' + ')} red as ${role}`).join(', ')} and nothing else`, async () => {
			const auth = await writeAuth({ loginRoute: '/en/login', member: 'mia@harbour.example', admin: 'ada@harbour.example', landing: '/en/members' });
			const report = await runCheck({ oldOrigin: old.origin, newOrigin: mutants.get(mutation.name)!.origin, routes: [mutation.route], browser, auth });
			if (process.env.SHOW_SUMMARY) process.stdout.write(`\n${summarize(report)}`);
			assert.deepEqual(redByRole(report), mutation.red, summarize(report));
			mutation.expect(report);
		}, [mutation.name]);
	}

	for (const mutation of MUTATIONS) {
		shard.test(`mutation "${mutation.name}" ${mutation.red.length ? `turns ${mutation.red.join(' + ')} red and nothing else` : 'stays green'}`, async () => {
			const report = await runCheck({ oldOrigin: old.origin, newOrigin: mutants.get(mutation.name)!.origin, routes: [mutation.route], browser, sourceDirs: { old: FIXTURE, new: sources.get(mutation.name)! } });
			if (process.env.SHOW_SUMMARY) process.stdout.write(`\n${summarize(report)}`);
			assert.deepEqual(redDimensions(report), [...mutation.red].sort(), summarize(report));
			mutation.expect(report);
		}, [mutation.name]);
	}
});
