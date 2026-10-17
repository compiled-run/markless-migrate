// Serves a Markless app's build and restarts it whenever a new build lands: `node deploy/htmx-org/serve.ts <app-dir> <port>`.
import { type ChildProcess, spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const app = resolve(process.argv[2] ?? join(import.meta.dirname, '../../examples/htmx-org-markless'));
const port = process.argv[3] ?? '4411';
const stamp = join(app, '.output/nitro.json');
let child: ChildProcess | undefined;
let seen = 0;

async function tick(): Promise<void> {
	const mtime = (await stat(stamp).catch(() => undefined))?.mtimeMs ?? 0;
	if (!mtime || mtime === seen) return;
	seen = mtime;
	if (child) {
		const old = child;
		child = undefined;
		await new Promise((done) => {
			old.once('exit', done);
			old.kill();
		});
	}
	await new Promise((done) => setTimeout(done, 300));
	child = spawn(process.execPath, [join(app, '.output/server/index.mjs')], { cwd: app, env: { ...process.env, PORT: port, HOST: '127.0.0.1' }, stdio: 'inherit' });
	const mine = child;
	mine.once('exit', (code, signal) => {
		if (child !== mine) return;
		process.stdout.write(`server exited (${code ?? signal}); restarting\n`);
		seen = 0;
	});
	process.stdout.write(`serving the build of ${new Date(mtime).toISOString()} at http://127.0.0.1:${port}\n`);
}

setInterval(() => void tick(), 500);
process.on('SIGTERM', () => {
	child?.kill();
	process.exit(0);
});
