import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withFailures } from '../src/check/compare.ts';
import { applyNavigation, compareSnaps, errorFailures, markedAttributes, planNavigation, readServed, scriptFailures, type NavigationResult } from '../src/check/nav-parity.ts';
import { flashFailures, themeFlashes } from '../src/check/swap-frames.ts';
import { DIMENSIONS, notCompared, type RouteResult } from '../src/check/types.ts';

const ORIGIN = 'http://127.0.0.1:4000';
const doc = (html: string, body: string, head = '') => `<!doctype html><html lang="en"${html}><head><link rel="stylesheet" href="/site.css">${head}</head><body data-markless-paths="${Math.random()}">${body}</body></html>`;

test('readServed: the router\'s own body attributes are not layout, links resolve to known routes either way round the trailing slash', () => {
	const known = new Set(['/', '/docs/', '/lib']);
	const a = readServed('/', doc(' data-theme="dark"', '<a href="/docs">Docs</a><a href="lib/">Lib</a><a href="https://elsewhere.dev/docs/">x</a><a href="#top">top</a>'), ORIGIN, known);
	const b = readServed('/docs/', doc('', '<a href="/">Home</a><script src="/lib.js"></script><script>go()</script>'), ORIGIN, known);
	const c = readServed('/lib', doc('', '<a href="/">Home</a>'), ORIGIN, known);
	assert.deepEqual(a.links, ['/docs/', '/lib']);
	assert.notEqual(a.layout, b.layout, 'data-theme on <html> is a layout of its own');
	assert.equal(b.layout, c.layout, 'a different data-markless-paths is the same layout');
	assert.notEqual(b.shape, c.shape, 'a page with its own script file is a shape of its own');
});

test('planNavigation: one destination per shape, reached from other layouts first, with a link the checker adds where no page links', () => {
	const known = new Set(['/', '/a/', '/b/', '/c/', '/lone/']);
	const served = [
		readServed('/', doc(' data-theme="dark"', '<a href="/a/">A</a><a href="/b/">B</a>'), ORIGIN, known),
		readServed('/a/', doc('', '<a href="/">Home</a><a href="/b/">B</a>'), ORIGIN, known),
		readServed('/b/', doc('', '<a href="/">Home</a><a href="/a/">A</a>'), ORIGIN, known),
		readServed('/c/', doc('', '<a href="/">Home</a>'), ORIGIN, known),
		readServed('/lone/', doc('', '', '<script src="/x.js"></script>'), ORIGIN, known),
	];
	const plan = planNavigation(served);
	const byRoute = new Map(plan.destinations.map((d) => [d.route, d]));
	assert.deepEqual([...byRoute.keys()].sort(), ['/', '/a/', '/lone/']);
	assert.deepEqual([...byRoute.get('/a/')!.represents].sort(), ['/b/', '/c/']);
	assert.deepEqual(byRoute.get('/a/')!.entries, [{ from: '/', injected: false }, { from: '/b/', injected: false }]);
	assert.deepEqual(byRoute.get('/')!.entries.map((e) => e.from), ['/a/']);
	assert.deepEqual(byRoute.get('/lone/')!.entries, [{ from: '/', injected: true }]);
	assert.deepEqual(planNavigation(served, { only: ['/c/'] }).destinations.map((d) => d.route), ['/c/']);
	assert.equal(planNavigation(served, { destinations: 1 }).destinations.length, 1);
});

const snap = (over: Partial<Parameters<typeof compareSnaps>[2]> = {}): Parameters<typeof compareSnaps>[2] => ({ url: '/docs/', html: ['lang=en'], body: [], head: ['title: Docs'], sheets: ['/site.css'], dom: ['body>main\t[]', 'body>main>p#clock\t"12:00:00"'], styles: { body: 'color: rgb(0, 0, 0); box: 0,0 1280x800' }, globals: ['lib'], scroll: '0,0', route: '{"file":"pages/docs.tsrx"}', ...over });

test('compareSnaps: names each part that differs, leaves out what changed on its own, groups computed styles', () => {
	assert.deepEqual(compareSnaps('/docs/', 'in place from /', snap(), snap()), []);
	const failures = compareSnaps('/docs/', 'in place from /', snap(), snap({ html: ['data-theme=dark', 'lang=en'], dom: ['body>main\t[]', 'body>main>p#clock\t"12:00:01"'], styles: { body: 'color: rgb(255, 255, 255); box: 0,0 1280x800' }, globals: [] }), new Set(['body>main>p#clock']));
	assert.deepEqual(failures.map((f) => f.check), ['in place from /: <html> attributes', 'in place from /: computed styles of body', "in place from /: globals the page's scripts define"]);
	assert.match(failures[0]!.actual, /data-theme=dark/);
	assert.equal(failures[1]!.expected, 'body: color: rgb(0, 0, 0)');
	assert.ok(failures.every((f) => f.dimension === 'navigation' && f.hint.length > 40));
});

test('scriptFailures: a file a fresh load runs must have run in the document; inline scripts are judged by what they do', () => {
	const fresh = [{ hash: 'h1', url: '/js/htmx.js', where: 'file' as const }, { hash: 'h2', url: '/docs/', where: 'inline' as const }, { hash: 'h3', url: '/site.js', where: 'file' as const }];
	assert.deepEqual(scriptFailures('/docs/', 'in place from /', fresh, ['h3']).map((f) => [f.check, f.expected]), [['in place from /: script files run', '/js/htmx.js']]);
	assert.deepEqual(scriptFailures('/docs/', 'in place from /', fresh, ['h1', 'h3']), []);
	assert.deepEqual(errorFailures('/docs/', 'x', ['known'], ['known', 'htmx is not defined']).map((f) => f.actual), ['htmx is not defined']);
});

const zero = { downloaded: 0, source: 0, executed: 0 };
const route = (path: string): RouteResult => withFailures({ route: path, ok: true, dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, 'pass'])) as RouteResult['dimensions'], failures: [], weight: { old: zero, new: zero }, visualDiffs: [], shots: [] }, []);

test('applyNavigation: destinations and the routes they stand for pass or fail; a route it never reached is skipped, and that is not "not compared"', () => {
	const nav: NavigationResult = {
		failures: [{ route: '/b/', dimension: 'navigation', check: 'in place from /: <html> attributes', expected: 'x', actual: 'y', hint: 'h' }],
		destinations: [{ route: '/a/', represents: ['/c/'] }, { route: '/b/', represents: [] }],
		pairs: [{ from: '/', to: '/a/', variant: 'plain', inPlace: true, failures: 0 }, { from: '/', to: '/b/', variant: 'plain', inPlace: true, failures: 1 }],
		shots: [],
		loads: 4,
		ms: 1,
	};
	const [a, b, c, d] = applyNavigation(['/a/', '/b/', '/c/', '/d/'].map(route), nav);
	assert.equal(a!.dimensions.navigation, 'pass');
	assert.deepEqual(a!.navigation, { from: ['/'] });
	assert.equal(b!.dimensions.navigation, 'fail');
	assert.equal(b!.ok, false);
	assert.deepEqual(c!.navigation, { from: [], representedBy: '/a/' });
	assert.equal(c!.dimensions.navigation, 'pass');
	assert.equal(d!.dimensions.navigation, 'skipped');
	assert.equal(notCompared(d!), false);
});

test("<html> attributes are compared without an old framework's runtime markers, which a port leaves out (docusaurus.io's data-has-hydrated and react-helmet's data-rh)", () => {
	const old = { html: ['lang=en', 'class=plugin-pages', 'data-theme=light', 'data-has-hydrated=true', 'data-rh=lang,dir,class,data-has-hydrated'] };
	assert.deepEqual(markedAttributes(old), ['class=plugin-pages', 'data-theme=light']);
});

test('a route not checked for an infrastructure failure stays not green when the navigation or shared layout adds to its failures (the summary counted four timed-out routes as green)', () => {
	const timedOut: RouteResult = { ...route('/apps'), ok: false, infrastructure: { cause: 'check timeout', message: 'the check of /apps did not finish within 600 s' } };
	assert.equal(withFailures(timedOut, []).ok, false);
	assert.equal(withFailures(route('/'), []).ok, true);
});

test('themeFlashes: only a frame unlike both the page before and the page after is a flash, and dark grey to near black is not one', () => {
	const frame = (classes: string[], backdrop: number[], scheme = 'dark') => ({ classes, scheme, backdrop });
	const before = frame(['dark', 'font'], [8, 8]);
	const after = frame(['dark', 'docs', 'font'], [3, 3]);
	const swap = (...frames: ReturnType<typeof frame>[]) => themeFlashes({ before, after, frames: frames.map((f) => ({ frame: f, count: 2 })) });
	assert.deepEqual(swap(before, frame(['dark', 'font'], [3, 3]), after), []);
	const flashed = swap(before, frame(['font'], [100, 100], 'normal'), after);
	assert.deepEqual(flashed.map((f) => [f.aspect, f.frames]), [['background', 2], ['color-scheme', 2], ['class', 2]]);
	const [failure] = flashFailures('/docs/', 'in place from /', { before, after, frames: [{ frame: frame(['font'], [8, 8]), count: 3 }] });
	assert.equal(failure?.check, 'in place from /: <html> class during the swap');
	assert.equal(failure?.actual, '3 frames showed none of the changing classes beside the 1 class every frame has (without dark)');
	assert.equal(failure?.expected, 'every frame shows the page before (class "dark" beside the 1 class every frame has) or after (class "dark docs" beside the 1 class every frame has)');
});
