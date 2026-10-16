// Writes Vercel Build Output (v3) for the demo projects: `node deploy/build.ts cms|old|front`.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { DEMO } from './urls.ts';

const root = import.meta.dirname;
const examples = join(root, '../examples');

async function output(target: string): Promise<string> {
	const out = join(root, target, '.vercel/output');
	await rm(out, { recursive: true, force: true });
	await mkdir(out, { recursive: true });
	return out;
}

async function stripped(from: string, to: string): Promise<void> {
	const source = await readFile(from, 'utf8');
	await writeFile(to, stripTypeScriptTypes(source).replace(/from '(\.\/[^']+)\.ts'/g, "from '$1.js'"));
}

async function fn(out: string, files: Record<string, string>, entry: string): Promise<string> {
	const dir = join(out, 'functions/index.func');
	await mkdir(dir, { recursive: true });
	for (const [name, from] of Object.entries(files)) await stripped(from, join(dir, name));
	await writeFile(join(dir, 'index.mjs'), entry);
	await writeFile(join(dir, 'package.json'), '{ "type": "module" }\n');
	await writeFile(join(dir, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs24.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false }));
	return dir;
}

const everythingToFunction = { version: 3, routes: [{ src: '/(.*)', dest: '/index' }] };

async function cms(): Promise<void> {
	const out = await output('cms');
	await fn(out, { 'server.js': join(examples, 'cms/server.ts') }, "import { cmsHandler } from './server.js';\nexport default cmsHandler();\n");
	await writeFile(join(out, 'config.json'), JSON.stringify(everythingToFunction));
}

async function old(): Promise<void> {
	const app = join(examples, 'vite-site-old');
	const built = spawnSync(join(app, 'node_modules/.bin/vite'), ['build', '--logLevel', 'error'], { cwd: app, stdio: 'inherit' });
	if (built.status !== 0) throw new Error('vite build failed');
	const out = await output('old');
	const dir = await fn(
		out,
		{ 'serve.js': join(app, 'serve.ts'), 'middleware.js': join(app, 'middleware.ts') },
		`process.env.CMS_URL ??= ${JSON.stringify(DEMO.cms)};
import { join } from 'node:path';
import { handler } from './serve.js';
export default await handler(join(import.meta.dirname, 'dist'));
`,
	);
	await cp(join(app, 'dist'), join(dir, 'dist'), { recursive: true });
	await writeFile(join(out, 'config.json'), JSON.stringify(everythingToFunction));
}

async function front(): Promise<void> {
	const out = await output('front');
	await cp(join(root, 'front/static'), join(out, 'static'), { recursive: true });
	const state = join(examples, 'vite-site-markless/.migrate');
	await mkdir(join(out, 'static/_migrate'), { recursive: true });
	for (const file of ['report.html', 'report.json']) await cp(join(state, file), join(out, 'static/_migrate', file)).catch(() => undefined);
	await writeFile(join(out, 'config.json'), JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }] }));
}

const targets: Record<string, () => Promise<void>> = { cms, old, front };
const name = process.argv[2] ?? '';
if (!targets[name]) throw new Error(`usage: node deploy/build.ts ${Object.keys(targets).join('|')}`);
await targets[name]();
process.stdout.write(`built deploy/${name}/.vercel/output\n`);
