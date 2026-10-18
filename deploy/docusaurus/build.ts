// Writes Vercel Build Output (v3) for the Docusaurus demo: `node deploy/docusaurus/build.ts old|new|front`.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DOCUSAURUS } from './urls.ts';

const root = import.meta.dirname;
const app = join(root, '../../examples/docusaurus-markless');
const website = join(process.env.MM_UPSTREAMS ?? join(root, '../../../mm-upstreams'), 'docusaurus/website');

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): void {
	const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
}

async function* htmlFiles(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* htmlFiles(path);
		else if (entry.name.endsWith('.html')) yield path;
	}
}

// docusaurus.io as built by `BUILD_FAST=true docusaurus build --locale en`, unchanged except that the Google Analytics
// tags are taken out, so this copy does not report visits to docusaurus.io's own analytics property.
async function old(): Promise<void> {
	const out = join(root, 'old/.vercel/output');
	await rm(out, { recursive: true, force: true });
	await mkdir(out, { recursive: true });
	await cp(join(website, 'build'), join(out, 'static'), { recursive: true });
	for await (const file of htmlFiles(join(out, 'static'))) {
		const html = await readFile(file, 'utf8');
		const stripped = html
			.replace(/<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]*"><\/script>/g, '')
			.replace(/<script>function gtag\(\)\{dataLayer\.push\(arguments\)\}[^<]*<\/script>/g, '');
		if (stripped !== html) await writeFile(file, stripped);
	}
	await writeFile(
		join(out, 'config.json'),
		JSON.stringify({
			version: 3,
			routes: [{ src: '^/$', dest: '/index.html' }, { handle: 'filesystem' }, { src: '^/(.+?)/?$', dest: '/$1.html', check: true }, { src: '/.*', dest: '/404.html', status: 404 }],
		}),
	);
}

async function next(): Promise<void> {
	run('npm', ['run', 'build'], app, { NITRO_PRESET: 'vercel' });
}

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
	run(process.execPath, [join(root, '../../src/cli.ts'), 'config', '--old', DOCUSAURUS.old, '--new', DOCUSAURUS.new, '--vercel', join(dir, 'vercel.json'), '--new-build', '.vercel/output/static'], app);
	run('vercel', ['build', '--prod', '--yes'], dir);
}

const targets: Record<string, () => Promise<void>> = { old, new: next, front };
const name = process.argv[2] ?? '';
if (!targets[name]) throw new Error(`usage: node deploy/docusaurus/build.ts ${Object.keys(targets).join('|')}`);
await targets[name]();
process.stdout.write(`built ${name}\n`);
