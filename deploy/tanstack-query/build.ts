// Writes Vercel Build Output (v3) for the kitchen-sink demo: `node deploy/tanstack-query/build.ts old|new|front`.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KITCHEN_SINK } from './urls.ts';

const root = import.meta.dirname;
const app = join(root, '../../examples/tanstack-query-markless');
const upstream = join(process.env.MM_UPSTREAMS ?? join(root, '../../../mm-upstreams'), 'kitchen-sink-react-query');

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): void {
	const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
}

async function output(target: string): Promise<string> {
	const out = join(root, target, '.vercel/output');
	await rm(out, { recursive: true, force: true });
	await mkdir(out, { recursive: true });
	return out;
}

// The example's own Vite build, served as a single-page host serves it: files as they are, every other path gets index.html.
async function old(): Promise<void> {
	run('bash', [join(root, 'fetch-old.sh')], root);
	const out = await output('old');
	await cp(join(upstream, 'dist'), join(out, 'static'), { recursive: true });
	await writeFile(join(out, 'config.json'), JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index.html' }] }));
}

// The port as a Nitro server function. Each tab's data lives in that function instance's memory, as the old app's lived in the tab.
async function next(): Promise<void> {
	run('npx', ['vp', 'build'], app, { NITRO_PRESET: 'vercel' });
}

// The front door: what `markless-migrate config --vercel` writes from .migrate/switched.json, plus the report.
async function front(): Promise<void> {
	const dir = join(root, 'front');
	const publicDir = join(dir, 'public/_migrate');
	await mkdir(publicDir, { recursive: true });
	for (const file of ['report.html', 'report.json']) await cp(join(app, '.migrate', file), join(publicDir, file)).catch(() => undefined);
	// Only the screenshots this report uses; .migrate/shots keeps every earlier run's too.
	const report = await readFile(join(app, '.migrate/report.html'), 'utf8').catch(() => '');
	await rm(join(publicDir, 'shots'), { recursive: true, force: true });
	await mkdir(join(publicDir, 'shots'), { recursive: true });
	for (const shot of new Set(report.match(/shots\/[A-Za-z0-9._-]+/g) ?? [])) await cp(join(app, '.migrate', shot), join(publicDir, shot)).catch(() => undefined);
	await cp(join(root, 'index.html'), join(publicDir, 'index.html'));
	run(process.execPath, [join(root, '../../src/cli.ts'), 'config', '--old', KITCHEN_SINK.old, '--new', KITCHEN_SINK.new, '--vercel', join(dir, 'vercel.json'), '--new-build', '.vercel/output/static'], app);
	run('vercel', ['build', '--prod', '--yes'], dir);
}

const targets: Record<string, () => Promise<void>> = { old, new: next, front };
const name = process.argv[2] ?? '';
if (!targets[name]) throw new Error(`usage: node deploy/tanstack-query/build.ts ${Object.keys(targets).join('|')}`);
await targets[name]();
process.stdout.write(`built ${name}\n`);
