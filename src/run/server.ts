import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface AppServerOptions {
	readonly cwd: string;
	/** Shell command that serves the new app at `origin` and keeps running. */
	readonly serve: string;
	/** Shell command that builds the new app, run before every (re)start. */
	readonly build?: string;
	/** Runs before every build: writes generated files the build reads (the caching rules). */
	readonly beforeBuild?: () => Promise<void>;
	readonly origin: string;
	/** A file or directory the build writes; when its mtime changes the server restarts, so an agent's own build is served. */
	readonly restartOn?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly readyMs?: number;
	readonly log?: (line: string) => void;
}

export interface AppServer {
	/** Builds (when a build command is set), restarts and waits until the origin answers; returns the build's output when it failed. */
	refresh(): Promise<{ ok: boolean; output: string }>;
	stop(): Promise<void>;
}

function shell(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
	return new Promise((done) => {
		const child = spawn(command, { cwd, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout.on('data', (c) => (output += c));
		child.stderr.on('data', (c) => (output += c));
		child.on('close', (code) => done({ code, output }));
	});
}

async function answers(origin: string): Promise<boolean> {
	try {
		const response = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
		await response.body?.cancel();
		return response.status < 500;
	} catch {
		return false;
	}
}

const mtime = async (path: string) => (await stat(path).catch(() => undefined))?.mtimeMs ?? 0;

/** Runs the new app's server for `run`, so a sandboxed agent never has to keep one alive. */
export async function startAppServer(o: AppServerOptions): Promise<AppServer> {
	const env = o.env ?? process.env;
	let child: ChildProcess | undefined;
	let output = '';
	const kill = async () => {
		const current = child;
		child = undefined;
		if (!current || current.exitCode !== null) return;
		await new Promise<void>((done) => {
			current.once('exit', () => done());
			const group = (signal: NodeJS.Signals) => {
				try {
					process.kill(-current.pid!, signal);
				} catch {
					current.kill(signal);
				}
			};
			group('SIGTERM');
			setTimeout(() => group('SIGKILL'), 5000).unref();
		});
	};
	const start = async (): Promise<boolean> => {
		await kill();
		output = '';
		child = spawn(o.serve, { cwd: o.cwd, env, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
		child.stdout!.on('data', (c) => (output += c));
		child.stderr!.on('data', (c) => (output += c));
		const deadline = Date.now() + (o.readyMs ?? 60_000);
		while (Date.now() < deadline) {
			if (child.exitCode !== null) return false;
			if (await answers(o.origin)) return true;
			await new Promise((r) => setTimeout(r, 200));
		}
		return false;
	};
	const watched = o.restartOn ? resolve(o.cwd, o.restartOn) : undefined;
	let seen = watched ? await mtime(watched) : 0;
	let busy: Promise<unknown> = Promise.resolve();
	const refresh = async (): Promise<{ ok: boolean; output: string }> => {
		if (o.build) {
			await o.beforeBuild?.();
			const built = await shell(o.build, o.cwd, env);
			if (built.code !== 0) return { ok: false, output: `build \`${o.build}\` failed (exit ${built.code}):\n${built.output}` };
		}
		if (watched) seen = await mtime(watched);
		const up = await start();
		o.log?.(up ? `serving ${o.origin}` : `\`${o.serve}\` did not answer at ${o.origin}`);
		return up ? { ok: true, output: '' } : { ok: false, output: `\`${o.serve}\` did not answer at ${o.origin}:\n${output}` };
	};
	const timer = watched
		? setInterval(() => {
				busy = busy.then(async () => {
					const now = await mtime(watched);
					if (!now || now === seen) return;
					seen = now;
					const up = await start();
					o.log?.(up ? `restarted after ${o.restartOn} changed` : `\`${o.serve}\` did not answer after ${o.restartOn} changed`);
				});
			}, 500)
		: undefined;
	const first = await refresh();
	if (!first.ok) {
		if (timer) clearInterval(timer);
		await kill();
		throw new Error(first.output);
	}
	return {
		refresh: async () => {
			await busy;
			return refresh();
		},
		stop: async () => {
			if (timer) clearInterval(timer);
			await busy;
			await kill();
		},
	};
}
