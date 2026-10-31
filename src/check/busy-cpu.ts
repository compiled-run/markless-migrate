// The busy-CPU lane: each use of a control made while every CPU of the machine is kept busy, in Chromium, Firefox and
// WebKit, on one page per template group. A control the port answers on an idle machine but loses on a busy one (a handler
// woken late on a slow device) is red here, where the idle checks pass it.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import type { Browser } from 'playwright';
import type { SideEnv } from './browser.ts';
import { checkControlParity, type ControlParityOptions } from './control-parity.ts';
import type { Failure, Viewport } from './types.ts';

// Each spinner checks its parent now and then, so one left by a crashed check stops by itself.
const SPIN = 'process.send(0); const parent = process.ppid; for (;;) { for (let i = 0; i < 5e7; i++); if (process.ppid !== parent) process.exit(); }';

/**
 * Runs `work` while `count` processes (two per CPU by default) keep the machine busy. Each spinner is a process in its own
 * session, as Playwright starts each browser: Linux schedules sessions as groups, so threads of this process would share
 * one group's CPU however many there were, and the browser's group would keep the rest.
 */
export async function busyCpu<T>(work: () => Promise<T>, count = 2 * availableParallelism()): Promise<T> {
	const spinners = Array.from({ length: count }, () => spawn(process.execPath, ['-e', SPIN], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }));
	try {
		// A process takes tens of milliseconds to start: work begun before every one spins would run on an idle machine.
		await Promise.all(spinners.map((s) => new Promise((spinning, failed) => s.once('message', spinning).once('error', failed))));
		for (const s of spinners) s.disconnect();
		return await work();
	} finally {
		await Promise.all(spinners.map((s) => new Promise((gone) => (s.exitCode !== null || s.signalCode !== null ? gone(undefined) : (s.once('exit', gone), s.kill('SIGKILL'))))));
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
