// Runs the browsers' apt install with the runner's mirror list, and when an attempt stalls past ATTEMPT_SECONDS or fails,
// drops the mirror that was first and runs it again from the next one, once per mirror (docs/ci-process.md "Caches"):
//   node scripts/apt-mirror-fallback.ts -- <install command...>
import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MIRRORS_FILE = '/etc/apt/apt-mirrors.txt';
export const ATTEMPT_SECONDS = 180;
export const KILL_GRACE_SECONDS = 10;
// Both serve the whole Ubuntu archive; the runner images already list them after their cloud's own mirror.
export const CANONICAL = ['https://archive.ubuntu.com/ubuntu/', 'https://security.ubuntu.com/ubuntu/'];
export const MAX_ATTEMPTS = 4;

const slash = (uri: string) => (uri.endsWith('/') ? uri : `${uri}/`);

/** The mirrors to try, in order: the runner's list as apt reads it (lowest priority number first), then the canonical archives, at most MAX_ATTEMPTS. */
export function mirrorOrder(text: string): string[] {
	const listed = text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#'))
		.map((line, index) => {
			const [uri = '', ...meta] = line.split(/\s+/);
			const priority = Number(meta.find((m) => m.startsWith('priority:'))?.slice(9) ?? Infinity);
			return { uri: slash(uri), priority: Number.isFinite(priority) ? priority : Infinity, index };
		})
		.sort((a, b) => a.priority - b.priority || a.index - b.index)
		.map((m) => m.uri);
	return [...new Set([...listed, ...CANONICAL])].slice(0, MAX_ATTEMPTS);
}

/** The mirror file for one attempt: the mirrors from `from` on, so apt still fails over between them file by file. */
export function mirrorFile(order: readonly string[], from: number): string {
	return order
		.slice(from)
		.map((uri, i) => `${uri}\tpriority:${i + 1}\n`)
		.join('');
}

export type Outcome = { readonly kind: 'ok' } | { readonly kind: 'stalled' } | { readonly kind: 'failed'; readonly status: number | string };

export interface Io {
	readonly read: () => string | undefined;
	readonly write: (text: string) => void;
	readonly run: (command: readonly string[], seconds: number) => Promise<Outcome>;
	/** Before the next attempt: stop what the last one left running as root, and repair an interrupted dpkg. */
	readonly settle: () => Promise<void>;
	readonly log: (line: string) => void;
}

/** 0 once an attempt installs; 1 when every mirror stalled or failed. At most MAX_ATTEMPTS attempts of ATTEMPT_SECONDS each. */
export async function install(command: readonly string[], io: Io, seconds = ATTEMPT_SECONDS): Promise<number> {
	const text = io.read();
	if (text === undefined) {
		const outcome = await io.run(command, seconds);
		if (outcome.kind === 'ok') return 0;
		io.log(`::error::apt ${outcome.kind === 'stalled' ? `took over ${seconds} s` : `failed (exit ${outcome.status})`} installing the browsers' system packages, and this runner has no ${MIRRORS_FILE} to try another mirror from`);
		return 1;
	}
	const order = mirrorOrder(text);
	io.log(`apt mirrors to try, one attempt each of at most ${seconds} s: ${order.join(', ')}`);
	const tried: string[] = [];
	for (let i = 0; i < order.length; i++) {
		const mirror = order[i]!;
		if (i > 0) {
			await io.settle();
			io.write(mirrorFile(order, i));
		}
		const started = Date.now();
		const outcome = await io.run(command, seconds);
		if (outcome.kind === 'ok') {
			io.log(`apt installed the browsers' system packages from ${mirror} (attempt ${i + 1} of ${order.length}, ${Math.round((Date.now() - started) / 1000)} s)${tried.length ? `, after ${tried.join('; ')}` : ''}`);
			return 0;
		}
		const what = outcome.kind === 'stalled' ? `stalled (over ${seconds} s)` : `failed (exit ${outcome.status})`;
		tried.push(`${mirror} ${what}`);
		const next = order[i + 1];
		io.log(next ? `::warning::apt mirror ${mirror} ${what}; trying ${next}` : `apt mirror ${mirror} ${what}`);
	}
	io.log(`::error::apt could not install the browsers' system packages from any mirror: ${tried.join('; ')}`);
	return 1;
}

/** Runs `command` in its own process group; past `seconds` the group gets SIGTERM, and SIGKILL KILL_GRACE_SECONDS later. */
export function run(command: readonly string[], seconds: number): Promise<Outcome> {
	return new Promise((resolve) => {
		const child = spawn(command[0]!, command.slice(1), { stdio: 'inherit', detached: true });
		let stalled = false;
		let kill: NodeJS.Timeout | undefined;
		const signal = (sig: NodeJS.Signals) => {
			try {
				process.kill(-child.pid!, sig);
			} catch {}
		};
		const timer = setTimeout(() => {
			stalled = true;
			signal('SIGTERM');
			kill = setTimeout(() => signal('SIGKILL'), KILL_GRACE_SECONDS * 1000);
		}, seconds * 1000);
		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({ kind: 'failed', status: error.message });
		});
		child.on('close', (code, sig) => {
			clearTimeout(timer);
			clearTimeout(kill);
			resolve(stalled ? { kind: 'stalled' } : code === 0 ? { kind: 'ok' } : { kind: 'failed', status: code ?? sig ?? 'unknown' });
		});
	});
}

function writable(path: string): boolean {
	try {
		accessSync(path, constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

export function systemIo(file = MIRRORS_FILE): Io {
	return {
		read: () => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
		write: (text) => {
			if (writable(file)) writeFileSync(file, text);
			else spawnSync('sudo', ['tee', file], { input: text, stdio: ['pipe', 'ignore', 'inherit'] });
		},
		// sudo does not pass on a signal sent from its own process group, so a stopped attempt leaves apt-get running as root, holding the lock.
		settle: async () => {
			const running = () => spawnSync('pgrep', ['-x', 'apt-get|dpkg']).status === 0;
			for (const signal of ['TERM', 'KILL']) {
				if (!running()) break;
				spawnSync('sudo', ['pkill', `-${signal}`, '-x', 'apt-get'], { stdio: 'inherit' });
				for (let waited = 0; running() && waited < KILL_GRACE_SECONDS; waited++) await new Promise((r) => setTimeout(r, 1000));
			}
			if (existsSync('/var/lib/dpkg/updates') && readdirSync('/var/lib/dpkg/updates').length > 0) spawnSync('sudo', ['dpkg', '--configure', '-a'], { stdio: 'inherit', timeout: ATTEMPT_SECONDS * 1000 });
		},
		run,
		log: (line) => console.log(line),
	};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const at = process.argv.indexOf('--');
	const command = at < 0 ? [] : process.argv.slice(at + 1);
	if (!command.length) {
		console.error('usage: node scripts/apt-mirror-fallback.ts -- <install command...>');
		process.exit(2);
	}
	process.exit(await install(command, systemIo()));
}
