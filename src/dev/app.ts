import { copyFile, cp, lstat, mkdir, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** What the dev app links to in the app. */
const LINKED = ['.markless-local'];
/** The tools' caches under node_modules stay the dev app's own, so it never shares them with a build of the app; every package there is linked. */
const OWN_CACHES = new Set(['.vite', '.nitro', '.cache', '.vite-plus', '.markless']);
/** What it copies once: convert rewrites these in place (the Vite config only when the old app's source is given). */
const COPIED = ['package.json', 'tsconfig.json', 'markless-router-env.d.ts', 'vite.config.ts', 'migrate-cache.ts'];
/** The app's hand-written code, copied on every start and on each save: linked, Vite would load it from the app and its imports of `lib/parts` would reach the app's parts, not the dev app's. */
export const SITE_DIR = 'lib/site';
/** The config `vp dev` runs the dev app with: the app's own, and the folders its files really are in. */
export const DEV_CONFIG = 'vite.dev.config.ts';

/**
 * Where the dev app's files really are: the dev app, the app, and its packages after every link (a node_modules linked
 * to another worktree, a package linked into pnpm's store, with the dependencies beside it there). Vite serves and loads only files under `server.fs.allow`, and
 * it resolves a package to its real path, so a package outside the app's folder failed to load in the dev server.
 */
async function readableRoots(app: string, dev: string): Promise<string[]> {
	const roots = new Set([await realpath(dev), await realpath(app)]);
	const modules = join(app, 'node_modules');
	const real = await realpath(modules).catch(() => undefined);
	if (!real) return [...roots];
	roots.add(real);
	const within = (path: string) => [...roots].some((r) => path === r || path.startsWith(r + sep));
	for (const name of await readdir(modules)) {
		const entries = name.startsWith('@') ? (await readdir(join(modules, name)).catch(() => [])).map((n) => join(name, n)) : [name];
		for (const entry of entries) {
			const target = await realpath(join(modules, entry)).catch(() => undefined);
			if (!target || within(target)) continue;
			// The outermost node_modules it is in: a pnpm store keeps a package's own dependencies beside it there.
			const store = target.indexOf(`${sep}node_modules${sep}`);
			roots.add(store >= 0 ? target.slice(0, store + `${sep}node_modules`.length) : target);
		}
	}
	return [...roots];
}

const devConfig = (allow: readonly string[]) => `// Written by markless-migrate dev: the app's config, with the folders its packages really are in readable.
import base from './vite.config.ts';

const allow: string[] = ${JSON.stringify(allow)};

export default async (env: object) => {
	const config = typeof base === 'function' ? await base(env) : base;
	return { ...config, server: { ...config.server, fs: { ...config.server?.fs, allow: [...(config.server?.fs?.allow ?? []), ...allow] } } };
};
`;

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
	for (const entry of await readdir(join(state, 'convert'), { withFileTypes: true })) if (entry.isDirectory()) await link(join(state, 'convert', entry.name), join(dev, '.migrate', 'convert', entry.name));
	await writeFile(join(dev, DEV_CONFIG), devConfig(await readableRoots(app, dev)));
}
