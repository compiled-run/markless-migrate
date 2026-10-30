// The busy-CPU lane: each use of a control made while every CPU of the machine is kept busy, in Chromium, Firefox and
// WebKit, on one page per template group. A control the port answers on an idle machine but loses on a busy one (a handler
// woken late on a slow device) is red here, where the idle checks pass it.
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Browser } from 'playwright';
import type { SideEnv } from './browser.ts';
import { checkControlParity, type ControlParityOptions } from './control-parity.ts';
import type { Failure, Viewport } from './types.ts';

/** Runs `work` while `threads` threads (two per CPU by default) keep the machine busy. */
export async function busyCpu<T>(work: () => Promise<T>, threads = 2 * availableParallelism()): Promise<T> {
	const workers = Array.from({ length: threads }, () => new Worker("require('node:worker_threads').parentPort.postMessage(0); for (;;) {}", { eval: true }));
	try {
		// A thread takes tens of milliseconds to start: work begun before every one spins would run on an idle machine.
		await Promise.all(workers.map((w) => new Promise((spinning, failed) => w.once('message', spinning).once('error', failed))));
		return await work();
	} finally {
		await Promise.all(workers.map((w) => w.terminate()));
	}
}

const ENGINES = [['chromium', 'Chromium'], ['firefox', 'Firefox'], ['webkit', 'WebKit']] as const;
const HINT = 'The port answers this on an idle machine and not while the CPU is busy, where the original still does: its handler wakes or runs too late on a slow device (a click arriving before the code that answers it, a deadline missed).';

export interface BusyCpuOptions {
	readonly maxUses?: number;
	readonly maxKeys?: number;
	/** Per engine, for the idle and the busy run each. */
	readonly budgetMs?: number;
}

/** The differences each engine's uses show only on a busy machine: every difference the same uses show idle is left out. */
export async function checkBusyCpu(browsers: Partial<Record<(typeof ENGINES)[number][0], Browser>>, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewport: Viewport, options: BusyCpuOptions = {}): Promise<{ failures: Failure[]; ms: number }> {
	const started = Date.now();
	const parity: ControlParityOptions = { widths: [viewport.width], anchorWidths: [], maxUses: options.maxUses ?? 3, maxKeys: options.maxKeys ?? 2, maxInputs: 0, film: false, usesOnly: true, budgetMs: options.budgetMs ?? 30_000 };
	const key = (f: Failure) => `${f.check}\u0000${f.expected}`;
	const failures: Failure[] = [];
	for (const [name, label] of ENGINES) {
		const browser = browsers[name];
		if (!browser) continue;
		const idle = new Set((await checkControlParity(browser, sides, route, viewport, parity)).failures.map(key));
		const busy = await checkControlParity(browser, sides, route, viewport, { ...parity, during: (work) => busyCpu(work) });
		failures.push(...busy.failures.filter((f) => !idle.has(key(f))).map((f) => ({ ...f, check: `${f.check} on a busy CPU (${label})`, hint: HINT })));
	}
	return { failures, ms: Date.now() - started };
}
