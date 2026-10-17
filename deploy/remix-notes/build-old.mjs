// node build-old.mjs: writes deploy/remix-notes/.vercel-old/.vercel/output for the old app (source unchanged).
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const here = import.meta.dirname;
const app = join(here, 'old-app');
const out = join(here, '.vercel-old/.vercel/output');
const fn = join(out, 'functions/index.func');
const run = (cmd, args, cwd) => {
	const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
	if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
};

run('npx', ['remix', 'build'], app);
await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });
await cp(join(app, 'build'), join(fn, 'build'), { recursive: true });
await cp(join(app, 'public'), join(out, 'static'), { recursive: true });
await cp(join(here, 'old-function.mjs'), join(fn, 'index.mjs'));
await cp(join(process.env.HOME, '.mm-pg/remix-notes/seed.db'), join(fn, 'seed.db'));
const pkg = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'));
await writeFile(join(fn, 'package.json'), JSON.stringify({ name: 'remix-notes-old-function', private: true, type: 'module', dependencies: { ...pkg.dependencies, prisma: pkg.devDependencies.prisma } }, null, 2));
// The schema as written, plus the engine Vercel's Linux functions need: Prisma generates for the build machine only.
const schema = (await readFile(join(app, 'prisma/schema.prisma'), 'utf8')).replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  binaryTargets = ["native", "rhel-openssl-3.0.x"]');
await mkdir(join(fn, 'prisma'), { recursive: true });
await writeFile(join(fn, 'prisma/schema.prisma'), schema);
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], fn);
run('npx', ['prisma', 'generate'], fn);
await rm(join(fn, 'node_modules/prisma'), { recursive: true, force: true });
await rm(join(fn, 'node_modules/@prisma/engines'), { recursive: true, force: true });
await writeFile(join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, supportsResponseStreaming: true, environment: { SESSION_SECRET: 'super-duper-s3cret' } }));
await writeFile(join(out, 'config.json'), JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }] }));
