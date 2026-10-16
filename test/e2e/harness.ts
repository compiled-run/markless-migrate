import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import type { Server } from 'node:http';
import { serve } from '../../fixtures/vite-site/serve.ts';
import type { Dimension, Report } from '../../src/check/types.ts';

export const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const MUTANTS = join(ROOT, '.mutants');

export type Edit =
	| { readonly file: string; readonly find: string; readonly replace: string }
	| { readonly file: string; readonly remove: true }
	| { readonly file: string; readonly append: string }
	| { readonly file: string; readonly write: string }
	| { readonly file: string; readonly renameTo: string };

export interface Mutation {
	readonly name: string;
	readonly route: string;
	readonly edits: readonly Edit[];
	readonly red: readonly Dimension[];
	readonly expect: (report: Report) => void;
}

export interface App {
	readonly origin: string;
	stop(): Promise<void>;
}

function run(command: string, args: string[], cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));
		child.on('error', reject);
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed in ${cwd}:\n${output}`))));
	});
}

async function applyEdits(dir: string, edits: readonly Edit[]): Promise<void> {
	for (const edit of edits) {
		const path = join(dir, edit.file);
		if ('remove' in edit) {
			await rm(path);
			continue;
		}
		if ('renameTo' in edit) {
			await rename(path, join(dir, edit.renameTo));
			continue;
		}
		if ('write' in edit) {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, edit.write);
			continue;
		}
		const source = await readFile(path, 'utf8');
		if ('append' in edit) {
			await writeFile(path, source + edit.append);
			continue;
		}
		if (!source.includes(edit.find)) throw new Error(`mutation edit not applied: ${JSON.stringify(edit.find)} not found in ${edit.file}`);
		await writeFile(path, source.replace(edit.find, edit.replace));
	}
}

async function copyFixture(fixture: string, name: string, edits: readonly Edit[]): Promise<string> {
	const source = join(ROOT, 'fixtures', fixture);
	const dir = join(MUTANTS, `${fixture}-${name}`);
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	await cp(source, dir, { recursive: true, filter: (path) => !/\/(node_modules|dist|\.next)(\/|$)/.test(path.slice(source.length)) });
	await symlink(join(source, 'node_modules'), join(dir, 'node_modules'));
	await applyEdits(dir, edits);
	return dir;
}

export async function buildVite(name: string, edits: readonly Edit[] = []): Promise<string> {
	const dir = await copyFixture('vite-site', name, edits);
	await run(join(dir, 'node_modules/.bin/vite'), ['build', '--logLevel', 'error'], dir);
	return join(dir, 'dist');
}

export async function startStatic(dist: string): Promise<App> {
	const { server, origin } = await serve(dist);
	return { origin, stop: () => closeServer(server) };
}

function closeServer(server: Server): Promise<void> {
	server.closeAllConnections();
	return new Promise((done) => server.close(() => done()));
}

export async function buildNext(name: string, edits: readonly Edit[] = []): Promise<string> {
	const dir = await copyFixture('next-app', name, edits);
	await run(join(dir, 'node_modules/.bin/next'), ['build'], dir);
	return dir;
}

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
		});
	});
}

async function waitForReady(origin: string, child: ChildProcess): Promise<void> {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
		try {
			const response = await fetch(origin, { redirect: 'manual' });
			await response.body?.cancel();
			return;
		} catch {
			await new Promise((done) => setTimeout(done, 100));
		}
	}
	throw new Error(`${origin} did not answer within 30s`);
}

export async function startNext(dir: string): Promise<App> {
	for (let attempt = 0; ; attempt++) {
		const port = await freePort();
		const child = spawn(join(dir, 'node_modules/.bin/next'), ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: dir, stdio: 'ignore', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
		const origin = `http://127.0.0.1:${port}`;
		try {
			await waitForReady(origin, child);
		} catch (error) {
			child.kill();
			if (attempt < 2) continue;
			throw error;
		}
		return {
			origin,
			stop: () =>
				new Promise<void>((done) => {
					if (child.exitCode !== null) return done();
					child.once('exit', () => done());
					child.kill();
				}),
		};
	}
}

export function failuresIn(report: Report, dimension: Dimension) {
	return report.routes.flatMap((r) => r.failures).filter((f) => f.dimension === dimension);
}

export async function limited<T, R>(items: readonly T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await task(items[i]!);
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	return results;
}

export function redDimensions(report: Report): Dimension[] {
	return [...new Set(report.routes.flatMap((r) => r.failures.map((f) => f.dimension)))].sort();
}
