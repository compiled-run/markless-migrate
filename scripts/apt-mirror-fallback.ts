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

// Some runners read noble-security straight from security.ubuntu.com, outside the mirror list, so a fault there would fail every attempt.
const SECURITY = /^https?:\/\/security\.ubuntu\.com\/ubuntu\/?$/;

/** An apt source file with security.ubuntu.com read through the mirror list instead (deb822 `URIs:` or one-line `deb`), or undefined if it has none. */
export function routeSecurity(text: string): string | undefined {
	let changed = false;
	const swap = (token: string) => (SECURITY.test(token) ? ((changed = true), `mirror+file:${MIRRORS_FILE}`) : token);
	const out = text
		.split('\n')
		.map((line) => {
			const uris = /^(URIs:\s*)(.*)$/.exec(line);
			if (uris) return uris[1] + uris[2]!.split(/(\s+)/).map(swap).join('');
			const deb = /^(deb(?:-src)?\s+(?:\[[^\]]*\]\s+)?)(\S+)(.*)$/.exec(line);
			return deb ? deb[1] + swap(deb[2]!) + deb[3] : line;
		})
		.join('\n');
	return changed ? out : undefined;
}

/** The repository URIs an apt source file names (deb822 `URIs:` or one-line `deb`), comments left out. */
export function sourceUris(text: string): string[] {
	return text.split('\n').flatMap((line) => {
		const uris = /^URIs:\s*(.*)$/.exec(line);
		if (uris) return uris[1]!.split(/\s+/).filter(Boolean);
		const deb = /^deb(?:-src)?\s+(?:\[[^\]]*\]\s+)?(\S+)/.exec(line);
		return deb ? [deb[1]!] : [];
	});
}

// packages.microsoft.com has answered 403 and failed apt-get update; a file is dropped only when every source in it is that host.
const MICROSOFT = /^https?:\/\/packages\.microsoft\.com\//;
export const onlyMicrosoft = (text: string) => {
	const uris = sourceUris(text);
	return uris.length > 0 && uris.every((u) => MICROSOFT.test(u));
};

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
	readonly sources: () => { readonly file: string; readonly text: string }[];
	readonly writeSource: (file: string, text: string) => void;
	readonly removeSource: (file: string) => void;
	/** The repositories apt itself reads, from `apt-get indextargets`. */
	readonly repositories: () => string[];
	readonly run: (command: readonly string[], seconds: number) => Promise<Outcome>;
	/** Before the next attempt: stop what the last one left running as root, and repair an interrupted dpkg. */
	readonly settle: () => Promise<void>;
	readonly log: (line: string) => void;
}

/** 0 once an attempt installs; 1 when every mirror stalled or failed. At most MAX_ATTEMPTS attempts of ATTEMPT_SECONDS each. */
export async function install(command: readonly string[], io: Io, seconds = ATTEMPT_SECONDS): Promise<number> {
	for (const { file, text } of io.sources()) {
		if (!onlyMicrosoft(text)) continue;
		io.removeSource(file);
		io.log(`apt source ${file} reads only packages.microsoft.com, which has answered 403; removed`);
	}
	const listing = () => io.sources().map(({ file, text }) => `${file}: ${sourceUris(text).join(' ') || '(no sources)'}`).join('; ') || 'no source files';
	io.log(`apt sources: ${listing()}`);
	if (!io.repositories().length) {
		io.log(`::error::apt has no package source on this runner, so no mirror can help (${listing()})`);
		return 1;
	}
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
			if (i === 1) rerouteSecurity(io);
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

function rerouteSecurity(io: Io): void {
	const before = io.sources();
	const changed = before.flatMap(({ file, text }) => {
		const routed = routeSecurity(text);
		return routed === undefined ? [] : [{ file, text, routed }];
	});
	for (const c of changed) io.writeSource(c.file, c.routed);
	if (!changed.length) return;
	if (io.repositories().length) {
		for (const c of changed) io.log(`apt source ${c.file} read security.ubuntu.com directly; it now reads the mirror list too`);
		return;
	}
	for (const c of changed) io.writeSource(c.file, c.text);
	io.log(`::warning::apt read no source after security.ubuntu.com was moved onto the mirror list in ${changed.map((c) => c.file).join(', ')}; those files are restored as they were`);
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

function put(file: string, text: string): void {
	if (writable(file)) writeFileSync(file, text);
	else spawnSync('sudo', ['tee', file], { input: text, stdio: ['pipe', 'ignore', 'inherit'] });
}

export function systemIo(file = MIRRORS_FILE): Io {
	return {
		read: () => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
		write: (text) => put(file, text),
		sources: () => {
			const dir = '/etc/apt/sources.list.d';
			const files = ['/etc/apt/sources.list', ...(existsSync(dir) ? readdirSync(dir).filter((f) => /\.(list|sources)$/.test(f)).map((f) => `${dir}/${f}`) : [])];
			return files.filter((f) => existsSync(f)).map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));
		},
		writeSource: put,
		removeSource: (f) => void spawnSync('sudo', ['rm', '-f', f], { stdio: 'inherit' }),
		repositories: () => [...new Set((spawnSync('apt-get', ['indextargets', '--format', '$(REPO_URI)'], { encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean))],
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
