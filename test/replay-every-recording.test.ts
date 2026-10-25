import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startCms, type Cms } from '../fixtures/cms/server.ts';
import { defaultEnv, pushRecording, RECORDER_HEADER, recorderTag } from '../src/check/browser.ts';
import { everyRecording, writeRecording } from '../src/check/data.ts';
import { recorderEnv } from '../src/check/recorder.ts';

const APP = `
import http from 'node:http';
const server = http.createServer(async (req, res) => {
	const news = await (await fetch(process.env.CMS_URL + '/walks/news?fields=title')).json();
	res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>' + news.items.map((i) => i.title).join(', ') + '</h1>');
});
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
`;

const news = (title: string, url = 'http://cms.test/walks/news?fields=title') => ({ side: 'server' as const, method: 'GET', url, status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ title }] }) });

let cms: Cms;
let child: ChildProcess;
let origin: string;
let dir: string;
before(async () => {
	cms = await startCms();
	dir = await mkdtemp(join(tmpdir(), 'mm-replay-'));
	child = spawn(process.execPath, ['--input-type=module', '-e', APP], { env: { ...process.env, CMS_URL: cms.origin, ...recorderEnv('') }, stdio: ['ignore', 'pipe', 'inherit'] });
	origin = await new Promise((resolve) => child.stdout!.once('data', (chunk) => resolve(String(chunk).trim())));
});
after(async () => {
	child?.kill();
	await cms?.stop();
	await rm(dir, { recursive: true, force: true });
});

test('every route\'s recording, newest first and each request once, so a page a journey passes through (where it arrives from) is replayed too', async () => {
	await writeRecording(dir, { route: '/', recordedFrom: 'http://old.test', at: '2026-10-24T10:00:00.000Z', responses: [news('Home, older'), news('Other', 'http://cms.test/other')] });
	await writeRecording(dir, { route: '/news', recordedFrom: 'http://old.test', at: '2026-10-24T11:00:00.000Z', responses: [news('Home, newer')] });
	const all = await everyRecording(dir);
	assert.deepEqual(all.map((r) => JSON.parse(r.body!).items?.[0]?.title ?? r.url), ['Home, newer', 'Other']);
});

test('a load tagged with its route\'s set and the shared one is answered from its own recording first, then from every other route\'s', async () => {
	const shared = { set: 'everything', responses: [news('From another route')] };
	const own = { ...defaultEnv(origin), replay: { set: 'own', responses: [], shared } };
	assert.equal(await pushRecording(own), true);
	const asked = cms.requests.length;
	const html = await (await fetch(origin, { headers: { [RECORDER_HEADER]: recorderTag(own, 'one') } })).text();
	assert.match(html, /From another route/);
	assert.equal(cms.requests.length, asked, 'nothing went to the CMS');
	const mine = { ...defaultEnv(origin), replay: { set: 'mine', responses: [news('Its own')], shared } };
	assert.equal(await pushRecording(mine), true);
	assert.match(await (await fetch(origin, { headers: { [RECORDER_HEADER]: recorderTag(mine, 'two') } })).text(), /Its own/);
});
