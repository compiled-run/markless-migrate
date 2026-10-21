import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { extname, join, normalize } from 'node:path';

export const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

export interface App {
	readonly origin: string;
	stop(): Promise<void>;
}

export function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createNetServer();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
		});
	});
}

export function run(command: string, args: string[], cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));
		child.on('error', reject);
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed in ${cwd}:\n${output}`))));
	});
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** Serves a built single-page app's files, answering every other path with its index.html. */
export async function startStatic(dist: string): Promise<App> {
	const server: Server = createServer(async (req, res) => {
		const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
		let file = join(dist, path);
		if (!(await stat(file).then((s) => s.isFile(), () => false))) file = join(dist, 'index.html');
		res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
		res.end(await readFile(file));
	});
	const port = await freePort();
	await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${port}`, stop: () => new Promise<void>((done) => server.close(() => done())) };
}

/** Starts a built Markless app's Nitro node server and waits until it answers. */
export async function startNitro(dir: string): Promise<App> {
	const port = await freePort();
	const child: ChildProcess = spawn(process.execPath, [join(dir, '.output/server/index.mjs')], { cwd: dir, stdio: 'ignore', env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' } });
	const origin = `http://127.0.0.1:${port}`;
	for (const deadline = Date.now() + 30_000; ; ) {
		const up = await fetch(origin).then((r) => r.body?.cancel().then(() => true), () => false);
		if (up) break;
		if (Date.now() > deadline || child.exitCode !== null) throw new Error(`the Markless server in ${dir} did not start (${child.exitCode})`);
		await new Promise((done) => setTimeout(done, 100));
	}
	return { origin, stop: () => new Promise<void>((done) => (child.exitCode !== null ? done() : (child.once('exit', () => done()), child.kill()))) };
}

/** Builds a fixture unless its output is already there; set REBUILD=1 to force it. */
export async function buildFixture(dir: string, output: string, command: string[]): Promise<void> {
	if (!process.env.REBUILD && existsSync(join(dir, output))) return;
	await run(join(dir, 'node_modules/.bin', command[0]!), command.slice(1), dir);
}
