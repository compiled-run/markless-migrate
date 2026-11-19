import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CANONICAL, install, MAX_ATTEMPTS, mirrorFile, mirrorOrder, systemIo } from '../scripts/apt-mirror-fallback.ts';

const RUNNER = 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n';

test('mirrors are tried in the order apt reads them, then the canonical archives, each once and at most MAX_ATTEMPTS', () => {
	assert.deepEqual(mirrorOrder(RUNNER), ['http://azure.archive.ubuntu.com/ubuntu/', ...CANONICAL]);
	assert.deepEqual(mirrorOrder('https://b.example/ubuntu\tpriority:2\n# note\n\nhttp://a.example/ubuntu/\tpriority:1\n'), ['http://a.example/ubuntu/', 'https://b.example/ubuntu/', ...CANONICAL].slice(0, MAX_ATTEMPTS));
	assert.equal(mirrorOrder(Array.from({ length: 9 }, (_, i) => `http://m${i}.example/ubuntu/\tpriority:${i + 1}`).join('\n')).length, MAX_ATTEMPTS);
	assert.equal(mirrorFile(mirrorOrder(RUNNER), 1), 'https://archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://security.ubuntu.com/ubuntu/\tpriority:2\n');
});

// A fake install: it reads the first mirror apt would use and stalls on a "stall" host, fails on a "fail" host, else succeeds.
function fake(dir: string): { command: string[]; file: string } {
	const file = join(dir, 'apt-mirrors.txt');
	const script = join(dir, 'fake-apt.sh');
	writeFileSync(script, `#!/bin/sh\nfirst=$(head -1 "${file}")\necho "$first" >> "${join(dir, 'calls')}"\ncase "$first" in *stall*) sleep 30 & wait ;; *fail*) exit 100 ;; esac\n`);
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
		const status = await install(command, { ...systemIo(file), settle: async () => void settled++, log: (l) => lines.push(l) }, 1);
		const calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n');
		return { status, lines, settled, calls, seconds: (Date.now() - started) / 1000, file: readFileSync(file, 'utf8') };
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
});

test('a failing first mirror moves on to the next one the same way', async () => {
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
		const status = await install(['sh', '-c', `head -1 "${file}" | grep -q azure && sleep 30; exit 100`], { ...systemIo(file), settle: async () => {}, log: (l) => lines.push(l) }, 1);
		assert.equal(status, 1);
		assert.equal(lines.filter((l) => l.startsWith('::warning::')).length, 2);
		assert.equal(lines.at(-1), "::error::apt could not install the browsers' system packages from any mirror: http://azure.archive.ubuntu.com/ubuntu/ stalled (over 1 s); https://archive.ubuntu.com/ubuntu/ failed (exit 100); https://security.ubuntu.com/ubuntu/ failed (exit 100)");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a runner without a mirror list gets one capped attempt', async () => {
	const lines: string[] = [];
	const status = await install(['sh', '-c', 'exit 100'], { ...systemIo('/nonexistent/apt-mirrors.txt'), settle: async () => {}, log: (l) => lines.push(l) }, 1);
	assert.equal(status, 1);
	assert.match(lines.at(-1)!, /failed \(exit 100\).*has no \/etc\/apt\/apt-mirrors\.txt/);
});
