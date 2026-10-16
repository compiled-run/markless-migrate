import { spawn } from 'node:child_process';

export function openCommand(path: string, platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): [string, string[]] {
	if (env.MARKLESS_MIGRATE_OPENER) return [env.MARKLESS_MIGRATE_OPENER, [path]];
	if (platform === 'darwin') return ['open', [path]];
	if (platform === 'win32') return ['cmd', ['/c', 'start', '""', path]];
	return ['xdg-open', [path]];
}

export function openFile(path: string): Promise<void> {
	const [command, args] = openCommand(path);
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'ignore', detached: true });
		child.once('error', reject);
		child.once('spawn', () => {
			child.unref();
			resolve();
		});
	});
}
