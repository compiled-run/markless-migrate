import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serve } from '../fixtures/vite-site/serve.ts';

const FIXTURE = new URL('../fixtures/vite-site', import.meta.url).pathname;
export const TRIAL_ROUTE = '/about/';
const FIND = '<h1>About the guides</h1>';
const REPLACE = '<h1>Meet the guides</h1>';

async function copy(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	await cp(FIXTURE, dir, { recursive: true, filter: (path) => !/\/(node_modules|dist)(\/|$)/.test(path.slice(FIXTURE.length)) });
	await symlink(join(FIXTURE, 'node_modules'), join(dir, 'node_modules'));
}

function build(dir: string): void {
	const result = spawnSync(join(dir, 'node_modules/.bin/vite'), ['build', '--logLevel', 'error'], { cwd: dir, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(`vite build failed in ${dir}:\n${result.stdout}${result.stderr}`);
}

export interface Trial {
	readonly old: string;
	readonly new: string;
	readonly route: string;
	readonly project: string;
	stop(): void;
}

/** The Vite fixture as the old app and a copy with one changed heading as the "new" app, both built and served. */
export async function startTrial(root: string): Promise<Trial> {
	const oldDir = join(root, 'old');
	const project = join(root, 'new');
	await copy(oldDir);
	await copy(project);
	const page = join(project, 'about/index.html');
	await writeFile(page, (await readFile(page, 'utf8')).replace(FIND, REPLACE));
	build(oldDir);
	build(project);
	await writeFile(join(project, 'README.md'), 'The new app. Build with `node_modules/.bin/vite build`; the server serves dist/ and picks up rebuilds without a restart.\n');
	const a = await serve(join(oldDir, 'dist'));
	const b = await serve(join(project, 'dist'));
	return {
		old: a.origin,
		new: b.origin,
		route: TRIAL_ROUTE,
		project,
		stop: () => {
			for (const s of [a.server, b.server]) {
				s.closeAllConnections();
				s.close();
			}
		},
	};
}

if (import.meta.main) {
	const root = resolve(process.argv[2] ?? 'trial');
	const trial = await startTrial(root);
	await writeFile(join(root, 'trial.json'), `${JSON.stringify({ old: trial.old, new: trial.new, route: trial.route, project: trial.project })}\n`);
	process.stdout.write(`${JSON.stringify({ old: trial.old, new: trial.new, route: trial.route, project: trial.project })}\n`);
	process.on('SIGTERM', () => {
		trial.stop();
		process.exit(0);
	});
}
