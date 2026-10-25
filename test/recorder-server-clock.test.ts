import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { after, before, test } from 'node:test';
import { defaultEnv, RECORDER_HEADER, recorderTag } from '../src/check/browser.ts';
import { recorderEnv } from '../src/check/recorder.ts';

// Renders what a "posted 3 hours ago" page needs from the server clock, and checks a date Node itself made.
const APP = `
const http = require('node:http');
const fs = require('node:fs');
const server = http.createServer(async (req, res) => {
	await new Promise((done) => setTimeout(done, 20));
	const stat = fs.statSync(process.execPath);
	res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ now: Date.now(), made: new Date().getTime(), parsed: new Date(0).getTime(), fsDate: stat.mtime instanceof Date }));
});
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
`;

let child: ChildProcess;
let origin: string;
before(async () => {
	child = spawn(process.execPath, ['-e', APP], { env: { ...process.env, ...recorderEnv('') }, stdio: ['ignore', 'pipe', 'inherit'] });
	origin = await new Promise((resolve) => child.stdout!.once('data', (chunk) => resolve(String(chunk).trim())));
});
after(() => child?.kill());

test('a load that pins the clock renders with the server clock at that moment, ticking from it; other requests keep the real clock', async () => {
	const at = Date.parse('2026-10-24T10:00:00.000Z');
	const env = { ...defaultEnv(origin), serverTime: at };
	const pinned = await (await fetch(origin, { headers: { [RECORDER_HEADER]: recorderTag(env, 'one') } })).json();
	assert.ok(pinned.now >= at && pinned.now < at + 1000, `Date.now() ${new Date(pinned.now).toISOString()}`);
	assert.ok(pinned.made >= at && pinned.made < at + 1000, `new Date() ${new Date(pinned.made).toISOString()}`);
	assert.equal(pinned.parsed, 0, 'a date made from a value is that value');
	assert.equal(pinned.fsDate, true, 'a Date Node made is still a Date');
	const real = await (await fetch(origin)).json();
	assert.ok(Math.abs(real.now - Date.now()) < 5000, 'an untagged request sees the real clock');
});
