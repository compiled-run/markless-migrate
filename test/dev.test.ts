import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { convertInputArgs, prepareDevApp } from '../src/dev/app.ts';
import { diffRuns, formatDiffs, type Finding, type RouteProbe } from '../src/dev/findings.ts';
import { portsLoading, routeGlob, routesUsing, selectRoutes } from '../src/dev/routes.ts';

const PAGES = ['/', '/docs', '/docs/components/base/combobox', '/docs/components/radix/combobox', '/docs/components/base/select', '/blocks/sidebar-01'];
const MAP = { '/docs/components/base/combobox': ['base-ui/combobox', 'radix/dialog'], '/docs/components/radix/combobox': ['radix/popover'], '/docs/components/base/select': ['base-ui/select'], '/docs': ['radix/dialog'] };

test('a route glob takes * within one path segment and ** across them', () => {
	assert.ok(routeGlob('/docs/components/*/combobox').test('/docs/components/base/combobox'));
	assert.ok(!routeGlob('/docs/*').test('/docs/components/base'));
	assert.ok(routeGlob('/docs/**').test('/docs/components/base/combobox'));
	assert.ok(!routeGlob('/docs/components/base.x').test('/docs/components/baseXx'), 'a dot is a dot');
});

test('the routes a dev run takes: named ones, a glob, and the pages that load a part, in inventory order', () => {
	assert.deepEqual(selectRoutes({ route: ['/docs/components/base/select', '/docs'] }, PAGES, MAP), { routes: ['/docs', '/docs/components/base/select'], unknown: [] });
	assert.deepEqual(selectRoutes({ route: ['/nope'] }, PAGES, MAP).unknown, ['/nope']);
	assert.deepEqual(selectRoutes({ routes: '/docs/components/*/combobox' }, PAGES, MAP).routes, ['/docs/components/base/combobox', '/docs/components/radix/combobox']);
	assert.deepEqual(selectRoutes({ part: 'base-ui/combobox' }, PAGES, MAP).routes, ['/docs/components/base/combobox']);
	assert.deepEqual(selectRoutes({ part: 'parts/radix/dialog.ts'.replace(/^parts\//, '') }, PAGES, MAP).routes, ['/docs', '/docs/components/base/combobox']);
});

test('a shared module touches every port that needs it, through other modules too; the runtime touches every page', () => {
	const popper = portsLoading('popper');
	assert.ok(popper !== 'every' && popper.has('radix/popover'), 'Radix Popover needs popper');
	assert.equal(portsLoading('index'), 'every');
	assert.deepEqual(routesUsing('radix/popover', MAP, PAGES), ['/', '/docs/components/radix/combobox', '/blocks/sidebar-01'], 'a route the map does not know is taken');
	assert.deepEqual(routesUsing('reveal', MAP, ['/docs']), ['/docs']);
});

const finding = (control: string, kind = 'popup-anchor', actual = 'x'): Finding => ({ route: '/r', control, kind, width: 1280, expected: 'below its trigger', actual });

test("each run's findings against the last run's on the route: fixed, new, and the rest, keyed by where and what, not the values", () => {
	const first: RouteProbe[] = [{ route: '/r', tried: 3, ms: 9000, findings: [finding('combobox "a"'), finding('combobox "b"')] }];
	assert.deepEqual(diffRuns(first, undefined)[0]!.fixed, [], 'a first run has nothing fixed');
	const second: RouteProbe[] = [{ route: '/r', tried: 3, ms: 8000, findings: [finding('combobox "b"', 'popup-anchor', 'y'), finding('button "c"', 'dead')] }];
	const [d] = diffRuns(second, first);
	assert.deepEqual(d!.fixed.map((f) => f.control), ['combobox "a"']);
	assert.deepEqual(d!.added.map((f) => f.control), ['button "c"']);
	const text = formatDiffs([d!]);
	assert.match(text, /^\/r: 2 differences from the original, 3 controls used in 8 s \(1 fixed, 1 new\)$/m);
	assert.match(text, /^ {2}fixed {2}popup-anchor {2}combobox "a" at 1280 px: below its trigger {2}-> {2}x$/m);
	assert.match(text, /^ {2}NEW {4}dead {2}button "c"/m);
	assert.match(text, /^ {9}popup-anchor {2}combobox "b" at 1280 px: below its trigger {2}-> {2}y$/m);
});

test("the dev app links the app's packages, plan state and capture folders, copies its site code, and keeps its own pages, report and tool caches", async () => {
	const root = await mkdtemp(join(tmpdir(), 'dev-app-'));
	const app = join(root, 'app');
	const dev = join(app, '.migrate', 'dev', 'app');
	try {
		await mkdir(join(app, 'node_modules', '@markless', 'core'), { recursive: true });
		await mkdir(join(app, 'node_modules', '.vite'), { recursive: true });
		await mkdir(join(app, 'lib', 'site'), { recursive: true });
		await mkdir(join(app, '.migrate', 'convert', 'captures'), { recursive: true });
		await writeFile(join(app, '.migrate', 'inventory.json'), '{}');
		await writeFile(join(app, '.migrate', 'convert', 'report.json'), '{"full":true}');
		await writeFile(join(app, 'lib', 'site', 'parts.ts'), "import '../parts/index.ts';");
		await writeFile(join(app, 'package.json'), '{}');
		await prepareDevApp(app, dev);
		const linked = async (p: string) => (await lstat(join(dev, p))).isSymbolicLink();
		assert.ok(await linked('node_modules/@markless'));
		assert.ok(await linked('.migrate/inventory.json'));
		assert.ok(await linked('.migrate/convert/captures'));
		assert.equal(await readlink(join(dev, '.migrate', 'convert', 'captures')), join('..', '..', '..', '..', 'convert', 'captures'));
		assert.ok(!(await linked('lib/site')), 'site code is copied: linked, its imports of lib/parts would reach the app');
		assert.ok(!(await linked('node_modules')));
		await assert.rejects(lstat(join(dev, 'node_modules', '.vite')), 'Vite keeps its own cache in the dev app');
		await assert.rejects(lstat(join(dev, '.migrate', 'convert', 'report.json')), "the app's full report is not the dev app's");
		await assert.rejects(lstat(join(dev, '.migrate', 'dev')), 'the dev folder is not linked into itself');
		for (const cache of ['cache', 'slow-network', 'probe-reuse']) assert.ok(await linked(`.migrate/${cache}`), `the original's side kept in ${cache} is the app's, made before the first check`);
		await writeFile(join(app, 'lib', 'site', 'parts.ts'), 'changed');
		await prepareDevApp(app, dev);
		assert.equal(await readFile(join(dev, 'lib', 'site', 'parts.ts'), 'utf8'), 'changed', 'prepared again, it takes the site code as it is now');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a route converted alone gets the whole convert's page order, and nothing when the whole convert had none", () => {
	assert.deepEqual(convertInputArgs({ pageOrderFrom: 'https://old.example' }), ['--page-order-from', 'https://old.example']);
	assert.deepEqual(convertInputArgs({ pageOrderFrom: null }), []);
	assert.deepEqual(convertInputArgs(undefined), []);
});
