// Serves the Markless app's build and restarts it whenever a new build lands: `node deploy/serve-new.ts [port]`.
import { type ChildProcess, spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DEMO } from './urls.ts';

const app = join(import.meta.dirname, '../examples/vite-site-markless');
const port = process.argv[2] ?? '4300';
const stamp = join(app, '.output/nitro.json');
let child: ChildProcess | undefined;
let seen = 0;

function start(): void {
	child = spawn(process.execPath, [join(app, '.output/server/index.mjs')], {
		cwd: app,
		env: { ...process.env, PORT: port, HOST: '127.0.0.1', CMS_URL: process.env.CMS_URL ?? DEMO.cms },
		stdio: 'inherit',
	});
}

async function tick(): Promise<void> {
	const mtime = (await stat(stamp).catch(() => undefined))?.mtimeMs ?? 0;
	if (!mtime || mtime === seen) return;
	seen = mtime;
	if (child) {
		const old = child;
		await new Promise((done) => {
			old.once('exit', done);
			old.kill();
		});
	}
	await new Promise((done) => setTimeout(done, 300));
	start();
	process.stdout.write(`serving the build of ${new Date(mtime).toISOString()} at http://127.0.0.1:${port}\n`);
}

setInterval(() => void tick(), 500);
process.on('SIGTERM', () => {
	child?.kill();
	process.exit(0);
});
