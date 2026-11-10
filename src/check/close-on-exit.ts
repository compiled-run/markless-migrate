// Every browser and child process a check starts is closed when the process ends, by a signal or an uncaught error too:
// a signal gives each open one CLOSE_MS to close as usual, then kills what is left; an exit can only kill. SIGKILL is past reach.
import { execFileSync } from 'node:child_process';
import { constants } from 'node:os';

/** One browser or process the check started and has not yet closed. */
export interface Closable {
	/** Its usual close, given CLOSE_MS when the process is signalled. */
	readonly close: () => Promise<unknown>;
	/** Synchronous and final: run when the close took too long, or when the process is already exiting. */
	readonly kill: () => void;
}

export const CLOSE_MS = 5_000;
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const open = new Set<Closable>();
let installed = false;
let draining = false;

function killAll(): void {
	for (const one of [...open]) {
		open.delete(one);
		try {
			one.kill();
		} catch {}
	}
}

function onSignal(signal: NodeJS.Signals): void {
	const code = 128 + (constants.signals[signal] ?? 0);
	if (draining) {
		killAll();
		process.exit(code);
	}
	draining = true;
	const closed = Promise.all([...open].map((one) => one.close().catch(() => {})));
	const late = new Promise<void>((done) => setTimeout(done, CLOSE_MS).unref());
	void Promise.race([closed, late]).then(() => {
		killAll();
		process.exit(code);
	});
}

function install(): void {
	if (installed) return;
	installed = true;
	process.on('exit', killAll);
	for (const signal of SIGNALS) process.on(signal, onSignal);
}

// With nothing open, a signal does what it would without this module.
function uninstall(): void {
	if (!installed || draining || open.size) return;
	installed = false;
	process.off('exit', killAll);
	for (const signal of SIGNALS) process.off(signal, onSignal);
}

/** Keeps `one` to be closed if the process ends before it is; the returned function forgets it once it is closed. */
export function closeOnExit(one: Closable): () => void {
	open.add(one);
	install();
	return () => {
		open.delete(one);
		uninstall();
	};
}

/** A Playwright browser kept until it disconnects. Its kill is Playwright's own: its exit handler SIGKILLs the browser's process group. */
export function closedOnExit<B extends { close(): Promise<void>; on(event: 'disconnected', listener: () => void): unknown }>(browser: B): B {
	const forget = closeOnExit({ close: () => browser.close(), kill: () => {} });
	browser.on('disconnected', forget);
	return browser;
}

/** SIGKILLs `pid` and every process under it, found by parent pid before any is killed so none is reparented first. */
export function killTree(pid: number): void {
	if (process.platform === 'win32') {
		try {
			execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
		} catch {}
		return;
	}
	const pids = [pid];
	try {
		const children = new Map<number, number[]>();
		for (const row of execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')) {
			const [child, parent] = row.trim().split(/\s+/).map(Number) as [number, number];
			children.set(parent, [...(children.get(parent) ?? []), child]);
		}
		for (let i = 0; i < pids.length; i++) pids.push(...(children.get(pids[i]!) ?? []));
	} catch {}
	for (const each of pids) {
		try {
			process.kill(each, 'SIGKILL');
		} catch {}
	}
}
