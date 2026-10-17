// Writes Vercel Build Output (v3) for the RealWorld demo: `node deploy/realworld/build.ts api|old|new|front`.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { API_DIR, UPSTREAMS } from './paths.ts';
import { REALWORLD } from './urls.ts';

const root = import.meta.dirname;
const app = join(root, '../../examples/realworld-markless');

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

// The upstream Nitro + Prisma + libsql backend, unchanged, built for Vercel. Each function instance copies the seeded
// SQLite file to /tmp on a cold start, so writes last as long as that instance does.
async function api(): Promise<void> {
	run('bun', ['run', 'build'], API_DIR, { NITRO_PRESET: 'vercel' });
	const out = await output('api');
	await cp(join(API_DIR, '.vercel/output'), out, { recursive: true });
	const fn = join(out, 'functions/__fallback.func');
	await cp(join(root, 'conduit.db'), join(fn, 'conduit.db'));
	const pack = join(root, '.libsql');
	await rm(pack, { recursive: true, force: true });
	await mkdir(pack, { recursive: true });
	run('npm', ['pack', '@libsql/linux-x64-gnu@0.5.22', '--silent'], pack);
	run('tar', ['xzf', 'libsql-linux-x64-gnu-0.5.22.tgz'], pack);
	await cp(join(pack, 'package'), join(fn, 'node_modules/@libsql/linux-x64-gnu'), { recursive: true });
	const entry = join(fn, 'index.mjs');
	const original = await readFile(entry, 'utf8');
	await writeFile(join(fn, 'boot.mjs'), `import { copyFileSync, existsSync } from 'node:fs';
const db = '/tmp/conduit.db';
if (!existsSync(db)) copyFileSync(new URL('./conduit.db', import.meta.url), db);
process.env.DATABASE_URL = 'file:' + db;
process.env.JWT_SECRET ??= 'conduit-demo-secret';
`);
	await writeFile(entry, `import './boot.mjs';\n${original}`);
}

// The Angular app's own build, served as its _redirects says (unknown paths get index.html), /api sent to the backend.
async function old(): Promise<void> {
	const ng = join(UPSTREAMS, 'angular-realworld-example-app');
	run('npx', ['ng', 'build'], ng);
	const out = await output('old');
	await cp(join(ng, 'dist/angular-conduit/browser'), join(out, 'static'), { recursive: true });
	await writeFile(
		join(out, 'config.json'),
		JSON.stringify({
			version: 3,
			routes: [{ src: '/api/(.*)', dest: `${REALWORLD.api}/api/$1` }, { handle: 'filesystem' }, { src: '/(.*)', dest: '/index.html' }],
		}),
	);
}

async function next(): Promise<void> {
	run('npm', ['run', 'build'], app, { NITRO_PRESET: 'vercel', API_ORIGIN: REALWORLD.api });
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
	run(process.execPath, [join(root, '../../src/cli.ts'), 'config', '--old', REALWORLD.old, '--new', REALWORLD.new, '--vercel', join(dir, 'vercel.json')], app);
	run('vercel', ['build', '--prod', '--yes'], dir);
}

const targets: Record<string, () => Promise<void>> = { api, old, new: next, front };
const name = process.argv[2] ?? '';
if (!targets[name]) throw new Error(`usage: node deploy/realworld/build.ts ${Object.keys(targets).join('|')}`);
await targets[name]();
process.stdout.write(`built ${name}\n`);
