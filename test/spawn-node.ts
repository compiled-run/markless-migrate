import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Ran {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
}

/** What a stuck Node process was doing, from the diagnostic report it writes on SIGUSR2: its JavaScript stack and what keeps its event loop alive. */
function stuckAt(dir: string): string {
	const file = readdirSync(dir).find((f) => f.endsWith('.json'));
	if (!file) return 'it wrote no diagnostic report, so its JavaScript was blocked (a synchronous call, or native code, or exiting)';
	const report = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { javascriptStack?: { message?: string; stack?: string[] }; libuv?: { type: string; is_active: boolean; is_referenced?: boolean; address?: string; localEndpoint?: unknown; remoteEndpoint?: unknown }[]; workers?: unknown[] };
	const stack = (report.javascriptStack?.stack ?? []).slice(0, 6).join(' < ') || 'nothing running, waiting in its event loop';
	const handles = (report.libuv ?? []).filter((h) => h.is_active && h.is_referenced !== false).map((h) => `${h.type}${h.remoteEndpoint ? ` to ${JSON.stringify(h.remoteEndpoint)}` : h.localEndpoint ? ` on ${JSON.stringify(h.localEndpoint)}` : ''}`);
	return `JavaScript at: ${stack}; what keeps it running: ${handles.join(', ') || 'no active handle'}${report.workers?.length ? `; ${report.workers.length} worker thread(s)` : ''}`;
}

/**
 * Runs `node <args>` and gathers its output. A process still running after `timeoutMs` is asked for a diagnostic report, then
 * killed, and the run rejects with the command, where it was stuck and the end of its output, so a stalled child fails its test
 * at once instead of holding the shard until CI cancels it.
 */
export function spawnNode(args: readonly string[], options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly input?: string; readonly timeoutMs: number }): Promise<Ran> {
	const reports = mkdtempSync(join(tmpdir(), 'mm-child-report-'));
	return new Promise<Ran>((done, fail) => {
		const child = spawn(process.execPath, ['--report-on-signal', '--report-signal=SIGUSR2', `--report-directory=${reports}`, ...args], { ...(options.cwd ? { cwd: options.cwd } : {}), ...(options.env ? { env: options.env } : {}) });
		child.stdin.end(options.input ?? '');
		const out = { stdout: '', stderr: '' };
		child.stdout.on('data', (c) => (out.stdout += c));
		child.stderr.on('data', (c) => (out.stderr += c));
		const timer = setTimeout(() => {
			const tail = `${out.stdout}${out.stderr}`.trim().split('\n').slice(-20).join('\n');
			child.kill('SIGUSR2');
			setTimeout(() => {
				const where = stuckAt(reports);
				child.kill('SIGKILL');
				fail(new Error(`node ${args.join(' ')} did not exit within ${options.timeoutMs / 1000} s and was killed; ${where}; its last output:\n${tail || '(none)'}`));
			}, 2_000);
		}, options.timeoutMs);
		child.on('exit', (code) => {
			clearTimeout(timer);
			done({ status: code ?? -1, ...out });
		});
	}).finally(() => rmSync(reports, { recursive: true, force: true }));
}
