import { spawn } from 'node:child_process';

export interface Ran {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * Runs `node <args>` and gathers its output. A process still running after `timeoutMs` is killed and the run rejects with the
 * command and the end of its output, so a stalled check fails its test at once instead of holding the shard until CI cancels it.
 */
export function spawnNode(args: readonly string[], options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly timeoutMs: number }): Promise<Ran> {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, args, { ...(options.cwd ? { cwd: options.cwd } : {}), ...(options.env ? { env: options.env } : {}) });
		const out = { stdout: '', stderr: '' };
		child.stdout.on('data', (c) => (out.stdout += c));
		child.stderr.on('data', (c) => (out.stderr += c));
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			const tail = `${out.stdout}${out.stderr}`.trim().split('\n').slice(-20).join('\n');
			fail(new Error(`node ${args.join(' ')} did not exit within ${options.timeoutMs / 1000} s and was killed; its last output:\n${tail || '(none)'}`));
		}, options.timeoutMs);
		child.on('exit', (code) => {
			clearTimeout(timer);
			done({ status: code ?? -1, ...out });
		});
	});
}
