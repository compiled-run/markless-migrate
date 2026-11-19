import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CANONICAL, install, MAX_ATTEMPTS, mirrorFile, mirrorOrder, onlyMicrosoft, routeSecurity, sourceUris, systemIo } from '../scripts/apt-mirror-fallback.ts';

const RUNNER = 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n';

test('mirrors are tried in the order apt reads them, then the canonical archives, each once and at most MAX_ATTEMPTS', () => {
	assert.deepEqual(mirrorOrder(RUNNER), ['http://azure.archive.ubuntu.com/ubuntu/', ...CANONICAL]);
	assert.deepEqual(mirrorOrder('https://b.example/ubuntu\tpriority:2\n# note\n\nhttp://a.example/ubuntu/\tpriority:1\n'), ['http://a.example/ubuntu/', 'https://b.example/ubuntu/', ...CANONICAL].slice(0, MAX_ATTEMPTS));
	assert.equal(mirrorOrder(Array.from({ length: 9 }, (_, i) => `http://m${i}.example/ubuntu/\tpriority:${i + 1}`).join('\n')).length, MAX_ATTEMPTS);
	assert.equal(mirrorFile(mirrorOrder(RUNNER), 1), 'https://archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://security.ubuntu.com/ubuntu/\tpriority:2\n');
});

const UBUNTU = '/etc/apt/sources.list.d/ubuntu.sources';
// The layout on runners that read noble-security straight from security.ubuntu.com (CI run 44486398574).
const UBUNTU_SOURCES = 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\n\nTypes: deb\nURIs: http://security.ubuntu.com/ubuntu/\nSuites: noble-security\nComponents: main restricted universe multiverse\n';

// apt's source files in memory; apt reads every URI they name unless `reads` says otherwise.
function sources(files: Record<string, string>, reads = (all: Record<string, string>) => Object.values(all).flatMap(sourceUris)) {
	const all = { ...files };
	return {
		all,
		io: {
			sources: () => Object.entries(all).map(([file, text]) => ({ file, text })),
			writeSource: (file: string, text: string) => void (all[file] = text),
			removeSource: (file: string) => void delete all[file],
			repositories: () => reads(all),
		},
	};
}

// A fake install: it reads the first mirror apt would use and stalls on a "stall" host, fails on a "fail" host, else succeeds.
function fake(dir: string): { command: string[]; file: string } {
	const file = join(dir, 'apt-mirrors.txt');
	const script = join(dir, 'fake-apt.sh');
	writeFileSync(script, `#!/bin/sh\nfirst=$(head -1 "${file}")\necho "$first" >> "${join(dir, 'calls')}"\ncase "$first" in *stall*) sleep 30 & wait ;; *fail*) echo 'E: Failed to fetch http://security.ubuntu.com/ubuntu/dists/noble-security/universe/binary-amd64/Packages.xz  File has unexpected size (1230472 != 1230480). Mirror sync in progress?' >&2; exit 100 ;; esac\n`);
	chmodSync(script, 0o755);
	return { command: [script], file };
}

async function scenario(mirrors: string) {
	const dir = mkdtempSync(join(tmpdir(), 'apt-fallback-'));
	try {
		const { command, file } = fake(dir);
		writeFileSync(file, mirrors);
		const lines: string[] = [];
		let settled = 0;
		const started = Date.now();
		const apt = sources({ [UBUNTU]: UBUNTU_SOURCES });
		const status = await install(command, { ...systemIo(file), ...apt.io, settle: async () => void settled++, log: (l) => lines.push(l) }, 1);
		const calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n');
		return { status, lines, settled, calls, seconds: (Date.now() - started) / 1000, file: readFileSync(file, 'utf8'), ubuntu: apt.all[UBUNTU] };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test('the first mirror working installs once and leaves the mirror list as the runner had it', async () => {
	const r = await scenario(RUNNER);
	assert.equal(r.status, 0);
	assert.equal(r.calls.length, 1);
	assert.equal(r.settled, 0);
	assert.equal(r.file, RUNNER);
	assert.equal(r.ubuntu, UBUNTU_SOURCES);
	assert.match(r.lines.at(-1)!, /^apt installed the browsers' system packages from http:\/\/azure\.archive\.ubuntu\.com\/ubuntu\/ \(attempt 1 of 3/);
});

test('a stalling first mirror is stopped at the cap and the install goes on from the next one', async () => {
	const r = await scenario('http://stall.example/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\n');
	assert.equal(r.status, 0);
	assert.deepEqual(r.calls, ['http://stall.example/ubuntu/\tpriority:1', 'https://archive.ubuntu.com/ubuntu/\tpriority:1']);
	assert.ok(r.seconds < 10, `the stalled attempt was stopped at its 1 s cap, not after its 30 s sleep (${r.seconds} s)`);
	assert.ok(r.lines.includes('::warning::apt mirror http://stall.example/ubuntu/ stalled (over 1 s); trying https://archive.ubuntu.com/ubuntu/'));
	assert.match(r.lines.at(-1)!, /from https:\/\/archive\.ubuntu\.com\/ubuntu\/ \(attempt 2 of 3, \d+ s\), after http:\/\/stall\.example\/ubuntu\/ stalled \(over 1 s\)$/);
	assert.equal(r.settled, 1);
	assert.equal(r.ubuntu, UBUNTU_SOURCES.replace('http://security.ubuntu.com/ubuntu/', 'mirror+file:/etc/apt/apt-mirrors.txt'));
	assert.ok(r.lines.includes(`apt source ${UBUNTU} read security.ubuntu.com directly; it now reads the mirror list too`));
});

test('security.ubuntu.com read directly is moved onto the mirror list, so a fault there (a mid-sync size mismatch) is left behind too', () => {
	const sources = 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates\n\nTypes: deb\nURIs: http://security.ubuntu.com/ubuntu/\nSuites: noble-security\n';
	assert.equal(routeSecurity(sources), sources.replace('http://security.ubuntu.com/ubuntu/', 'mirror+file:/etc/apt/apt-mirrors.txt'));
	assert.equal(routeSecurity('deb [arch=amd64] http://security.ubuntu.com/ubuntu noble-security main\n'), 'deb [arch=amd64] mirror+file:/etc/apt/apt-mirrors.txt noble-security main\n');
	assert.equal(routeSecurity('Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\n'), undefined);
	assert.equal(routeSecurity('deb http://security.ubuntu.com.evil.example/ubuntu noble main\n'), undefined);
});

test('apt-get update failing on the first mirror (a size mismatch while it syncs, exit 100) moves on to the next one like a stall', async () => {
	const r = await scenario('http://fail.example/ubuntu/\tpriority:1\n' + RUNNER.split('\n').slice(1).join('\n'));
	assert.equal(r.status, 0);
	assert.equal(r.calls.length, 2);
	assert.ok(r.lines.includes('::warning::apt mirror http://fail.example/ubuntu/ failed (exit 100); trying https://archive.ubuntu.com/ubuntu/'));
});

test('every mirror failing fails once each and says so', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'apt-fallback-'));
	try {
		const { file } = fake(dir);
		writeFileSync(file, RUNNER);
		const lines: string[] = [];
		const status = await install(['sh', '-c', `head -1 "${file}" | grep -q azure && sleep 30; exit 100`], { ...systemIo(file), ...sources({ [UBUNTU]: UBUNTU_SOURCES }).io, settle: async () => {}, log: (l) => lines.push(l) }, 1);
		assert.equal(status, 1);
		assert.equal(lines.filter((l) => l.startsWith('::warning::')).length, 2);
		assert.equal(lines.at(-1), "::error::apt could not install the browsers' system packages from any mirror: http://azure.archive.ubuntu.com/ubuntu/ stalled (over 1 s); https://archive.ubuntu.com/ubuntu/ failed (exit 100); https://security.ubuntu.com/ubuntu/ failed (exit 100)");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a runner without a mirror list gets one capped attempt', async () => {
	const lines: string[] = [];
	const status = await install(['sh', '-c', 'exit 100'], { ...systemIo('/nonexistent/apt-mirrors.txt'), ...sources({ [UBUNTU]: UBUNTU_SOURCES }).io, settle: async () => {}, log: (l) => lines.push(l) }, 1);
	assert.equal(status, 1);
	assert.match(lines.at(-1)!, /failed \(exit 100\).*has no \/etc\/apt\/apt-mirrors\.txt/);
});

// CI run 44624246741 (Check budget, image ubuntu-24.04 20261116.133.1): apt-get update read nothing and all 3 attempts failed within 0.5 s.
test('a runner where apt reads no package source fails once, saying so, instead of walking every mirror', async () => {
	const lines: string[] = [];
	let runs = 0;
	const apt = sources({ [UBUNTU]: UBUNTU_SOURCES }, () => []);
	const status = await install(['true'], { ...systemIo('/nonexistent/apt-mirrors.txt'), ...apt.io, read: () => RUNNER, run: async () => (runs++, { kind: 'failed', status: 1 }), settle: async () => {}, log: (l) => lines.push(l) }, 1);
	assert.equal(status, 1);
	assert.equal(runs, 0);
	assert.equal(lines.at(-1), `::error::apt has no package source on this runner, so no mirror can help (${UBUNTU}: mirror+file:/etc/apt/apt-mirrors.txt http://security.ubuntu.com/ubuntu/)`);
});

test('only a source file that reads nothing but packages.microsoft.com is removed; one that merely mentions it stays', async () => {
	const microsoft = 'deb [arch=amd64,arm64,armhf] https://packages.microsoft.com/ubuntu/24.04/prod noble main\n';
	const mentioning = `# packages.microsoft.com sources live in microsoft-prod.list\n${UBUNTU_SOURCES}`;
	assert.equal(onlyMicrosoft(microsoft), true);
	assert.equal(onlyMicrosoft(mentioning), false);
	assert.equal(onlyMicrosoft(`${microsoft}deb http://azure.archive.ubuntu.com/ubuntu noble main\n`), false);
	assert.equal(onlyMicrosoft('# nothing here\n'), false);
	const apt = sources({ [UBUNTU]: mentioning, '/etc/apt/sources.list.d/microsoft-prod.list': microsoft });
	const lines: string[] = [];
	const status = await install(['true'], { ...systemIo('/nonexistent/apt-mirrors.txt'), ...apt.io, run: async () => ({ kind: 'ok' }), settle: async () => {}, log: (l) => lines.push(l) }, 1);
	assert.equal(status, 0);
	assert.deepEqual(Object.keys(apt.all), [UBUNTU]);
	assert.equal(lines[0], "apt source /etc/apt/sources.list.d/microsoft-prod.list reads only packages.microsoft.com, which has answered 403; removed");
});

test('a security reroute that leaves apt reading nothing is put back as it was', async () => {
	const apt = sources({ [UBUNTU]: UBUNTU_SOURCES }, (all) => (all[UBUNTU] === UBUNTU_SOURCES ? sourceUris(UBUNTU_SOURCES) : []));
	const lines: string[] = [];
	let runs = 0;
	const status = await install(['true'], { ...systemIo('/nonexistent/apt-mirrors.txt'), ...apt.io, read: () => RUNNER, write: () => {}, run: async () => (++runs === 2 ? { kind: 'ok' } : { kind: 'failed', status: 100 }), settle: async () => {}, log: (l) => lines.push(l) }, 1);
	assert.equal(status, 0);
	assert.equal(apt.all[UBUNTU], UBUNTU_SOURCES);
	assert.ok(lines.includes(`::warning::apt read no source after security.ubuntu.com was moved onto the mirror list in ${UBUNTU}; those files are restored as they were`));
});
