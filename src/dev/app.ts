import { copyFile, cp, lstat, mkdir, readdir, readlink, rm, symlink } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** What the dev app links to in the app. */
const LINKED = ['.markless-local'];
/** The tools' caches under node_modules stay the dev app's own, so it never shares them with a build of the app; every package there is linked. */
const OWN_CACHES = new Set(['.vite', '.nitro', '.cache', '.vite-plus', '.markless']);
/** What it copies once: convert rewrites these in place. */
const COPIED = ['package.json', 'tsconfig.json', 'markless-router-env.d.ts'];
/** The app's hand-written code, copied on every start and on each save: linked, Vite would load it from the app and its imports of `lib/parts` would reach the app's parts, not the dev app's. */
export const SITE_DIR = 'lib/site';
/** What convert writes in the state directory and must stay the dev app's own; every other entry links to the app's. */
const OWN_STATE = new Set(['convert', 'dev', 'report.json', 'report.html', 'results.json', 'check-progress', 'shots', 'diffs', 'journeys']);

async function exists(path: string): Promise<boolean> {
	return lstat(path).then(
		() => true,
		() => false,
	);
}

async function link(target: string, at: string): Promise<void> {
	const want = relative(join(at, '..'), target);
	if (await exists(at)) {
		const isLink = (await lstat(at)).isSymbolicLink();
		if (isLink && (await readlink(at)) === want) return;
		await rm(at, { recursive: true, force: true });
	}
	await symlink(want, at);
}

/**
 * Lays out the app `dev` converts into, beside the app (`.migrate/dev/app`): the app's dependencies linked, its site code copied,
 * its plan and usage state linked, and each capture folder of `.migrate/convert` linked, so the dev app reads every
 * cached capture and adds to the same cache, while its pages, parts, server and convert report are its own and the
 * app's full convert is left as it was.
 */
export async function prepareDevApp(app: string, dev: string): Promise<void> {
	await mkdir(join(dev, '.migrate', 'convert'), { recursive: true });
	await mkdir(join(dev, 'lib'), { recursive: true });
	for (const path of LINKED) if (await exists(join(app, path))) await link(join(app, path), join(dev, path));
	if ((await exists(join(dev, 'node_modules'))) && (await lstat(join(dev, 'node_modules'))).isSymbolicLink()) await rm(join(dev, 'node_modules'));
	await mkdir(join(dev, 'node_modules'), { recursive: true });
	for (const name of await readdir(join(app, 'node_modules')).catch(() => [])) if (!OWN_CACHES.has(name)) await link(join(app, 'node_modules', name), join(dev, 'node_modules', name));
	for (const path of COPIED) if ((await exists(join(app, path))) && !(await exists(join(dev, path)))) await copyFile(join(app, path), join(dev, path));
	if ((await exists(join(dev, SITE_DIR))) && (await lstat(join(dev, SITE_DIR))).isSymbolicLink()) await rm(join(dev, SITE_DIR));
	if (await exists(join(app, SITE_DIR))) await cp(join(app, SITE_DIR), join(dev, SITE_DIR), { recursive: true, force: true });
	const state = join(app, '.migrate');
	for (const name of await readdir(state)) if (!OWN_STATE.has(name)) await link(join(state, name), join(dev, '.migrate', name));
	await mkdir(join(state, 'convert'), { recursive: true });
	for (const entry of await readdir(join(state, 'convert'), { withFileTypes: true })) if (entry.isDirectory() || entry.name === 'sources.json') await link(join(state, 'convert', entry.name), join(dev, '.migrate', 'convert', entry.name));
}
