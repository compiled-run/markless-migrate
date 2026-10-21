import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { CONTENT, startCms, type Cms } from '../../fixtures/cms/server.ts';
import { defaultEnv } from '../../src/check/browser.ts';
import { captureRoute } from '../../src/check/capture.ts';
import { runCheck, loadsDiffer } from '../../src/check/run.ts';
import { loadSourceFacts } from '../../src/check/source-facts.ts';
import { summarize } from '../../src/check/summary.ts';
import { VIEWPORTS } from '../../src/check/types.ts';
import { discoverEndpoints, redirectTargets, UNKNOWN_PATH } from '../../src/check/endpoints.ts';
import { plan } from '../../src/plan/inventory.ts';
import { routeTargets } from '../../src/plan/routes.ts';
import { connect, firstText } from '../mcp-client.ts';
import { buildVite, failuresIn, OTHER_FONT, redByRole, redDimensions, sharded, startGuard, startStatic, SUITE_CONCURRENCY, writeAuth, type App, type Edit, type Mutation } from './harness.ts';
import type { Dimension, Report } from '../../src/check/types.ts';

const ROUTES = ['/', '/about/', '/fr/', '/ar/', '/old-about', '/missing', '/feed.xml', '/robots.txt', '/manifest.json', '/sitemap.xml'];
const SOURCE = join(import.meta.dirname, '../../fixtures/vite-site');
const FEED_ITEM = (await readFile(join(SOURCE, 'public/feed.xml'), 'utf8')).match(/\t\t<item>\s*<title>New route[\s\S]*?<\/item>\n/)![0];

const failure = failuresIn;

const MUTATIONS: Mutation[] = [
	{
		name: 'title',
		route: '/about/',
		edits: [{ file: 'about/index.html', find: '<title>About | Lighthouse Walks</title>', replace: '<title>About us | Lighthouse Walks</title>' }],
		red: ['seo'],
		expect: (report) => {
			const [f] = failure(report, 'seo');
			assert.equal(f?.check, 'title');
			assert.equal(f?.expected, '"About | Lighthouse Walks"');
			assert.equal(f?.actual, '"About us | Lighthouse Walks"');
		},
	},
	{
		name: 'hreflang',
		route: '/',
		edits: [{ file: 'index.html', find: '<link rel="alternate" hreflang="fr" href="https://lighthouse.example/fr/" />', replace: '' }],
		red: ['seo'],
		expect: (report) => {
			const [f] = failure(report, 'seo');
			assert.equal(f?.check, 'hreflang:fr');
			assert.equal(f?.actual, '(absent)');
			assert.match(f!.hint, /hreflang/);
		},
	},
	{
		name: 'heading',
		route: '/about/',
		edits: [{ file: 'about/index.html', find: '<h1>About the guides</h1>', replace: '<h1>Meet the guides</h1>' }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const aria = failure(report, 'rendered').find((f) => f.check === 'accessibility tree');
			assert.match(aria!.expected, /heading "About the guides"/);
			assert.match(aria!.actual, /heading "Meet the guides"/);
			assert.ok(failure(report, 'rendered').some((f) => f.check === 'visible text' && f.actual === 'Meet the guides'));
			assert.match(failure(report, 'visual')[0]!.actual, /near .*heading "Meet the guides"/);
			assert.equal(aria!.where, 'old about/index.html:29 renders heading "About the guides"; new about/index.html:29 renders heading "Meet the guides"');
			assert.equal(aria!.old?.path, join(SOURCE, 'about/index.html'));
		},
	},
	{
		name: 'alt-text',
		route: '/',
		edits: [{ file: 'index.html', find: ' alt="Cliff path leading to a white lighthouse"', replace: '' }],
		red: ['a11y', 'rendered'],
		expect: (report) => {
			const f = failure(report, 'rendered').find((x) => x.check === 'accessibility tree');
			assert.match(f!.expected, /img "Cliff path leading to a white lighthouse"/);
			assert.ok(failure(report, 'a11y').some((x) => x.check.startsWith('axe image-alt:') && x.expected === '0 elements'));
		},
	},
	{
		name: 'font-size',
		route: '/',
		edits: [{ file: 'src/style.css', find: '.lede { font-size: 18px;', replace: '.lede { font-size: 21px;' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const css = failure(report, 'css');
			assert.ok(css.length >= 1);
			assert.ok(css.every((f) => /paragraph "Six guided routes/.test(f.check) && f.expected.startsWith('font-size: 18px;') && f.actual.startsWith('font-size: 21px;')), JSON.stringify(css, null, 1));
			assert.ok(css.every((f) => /^Old rule: `\.lede` \(.+:\d+:\d+\) sets font-size with `18px`/.test(f.hint)), JSON.stringify(css.map((f) => f.hint), null, 1));
			// Vite builds no CSS source maps, so the rule is found in the old source stylesheet by selector and property.
			assert.ok(css.every((f) => /^old src\/style\.css:\d+ `\.lede` sets font-size; new index\.html:\d+ renders it$/.test(f.where ?? '') && f.old?.how === 'source stylesheet'), JSON.stringify(css.map((f) => [f.where, f.old]), null, 1));
		},
	},
	{
		name: 'missing-image',
		route: '/',
		edits: [{ file: 'public/hero.png', remove: true }],
		red: ['assets', 'visual'],
		expect: (report) => {
			const assets = failure(report, 'assets');
			assert.ok(assets.some((f) => f.check === 'image /hero.png' && f.actual.startsWith('404')), JSON.stringify(assets, null, 1));
			assert.ok(assets.some((f) => f.check.startsWith('image #2') && f.expected === '640x320' && f.actual === 'broken'));
		},
	},
	{
		name: 'status-code',
		route: '/missing',
		edits: [{ file: 'public/serve.json', find: '"notFoundStatus": 404', replace: '"notFoundStatus": 200' }],
		red: ['http'],
		expect: (report) => {
			const [f] = failure(report, 'http');
			assert.equal(f?.check, 'status');
			assert.equal(f?.expected, '404 /missing');
			assert.equal(f?.actual, '200 /missing');
			assert.match(f!.hint, /soft 404/);
		},
	},
	{
		name: 'extra-js',
		route: '/',
		edits: [
			{
				file: 'src/main.ts',
				append: `\nconst table = [${Array.from({ length: 4000 }, (_, i) => (i * 7919) % 10007).join(',')}];\nlet sum = 0;\nfor (const n of table) sum += n;\n(globalThis as { checksum?: number }).checksum = sum;\n`,
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
		route: '/',
		edits: [{ file: 'index.html', find: '<p>Page rendered at <time', replace: '<p>Page built at <time' }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const text = failure(report, 'rendered').find((f) => f.check === 'visible text');
			assert.match(text!.expected, /^Page rendered at \d{4}-/);
			assert.match(text!.actual, /^Page built at \d{4}-/);
		},
	},
	{
		name: 'renamed-public-file',
		route: '/',
		edits: [
			{ file: 'public/logo-2024.png', renameTo: 'public/logo-2025.png' },
			{ file: 'index.html', find: 'src="/logo-2024.png"', replace: 'src="/logo-2025.png"' },
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
		route: '/about/',
		edits: [{ file: 'public/inter-latin.woff2', copyFrom: OTHER_FONT }],
		red: ['assets', 'visual'],
		expect: (report) => {
			const fonts = failure(report, 'assets').filter((f) => f.check.startsWith('rendered font of'));
			assert.ok(fonts.length >= 1, JSON.stringify(failure(report, 'assets'), null, 1));
			assert.ok(fonts.every((f) => /^web font Inter.* \(sha256 \w{12}\)$/.test(f.expected) && /^web font Geist/.test(f.actual)), JSON.stringify(fonts, null, 1));
		},
	},
	{
		name: 'font-renamed',
		route: '/about/',
		edits: [
			{ file: 'src/style.css', find: "font-family: 'Inter';", replace: "font-family: 'Lighthouse Sans';" },
			{ file: 'src/style.css', find: "font-family: 'Inter', system-ui", replace: "font-family: 'Lighthouse Sans', system-ui" },
		],
		red: [],
		expect: () => {},
	},
	{
		name: 'hover-color',
		route: '/',
		edits: [{ file: 'src/style.css', find: '.menu-button:hover { background: #17527a; }', replace: '.menu-button:hover { background: #5a2d82; }' }],
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
		route: '/',
		edits: [{ file: 'src/style.css', find: '--paper: #0f1a22;', replace: '--paper: #1a1a1a;' }],
		red: ['css'],
		expect: (report) => {
			const css = failure(report, 'css');
			assert.ok(css.length >= 1 && css.every((f) => f.check.startsWith('computed style in prefers-color-scheme: dark')), JSON.stringify(css, null, 1));
			assert.ok(css.some((f) => /reading --paper from `:root` inside @media \(prefers-color-scheme:dark\)/.test(f.hint)), JSON.stringify(css.map((f) => f.hint), null, 1));
		},
	},
	{
		name: 'breakpoint',
		route: '/',
		edits: [{ file: 'src/style.css', find: '@media (max-width: 600px)', replace: '@media (max-width: 640px)' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const checks = [...new Set([...failure(report, 'css'), ...failure(report, 'visual')].map((f) => f.check.replace(/: .*$/, '')))];
			assert.deepEqual(checks.sort(), ['computed style in viewport width 601px', 'screenshot in viewport width 601px']);
			assert.ok(failure(report, 'css').some((f) => /Old rule: `header` \(.+\) sets (flex-direction|align-items) with/.test(f.hint)), JSON.stringify(failure(report, 'css').map((f) => f.hint), null, 1));
		},
	},
	{
		name: 'container',
		route: '/',
		edits: [{ file: 'src/style.css', find: '@container (min-width: 480px)', replace: '@container (min-width: 520px)' }],
		red: ['css', 'visual'],
		expect: (report) => {
			const checks = [...new Set([...failure(report, 'css'), ...failure(report, 'visual')].map((f) => f.check.replace(/: .*$/, '')))];
			assert.deepEqual(checks.sort(), ['computed style in container width 480px', 'screenshot in container width 480px']);
			assert.ok(failure(report, 'css').some((f) => /`\.ro(ute|ast)` inside @container \((min-width:|width>=)480px\) \(.+\) sets display with `grid`/.test(f.hint)), JSON.stringify(failure(report, 'css').map((f) => f.hint), null, 1));
		},
	},
	{
		name: 'removed-label',
		route: '/about/',
		edits: [{ file: 'about/index.html', find: '<label for="email">Email</label>', replace: '<span>Email</span>' }],
		red: ['a11y', 'behaviour', 'rendered', 'visual'],
		expect: (report) => {
			const axe = failure(report, 'a11y').find((f) => f.check.startsWith('axe label:'));
			assert.ok(axe, JSON.stringify(failure(report, 'a11y'), null, 1));
			assert.equal(axe.expected, '0 elements');
			assert.match(axe.actual, /#email/);
		},
	},
	{
		name: 'tab-order',
		route: '/',
		edits: [{ file: 'index.html', find: '<a href="/about/">About</a>', replace: '<a href="/about/" tabindex="1">About</a>' }],
		red: ['a11y'],
		expect: (report) => {
			const f = failure(report, 'a11y').find((x) => x.check.startsWith('focus order'));
			assert.equal(f?.check, 'focus order (Tab), first difference at stop 1');
			assert.ok(failure(report, 'a11y').some((x) => x.check.startsWith('axe tabindex:')));
			assert.match(f!.expected, /^1\. link "Home" → 2\. link "About"/);
			assert.match(f!.actual, /^1\. link "About" → 2\. link "Home"/);
		},
	},
	{
		name: 'button-as-div',
		route: '/',
		edits: [{ file: 'index.html', find: '<button type="button" data-book>Book a walk</button>', replace: '<div data-book>Book a walk</div>' }],
		red: ['a11y', 'behaviour', 'rendered', 'visual'],
		expect: (report) => {
			const order = failure(report, 'a11y').find((f) => f.check.startsWith('focus order'));
			assert.match(order!.expected, /button "Book a walk"/);
			assert.doesNotMatch(order!.actual, /Book a walk/);
		},
	},
	{
		name: 'landmark',
		route: '/about/',
		edits: [
			{ file: 'about/index.html', find: '<nav aria-label="Main">', replace: '<div aria-label="Main">' },
			{ file: 'about/index.html', find: '</nav>', replace: '</div>' },
		],
		red: ['a11y', 'css', 'rendered', 'visual'],
		expect: (report) => {
			const landmarks = failure(report, 'a11y').filter((f) => f.check === 'landmarks');
			assert.deepEqual(landmarks.map((f) => [f.expected, f.actual]), [['navigation "Main"', '(absent)']]);
		},
	},
	{
		name: 'reduced-motion',
		route: '/about/',
		edits: [{ file: 'src/style.css', find: '@media (prefers-reduced-motion: no-preference) {', replace: '@media all {' }],
		red: ['a11y', 'css'],
		expect: (report) => {
			const motion = failure(report, 'a11y').find((f) => f.check === 'motion under prefers-reduced-motion: reduce');
			assert.equal(motion?.expected, 'no running animations');
			assert.match(motion!.actual, /^running: .*glow/);
		},
	},
	{
		name: 'date-format',
		route: '/fr/',
		edits: [{ file: 'fr/index.html', find: '27 octobre 2026', replace: 'October 27, 2026' }],
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
		edits: [{ file: 'public/serve.json', find: '"negotiate": { "/": { "en": "", "fr": "/fr/", "ar": "/ar/" } },', replace: '' }],
		red: ['i18n'],
		expect: (report) => {
			const failures = failure(report, 'i18n');
			assert.deepEqual(failures.map((f) => [f.check, f.expected, f.actual]), [
				['page a browser sending Accept-Language: ar lands on', '/ar/', '/'],
				['page a browser sending Accept-Language: fr lands on', '/fr/', '/'],
			]);
		},
	},
	{
		name: 'rtl',
		route: '/ar/',
		edits: [{ file: 'ar/index.html', find: '<html lang="ar" dir="rtl">', replace: '<html lang="ar">' }],
		red: ['css', 'i18n', 'visual'],
		expect: (report) => {
			const i18n = failure(report, 'i18n').map((f) => [f.check, f.expected, f.actual]);
			assert.deepEqual(i18n, [
				['<html dir>', 'rtl', '(absent)'],
				['text direction of the page', 'rtl', 'ltr'],
			]);
		},
	},
	{
		name: 'counter-by-two',
		route: '/',
		edits: [{ file: 'src/main.ts', find: 'Number(count.textContent) + 1', replace: 'Number(count.textContent) + 2' }],
		red: ['a11y', 'behaviour'],
		expect: (report) => {
			const click = failure(report, 'behaviour').find((f) => f.check === 'click button "Book a walk"');
			assert.ok(click, JSON.stringify(failure(report, 'behaviour'), null, 1));
			assert.match(click.expected, /announced: output: 1/);
			assert.match(click.actual, /announced: output: 2/);
			assert.ok(failure(report, 'a11y').some((f) => f.check === 'press Space on button "Book a walk"'));
		},
	},
	{
		name: 'form-path',
		route: '/about/',
		edits: [{ file: 'about/index.html', find: 'action="/api/subscribe"', replace: 'action="/api/signup"' }],
		red: ['behaviour'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'behaviour');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(f!.check, 'fill textbox "Email" and submit with button "Subscribe"');
			assert.match(f!.expected, /requests: POST \/api\/subscribe \{email: string\}/);
			assert.match(f!.actual, /requests: POST \/api\/signup \{email: string\}/);
		},
	},
	{
		name: 'menu-broken',
		route: '/',
		edits: [{ file: 'src/main.ts', find: "menu?.toggleAttribute('hidden', !open);", replace: '' }],
		red: ['a11y', 'behaviour'],
		expect: (report) => {
			const click = failure(report, 'behaviour').find((f) => f.check === 'click button "More"');
			assert.ok(click, JSON.stringify(failure(report, 'behaviour'), null, 1));
			assert.match(click.expected, /appears: .*link "Our guides"/);
			assert.ok(failure(report, 'a11y').some((f) => f.check === 'press Enter on button "More"'));
		},
	},
	{
		name: 'tip-label',
		route: '/',
		edits: [{ file: 'index.html', find: 'Walker’s tip:', replace: 'Walkers’ tip:' }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const text = failure(report, 'rendered').find((f) => f.check === 'visible text');
			assert.match(text!.expected, /^Walker’s tip: \S/);
			assert.equal(text!.actual, text!.expected.replace('Walker’s', 'Walkers’'), 'the random tip is the same on both sides, so only the label differs');
		},
	},
	{
		name: 'network-query-field',
		route: '/',
		edits: [{ file: 'serve.ts', find: 'fields=title,summary,slug', replace: 'fields=title,summary' }],
		red: ['network'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'network');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(f!.check, 'server request changed');
			assert.match(f!.expected, /^server GET 127\.0\.0\.1:\d+\/walks\/news\?fields=title,summary,slug&locale=en$/);
			assert.match(f!.actual, /^server GET 127\.0\.0\.1:\d+\/walks\/news\?fields=title,summary&locale=en$/);
		},
	},
	{
		name: 'network-endpoint',
		route: '/',
		edits: [{ file: 'src/main.ts', find: '/walks/hours', replace: '/walks/opening-hours' }],
		red: ['network'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'network');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(f!.check, 'browser request to a different endpoint');
			assert.match(f!.expected, /^browser GET 127\.0\.0\.1:\d+\/walks\/hours$/);
			assert.match(f!.actual, /\/walks\/opening-hours$/);
		},
	},
	{
		name: 'network-twice',
		route: '/',
		edits: [{ file: 'src/main.ts', find: "void loadHours();", replace: 'void loadHours().then(loadHours);' }],
		red: ['network'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'network');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.match(f!.check, /^browser request GET 127\.0\.0\.1:\d+\/walks\/hours$/);
			assert.match(f!.expected, /^1 time: /);
			assert.equal(f!.actual, '2 times');
		},
	},
	{
		name: 'network-server-request',
		route: '/',
		edits: [{ file: 'serve.ts', find: "const settings = await cmsJson<{ tagline: string }>('/walks/settings');", replace: `const settings = { tagline: '${CONTENT.walks!.settings.tagline}' };` }],
		red: ['network'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'network');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(f!.check, 'server request missing');
			assert.match(f!.expected, /^server GET 127\.0\.0\.1:\d+\/walks\/settings$/);
			assert.match(f!.hint, /hardcoded/);
		},
	},
	{
		name: 'feed-item',
		route: '/feed.xml',
		edits: [{ file: 'public/feed.xml', find: FEED_ITEM, replace: '' }],
		red: ['data'],
		expect: (report) => {
			const [f, ...rest] = failure(report, 'data');
			assert.equal(rest.length, 0, JSON.stringify(rest, null, 1));
			assert.equal(report.routes[0]!.endpoint, 'feed');
			assert.deepEqual([f!.check, f!.expected, f!.actual], ['feed item missing', '"New route: Porthgwarra to Land’s End" (https://lighthouse.example/news/porthgwarra-route)', '(absent)']);
		},
	},
	{
		name: 'robots',
		route: '/robots.txt',
		edits: [{ file: 'public/robots.txt', find: 'Allow: /', replace: 'Disallow: /about/' }],
		red: ['seo'],
		expect: (report) => {
			assert.deepEqual(failure(report, 'seo').map((f) => [f.check, f.expected, f.actual]), [['robots.txt line', 'Allow: /', 'Disallow: /about/']]);
		},
	},
	{
		name: 'json-field',
		route: '/manifest.json',
		edits: [{ file: 'public/manifest.json', find: '"short_name"', replace: '"shortName"' }],
		red: ['data'],
		expect: (report) => {
			assert.deepEqual(failure(report, 'data').map((f) => [f.check, f.expected, f.actual]), [['JSON field short_name missing', '"Walks"', '(absent)'], ['JSON field shortName not in the old response', '(absent)', '"Walks"']]);
		},
	},
	{
		name: 'second-of-two-alike',
		route: '/',
		edits: [{ file: 'index.html', find: 'with seals below the path.</p><p class="meta">Guided</p>', replace: 'with seals below the path.</p><p class="meta">Self-guided</p>' }],
		red: ['rendered', 'visual'],
		expect: (report) => {
			const text = failure(report, 'rendered').find((f) => f.check === 'visible text' && f.expected === 'Guided');
			assert.equal(text?.where, 'old index.html:57 renders paragraph "Guided"; new index.html:57 renders paragraph "Self-guided"', 'the second of two paragraphs written alike, not the first');
			assert.equal(text?.old?.column, 114);
		},
	},
	{
		name: 'redirect-dropped',
		route: '/old-about',
		check: { routes: [], redirects: ['/old-about'] },
		edits: [{ file: 'public/serve.json', find: '"redirects": { "/old-about": "/about/" },', replace: '"redirects": {},' }],
		red: ['http'],
		expect: (report) => {
			assert.equal(report.routes[0]!.endpoint, 'redirect');
			assert.deepEqual(failure(report, 'http').map((f) => [f.check, f.expected, f.actual]), [['redirect chain hop 1', '301 /old-about', '404 /old-about'], ['redirect chain hop 2', '200 /about/', '(absent)']]);
		},
	},
	{
		name: 'json-item',
		route: '/manifest.json',
		edits: [{ file: 'public/manifest.json', find: '\t\t{ "src": "/logo-2024.png", "sizes": "32x32", "type": "image/png" },\n', replace: '' }],
		red: ['data'],
		expect: (report) => {
			assert.deepEqual(failure(report, 'data').map((f) => [f.check, f.expected, f.actual]), [['JSON item icons[src=/logo-2024.png] missing', '{"src":"/logo-2024.png","sizes":"32x32","type":"image/png"}', '(absent)']]);
		},
	},
];

const WALL = 'lighthouse-staging-pass';
const CLI = join(import.meta.dirname, '../../src/cli.ts');
process.env.FIXTURE_MEMBER_PASSWORD = 'night-route';

function cli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<{ status: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, ...env } });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('exit', (code) => resolve({ status: code ?? -1, stdout, stderr }));
	});
}

interface AuthMutation {
	readonly name: string;
	readonly route: string;
	readonly edits: readonly Edit[];
	readonly red: Readonly<Record<'anonymous' | 'member' | 'admin', readonly Dimension[]>>;
	readonly expect: (report: Report) => void;
	/** Check with the old app's source scan, so its auth guards are known. */
	readonly withSource?: boolean;
}

const authFailure = (report: Report, role: string) => [...report.routes.filter((r) => r.role === role).flatMap((r) => r.failures), ...(report.logins ?? []).filter((l) => l.role === role).flatMap((l) => l.failures)].filter((f) => f.dimension === 'auth');

const AUTH_MUTATIONS: AuthMutation[] = [
	{
		name: 'auth-denied-hidden',
		route: '/admin/',
		withSource: true,
		edits: [{ file: 'serve.ts', find: "res.writeHead(403, { 'content-type': TYPES['.html'] })", replace: "res.writeHead(404, { 'content-type': TYPES['.html'] })" }],
		red: { anonymous: [], member: ['http'], admin: [] },
		expect: (report) => {
			const member = report.routes.find((r) => r.role === 'member')!;
			assert.deepEqual(member.failures.map((f) => [f.dimension, f.check, f.expected, f.actual]), [['http', 'status', '403 /admin/', '404 /admin/']], 'a 404 on a guarded route is a denial, so both apps turn the member away and the page is compared');
		},
	},
	{
		name: 'auth-endpoint',
		route: '/api/me',
		edits: [{ file: 'serve.ts', find: '{ name: user.name, role: user.role }', replace: "{ name: user.name, role: user.role === 'admin' ? 'staff' : user.role }" }],
		red: { anonymous: [], member: [], admin: ['data'] },
		expect: (report) => {
			assert.deepEqual(report.routes.map((r) => [r.role, r.route, r.endpoint]), [['anonymous', '/api/me', 'json'], ['member', '/api/me', 'json'], ['admin', '/api/me', 'json']]);
			const [f] = report.routes.find((r) => r.role === 'admin')!.failures;
			assert.deepEqual([f!.check, f!.expected, f!.actual], ['JSON field role', '"admin"', '"staff"']);
		},
	},
	{
		name: 'auth-anonymous-members',
		route: '/members/',
		edits: [{ file: 'middleware.ts', find: "pathname.startsWith('/members/') || ", replace: '' }],
		red: { anonymous: ['auth', 'http'], member: [], admin: [] },
		expect: (report) => {
			const [f] = authFailure(report, 'anonymous');
			assert.deepEqual([f!.check, f!.expected, f!.actual], ['access as anonymous', 'denied: 302 to /login/ (200)', 'let in: 200']);
		},
	},
	{
		name: 'auth-admin-for-members',
		route: '/admin/',
		edits: [{ file: 'middleware.ts', find: " && user.role !== 'admin'", replace: " && user.role === 'nobody'" }],
		red: { anonymous: [], member: ['auth', 'http'], admin: [] },
		expect: (report) => {
			const [f] = authFailure(report, 'member');
			assert.deepEqual([f!.check, f!.expected, f!.actual], ['access as member', 'denied: 403', 'let in: 200']);
		},
	},
	{
		name: 'auth-login-target',
		route: '/members/',
		edits: [{ file: 'middleware.ts', find: "redirect('/login/')", replace: 'redirect(`/login/?next=${encodeURIComponent(pathname)}`)' }],
		red: { anonymous: ['auth', 'http'], member: [], admin: [] },
		expect: (report) => {
			const [f] = authFailure(report, 'anonymous');
			assert.deepEqual([f!.check, f!.expected, f!.actual], ['where anonymous is sent', '/login/', '/login/?next=%2Fmembers%2F']);
		},
	},
	{
		name: 'auth-session-cookie',
		route: '/members/',
		edits: [{ file: 'middleware.ts', find: 'Path=/; HttpOnly; SameSite=Lax', replace: 'Path=/; SameSite=Strict' }],
		red: { anonymous: [], member: ['auth'], admin: [] },
		expect: (report) => {
			const [f] = authFailure(report, 'member');
			assert.equal(f!.check, 'session cookie session after signing in as member');
			assert.equal(f!.actual, 'session: Path=/; host-only; readable by scripts; not Secure; SameSite=Strict; session');
		},
	},
];

describe('vite multi-page site', { concurrency: SUITE_CONCURRENCY }, () => {
	const shard = sharded();
	let browser: Browser;
	let cms: Cms;
	let otherCms: Cms;
	let old: App;
	let twin: App;
	let twinOnOtherCms: App;
	const mutants = new Map<string, App>();
	const sources = new Map<string, string>();
	let walled: App;
	let walledAssets: App;
	let walledWrites: App;

	before(async () => {
		browser = await chromium.launch();
		cms = await startCms();
		otherCms = await startCms({ walks: { ...CONTENT.walks!, news: CONTENT.walks!.news.map((n) => ({ ...n, title: `${n.title} (staging copy)` })), hours: { today: 'Booking office closed for staff training' } } });
		const all = [...MUTATIONS, ...AUTH_MUTATIONS].filter((m) => shard.mutants.has(m.name));
		const [dist, ...dists] = await Promise.all([buildVite('original'), buildVite('rebuild'), ...all.map((m) => buildVite(m.name, m.edits))]);
		[old, twin, twinOnOtherCms, walled, walledAssets, walledWrites] = await Promise.all([startStatic(dist!, cms.origin), startStatic(dists[0]!, cms.origin), startStatic(dists[0]!, otherCms.origin), startStatic(dist!, cms.origin, { BOT_WALL: WALL }), startStatic(dist!, cms.origin, { BOT_WALL: WALL, BOT_WALL_SCOPE: 'assets' }), startStatic(dist!, cms.origin, { BOT_WALL: WALL, BOT_WALL_SCOPE: 'writes' })]);
		const apps = await Promise.all(all.map((_, i) => startStatic(dists[i + 1]!, cms.origin)));
		all.forEach((m, i) => mutants.set(m.name, apps[i]!));
		all.forEach((m, i) => sources.set(m.name, dirname(dists[i + 1]!)));
	});

	after(async () => {
		await Promise.all([old?.stop(), twin?.stop(), twinOnOtherCms?.stop(), walled?.stop(), walledAssets?.stop(), walledWrites?.stop(), ...[...mutants.values()].map((m) => m.stop())]);
		await Promise.all([cms?.stop(), otherCms?.stop()]);
		await browser?.close();
	});

	shard.test('an independent rebuild of the same source is green on every route', async () => {
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: ROUTES, browser });
		process.stdout.write(`\n${summarize(report)}`);
		assert.deepEqual(redDimensions(report), [], summarize(report));
	});

	shard.test('with the browser frozen two OLD loads are identical; unfrozen, the clock and Math.random make them differ', async () => {
		const [a, b] = await Promise.all([captureRoute(browser, old.origin, '/', VIEWPORTS), captureRoute(browser, old.origin, '/', VIEWPORTS)]);
		assert.equal(loadsDiffer(a, b), false);
		assert.ok(a.pages.desktop!.text.some((line) => /^Walker’s tip: \S/.test(line)));
		const unfrozen = defaultEnv(old.origin, { freeze: false });
		const [c, d] = [await captureRoute(browser, old.origin, '/', VIEWPORTS, unfrozen), await captureRoute(browser, old.origin, '/', VIEWPORTS, unfrozen)];
		assert.notDeepEqual(c.pages.desktop!.text.find((line) => line.startsWith('Page rendered at')), d.pages.desktop!.text.find((line) => line.startsWith('Page rendered at')));
	});

	shard.test('the network contract records server-rendered and browser requests, and the fields the page shows', async () => {
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: ['/'], browser });
		const network = report.routes[0]!.network!;
		assert.deepEqual(network.server, { old: true, new: true });
		assert.ok(network.old.some((line) => /^server GET 127\.0\.0\.1:\d+\/walks\/news\?fields=title,summary,slug&locale=en$/.test(line)), network.old.join('\n'));
		assert.ok(network.old.some((line) => /^browser GET 127\.0\.0\.1:\d+\/walks\/hours$/.test(line)), network.old.join('\n'));
		assert.deepEqual(network.old, network.new);
		assert.deepEqual(report.routes[0]!.noise!.noisy, [], 'nothing on this static page varies once the browser is frozen');
	});

	shard.test('recorded data: record from OLD, replay to both apps, so a NEW app on another CMS sees the same content', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'mm-data-'));
		const live = await runCheck({ oldOrigin: old.origin, newOrigin: twinOnOtherCms.origin, routes: ['/'], browser });
		assert.ok(redDimensions(live).includes('rendered'), summarize(live));
		const recorded = await runCheck({ oldOrigin: old.origin, newOrigin: twinOnOtherCms.origin, routes: ['/'], browser, data: { mode: 'record', dir } });
		assert.equal(recorded.data?.mode, 'record');
		const file = JSON.parse(await readFile(join(dir, 'root.json'), 'utf8')) as { responses: { side: string; url: string }[] };
		assert.deepEqual(file.responses.map((r) => `${r.side} ${new URL(r.url).pathname}`).sort(), ['browser /walks/hours', 'server /walks/news', 'server /walks/settings']);
		const before = otherCms.requests.length;
		const replayed = await runCheck({ oldOrigin: old.origin, newOrigin: twinOnOtherCms.origin, routes: ['/'], browser, data: { mode: 'replay', dir } });
		assert.deepEqual(redDimensions(replayed), [], summarize(replayed));
		assert.deepEqual(otherCms.requests.slice(before), [], 'the other CMS is never asked while replaying');
	});

	shard.test('writes to an origin that is neither staging nor localhost are held back, compared unsent, and never reach it', async () => {
		const guardOld = await startGuard(old.origin);
		const guardNew = await startGuard(mutants.get('form-path')!.origin);
		const { facts: source } = await loadSourceFacts(join(import.meta.dirname, '../../fixtures/vite-site'));
		const form = source!.writes.find((w) => w.path === '/api/subscribe')!;
		try {
			const report = await runCheck({ oldOrigin: guardOld.origin, newOrigin: guardNew.origin, routes: ['/about/'], browser, source: source! });
			assert.equal(guardOld.writes.length + guardNew.writes.length, 0, [...guardOld.writes, ...guardNew.writes].join(', '));
			assert.equal(report.writes, 'held back');
			assert.deepEqual(redDimensions(report), ['behaviour'], summarize(report));
			const [f] = failure(report, 'behaviour');
			assert.match(f!.expected, /requests: would POST \/api\/subscribe \{email: string\}/);
			assert.match(f!.actual, /requests: would POST \/api\/signup \{email: string\}/);
			assert.ok(report.routes[0]!.writes!.some((w) => w.line === 'would POST /api/subscribe {email: string}' && !w.sent && w.reason === `writes per the source: form at ${form.handler.file}:${form.handler.line}`), JSON.stringify(report.routes[0]!.writes));

			const staged = await runCheck({ oldOrigin: guardOld.origin, newOrigin: guardNew.origin, routes: ['/about/'], browser, staging: { old: true, new: true } });
			assert.equal(staged.writes, 'sent');
			assert.ok(guardOld.writes.includes('POST /api/subscribe'), 'marked staging, the write is sent, so the guard does see writes');
		} finally {
			await Promise.all([guardOld.stop(), guardNew.stop()]);
		}
	}, ['form-path']);

	shard.test('check --all takes every source route and the robots.txt, sitemap, feed and manifest the old app serves, compared as data', async () => {
		const inventory = await plan({ origin: old.origin, source: SOURCE, browser });
		const targets = routeTargets(inventory);
		for (const r of inventory.source!.routes) assert.ok(targets.pages.includes(r.path), `${r.path} is checked`);
		assert.deepEqual(targets.needsSample, []);
		const endpoints = await discoverEndpoints(defaultEnv(old.origin), targets.pages, targets.endpoints);
		assert.deepEqual(endpoints, ['/feed.xml', '/manifest.json', '/robots.txt', '/sitemap.xml']);
		const redirects = redirectTargets(targets.pages, inventory.source?.redirects);
		assert.deepEqual(redirects, ['/about', '/admin', '/ar', '/fr', '/login', '/members', '/old-about']);
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: twin.origin, routes: [UNKNOWN_PATH], endpoints, redirects: ['/about', '/old-about'], browser });
		assert.deepEqual(report.routes.map((r) => [r.route, r.endpoint]), [[UNKNOWN_PATH, undefined], ['/feed.xml', 'feed'], ['/manifest.json', 'json'], ['/robots.txt', 'robots'], ['/sitemap.xml', 'sitemap'], ['/about', 'redirect'], ['/old-about', 'redirect']]);
		assert.ok(report.routes[0]!.failures.length === 0 && (await fetch(new URL(UNKNOWN_PATH, old.origin))).status === 404, 'the not-found page, with its 404, is compared as a page');
		assert.deepEqual(redDimensions(report), [], summarize(report));
	});

	shard.test('plan finds the sitemap and crawled routes and both locales', async () => {
		const inventory = await plan({ origin: old.origin, source: join(import.meta.dirname, '../../fixtures/vite-site'), browser });
		assert.deepEqual(inventory.routes.map((r) => r.route), ['/', '/about/', '/ar/', '/fr/']);
		assert.deepEqual(inventory.routes[0]!.foundIn, ['crawl', 'hreflang', 'sitemap']);
		assert.deepEqual(inventory.locales, ['ar', 'en', 'fr']);
		assert.deepEqual(inventory.localeRouting, { prefixes: ['ar', 'fr'], negotiation: { ar: '/ar/', en: '/', fr: '/fr/' } });
		assert.equal(inventory.routes[1]!.seo.title, 'About | Lighthouse Walks');
		assert.ok(inventory.routes[0]!.assets.some((a) => a.url === '/hero.png' && a.contentType === 'image/png'));
		assert.equal(inventory.source?.framework, 'vite');
	});

	shard.test('an agent calling check_route over MCP gets the failure, and status remembers it', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'mm-e2e-'));
		const client = await connect(cwd);
		try {
			const result = await client.callTool({ name: 'check_route', arguments: { old: old.origin, new: mutants.get('title')!.origin, route: '/about/', responsiveness: false } });
			const structured = result.structuredContent as { ok: boolean; failures: { check: string; actual: string }[] };
			assert.equal(structured.ok, false);
			assert.deepEqual(structured.failures.map((f) => [f.check, f.actual]), [['title', '"About us | Lighthouse Walks"']]);
			assert.match(firstText(result), /fix: +Set the same <title>/);
			assert.match(firstText(await client.callTool({ name: 'status', arguments: {} })), /red +\/about\/ +\[seo\]/);
			assert.ok(JSON.parse(await readFile(join(cwd, '.migrate', 'report.json'), 'utf8')).routes[0].failures.length === 1);
		} finally {
			await client.close();
		}
	}, ['title']);

	shard.test('check --open writes the visual report, boxes the changed heading and opens the page', async () => {
		const cwd = await realpath(await mkdtemp(join(tmpdir(), 'mm-open-')));
		const opener = join(cwd, 'opener.sh');
		await writeFile(opener, '#!/bin/sh\necho "$1" > "$(dirname "$0")/opened.txt"\n', { mode: 0o755 });
		const cli = join(import.meta.dirname, '../../src/cli.ts');
		const child = spawn(process.execPath, [cli, 'check', '--old', old.origin, '--new', mutants.get('heading')!.origin, '--route', '/about/', '--open', '--no-responsiveness'], { cwd, env: { ...process.env, MARKLESS_MIGRATE_OPENER: opener } });
		const result = { stdout: '', stderr: '', status: -1 };
		child.stdout.on('data', (chunk) => (result.stdout += chunk));
		child.stderr.on('data', (chunk) => (result.stderr += chunk));
		result.status = await new Promise<number>((done) => child.on('exit', (code) => done(code ?? -1)));
		assert.equal(result.status, 1, result.stderr);
		const html = join(cwd, '.migrate', 'report.html');
		assert.match(result.stdout, new RegExp(`Visual report: ${html}`));
		const opened = async (): Promise<string> => readFile(join(cwd, 'opened.txt'), 'utf8').catch(() => new Promise((done) => setTimeout(done, 50)).then(opened));
		assert.equal((await opened()).trim(), html, 'the detached opener got the report path');
		const page = await browser.newPage();
		try {
			await page.goto(`file://${html}`);
			const failing = page.locator('.shot', { has: page.locator('.badge.fail') });
			assert.ok((await failing.count()) >= 1);
			assert.ok((await failing.first().locator('.side figure').first().locator('rect').count()) >= 1);
			assert.ok(await page.getByRole('cell', { name: /The accessibility tree differs/ }).first().isVisible());
		} finally {
			await page.close();
		}
	}, ['heading']);

	shard.test('plan --source writes a starter auth file from the guards, and check --auth with it checks every role green', async () => {
		const cwd = await realpath(await mkdtemp(join(tmpdir(), 'mm-auth-cli-')));
		const fixture = join(import.meta.dirname, '../../fixtures/vite-site');
		const planned = await cli(['plan', '--old', old.origin, '--source', fixture], cwd);
		assert.equal(planned.status, 0, planned.stderr);
		assert.match(planned.stdout, /Roles to check \(from auth guards\): signed-in, admin, and anonymous; login at \/login\//);
		assert.match(planned.stdout, /Wrote .*auth\.json: set the credentials/);
		const starter = JSON.parse(await readFile(join(cwd, '.migrate', 'auth.json'), 'utf8'));
		assert.deepEqual(starter.guards, ['/members/: signed-in (middleware.ts:28)', '/admin/: admin (middleware.ts:28)'], 'the admin check runs only under /admin/');
		assert.deepEqual(starter.roles.admin.login.at(-1), { wait: '!/login/' });
		const credentials = { SIGNED_IN_EMAIL: 'sam@lighthouse.example', SIGNED_IN_PASSWORD: 'night-route', ADMIN_EMAIL: 'kit@lighthouse.example', ADMIN_PASSWORD: 'godrevy' };
		const checked = await cli(['check', '--old', old.origin, '--new', twin.origin, '--route', '/members/', '--route', '/admin/', '--auth', join(cwd, '.migrate', 'auth.json'), '--no-responsiveness'], cwd, credentials);
		assert.equal(checked.status, 4, `every route it checked is green; a --route run is partial, never overall green\n${checked.stdout}\n${checked.stderr}`);
		assert.match(checked.stdout, /As anonymous:\npass +\/members\//);
		assert.match(checked.stdout, /As signed-in:\n {6}sign-in: same session cookies \(session: Path=\/; host-only; HttpOnly; not Secure; SameSite=Lax; session\)\npass +\/members\//);
		assert.match(checked.stdout, /6 of 6 route checks \(route and role\) green\.\nPartial run: 2 of \d+ routes checked\./);
		const html = await readFile(join(cwd, '.migrate', 'report.html'), 'utf8');
		assert.deepEqual([...html.matchAll(/<h2>As ([\w-]+)<\/h2>/g)].map((m) => m[1]), ['anonymous', 'signed-in', 'admin']);
		assert.match(await readFile(join(cwd, '.migrate', 'auth', 'admin.new.json'), 'utf8'), /"name": "session"/);
	});

	shard.test('a Cloudflare-style challenge stops the route over the CLI and MCP, and --header or a cookie with the staging pass gets through', async () => {
		const cwd = await realpath(await mkdtemp(join(tmpdir(), 'mm-wall-')));
		const stopped = await cli(['check', '--old', walled.origin, '--new', twin.origin, '--route', '/about/', '--no-responsiveness'], cwd);
		assert.equal(stopped.status, 1);
		assert.match(stopped.stdout, /BLOCKED +\/about\/ +blocked by Cloudflare on OLD \(403, header cf-mitigated: challenge\): use a staging URL or pass --header\/--cookie with a bypass token/);
		assert.match(stopped.stdout, /0 of 1 routes green, 1 blocked by bot protection\./);
		const passed = await cli(['check', '--old', walled.origin, '--new', twin.origin, '--route', '/about/', '--header', `x-staging-pass: ${WALL}`, '--no-responsiveness'], cwd);
		assert.equal(passed.status, 4, passed.stdout);
		const client = await connect(cwd);
		try {
			const blocked = await client.callTool({ name: 'check_route', arguments: { old: twin.origin, new: walled.origin, route: '/', responsiveness: false } });
			assert.deepEqual((blocked.structuredContent as { blocked: { message: string }[] }).blocked.map((b) => b.message.split(':')[0]), ['blocked by Cloudflare on NEW (403, header cf-mitigated']);
			assert.match(firstText(await client.callTool({ name: 'status', arguments: {} })), /blocked +\//);
			const through = await client.callTool({ name: 'check_route', arguments: { old: twin.origin, new: walled.origin, route: '/', cookie: [`staging_pass=${WALL}`], responsiveness: false } });
			assert.equal((through.structuredContent as { ok: boolean }).ok, true, firstText(through));
		} finally {
			await client.close();
		}
	});

	shard.test('accept turns one failure, by its stable id, into an accepted difference; status shows the reason; an accept nothing matches is stale', async () => {
		const cwd = await realpath(await mkdtemp(join(tmpdir(), 'mm-accept-')));
		const args = ['check', '--old', old.origin, '--new', mutants.get('title')!.origin, '--route', '/about/', '--no-responsiveness'];
		const first = await cli(args, cwd);
		assert.equal(first.status, 1, first.stderr);
		const id = first.stdout.match(/seo \(desktop\): title  \[([0-9a-f]{10})\]|seo: title  \[([0-9a-f]{10})\]/)?.slice(1).find(Boolean);
		assert.ok(id, first.stdout);
		assert.equal((await cli(['accept', id], cwd)).status, 2, 'a reason is required');
		const accepted = await cli(['accept', id, '--reason', 'Marketing renamed the page', '--by', 'Jack'], cwd);
		assert.equal(accepted.status, 0, accepted.stderr);
		const entry = JSON.parse(await readFile(join(cwd, '.migrate', 'accepted.json'), 'utf8')).accepted[0];
		assert.deepEqual([entry.route, entry.dimension, entry.check, entry.match, entry.by, entry.id], ['/about/', 'seo', 'title', { expected: '"About | Lighthouse Walks"', actual: '"About us | Lighthouse Walks"' }, 'Jack', id]);
		const second = await cli(args, cwd);
		assert.equal(second.status, 4, second.stdout);
		assert.match(second.stdout, new RegExp(`pass +/about/ +\\(1 accepted\\)`));
		assert.match(second.stdout, new RegExp(`accepted seo(?: \\(desktop\\))?: title  \\[${id}\\]\n +reason: +Marketing renamed the page \\(Jack, \\d{4}-\\d\\d-\\d\\d\\)`), 'the same failure has the same id on the next run');
		assert.match(second.stdout, /1 of 1 routes green, 1 accepted difference\./);
		assert.match(await readFile(join(cwd, '.migrate', 'report.html'), 'utf8'), /<span class="badge accepted">accepted<\/span>/);
		const listed = await cli(['status'], cwd);
		assert.match(listed.stdout, /green +\/about\/  \(\d+ of \d+ interactions exercised\)  \(1 accepted\)\n +accepted seo: title: Marketing renamed the page/);
		const stale = await cli(['check', '--old', old.origin, '--new', twin.origin, '--route', '/about/', '--no-responsiveness'], cwd);
		assert.equal(stale.status, 4, stale.stdout);
		assert.match(stale.stdout, /Accepted differences that no longer match anything \(remove them from \.migrate\/accepted\.json\):\n +\/about\/ seo: title +\(Marketing renamed the page\)/);
	}, ['title']);

	shard.test('a wall that answers only the assets, or only a journey\'s form post, stops the route as blocked instead of turning it red', async () => {
		const assets = await runCheck({ oldOrigin: old.origin, newOrigin: walledAssets.origin, routes: ['/'], browser });
		assert.deepEqual(assets.routes.map((r) => [r.blocked?.side, r.blocked?.vendor, r.failures.length]), [['new', 'Cloudflare', 0]], summarize(assets));
		assert.match(summarize(assets), /BLOCKED +\/ +blocked by Cloudflare on NEW \(403, header cf-mitigated: challenge\)/);
		const writes = await runCheck({ oldOrigin: walledWrites.origin, newOrigin: twin.origin, routes: ['/about/'], browser });
		assert.deepEqual(writes.routes.map((r) => [r.blocked?.side, r.blocked?.vendor, r.failures.length]), [['old', 'Cloudflare', 0]], summarize(writes));
	});

	shard.test('plan stops at a bot wall with what to do, and gets through with the bypass header', async () => {
		await assert.rejects(plan({ origin: walled.origin, browser }), /plan was stopped by Cloudflare on \/ \(403, header cf-mitigated: challenge\): plan a staging URL, or pass the bypass/);
		const through = await plan({ origin: walled.origin, browser, headers: { 'x-staging-pass': WALL } });
		assert.deepEqual(through.routes.map((r) => r.route), ['/', '/about/', '/ar/', '/fr/']);
	});

	for (const mutation of AUTH_MUTATIONS) {
		shard.test(`auth mutation "${mutation.name}" turns ${Object.entries(mutation.red).filter(([, d]) => d.length).map(([role, d]) => `${d.join(' + ')} red as ${role}`).join(', ')} and nothing else`, async () => {
			const auth = await writeAuth({ loginRoute: '/login/', member: 'sam@lighthouse.example', admin: 'kit@lighthouse.example', landing: '/members/' });
			const source = mutation.withSource ? (await loadSourceFacts(SOURCE)).facts : undefined;
			const report = await runCheck({ oldOrigin: old.origin, newOrigin: mutants.get(mutation.name)!.origin, routes: [mutation.route], browser, auth, ...(source ? { source } : {}) });
			if (process.env.SHOW_SUMMARY) process.stdout.write(`\n${summarize(report)}`);
			assert.deepEqual(redByRole(report), mutation.red, summarize(report));
			mutation.expect(report);
		}, [mutation.name]);
	}

	for (const mutation of MUTATIONS) {
		shard.test(`mutation "${mutation.name}" ${mutation.red.length ? `turns ${mutation.red.join(' + ')} red and nothing else` : 'stays green'}`, async () => {
			const report = await runCheck({ oldOrigin: old.origin, newOrigin: mutants.get(mutation.name)!.origin, routes: [mutation.route], browser, sourceDirs: { old: SOURCE, new: sources.get(mutation.name)! }, ...mutation.check });
			if (process.env.SHOW_SUMMARY) process.stdout.write(`\n${summarize(report)}`);
			assert.deepEqual(redDimensions(report), [...mutation.red].sort(), summarize(report));
			mutation.expect(report);
		}, [mutation.name]);
	}
});
