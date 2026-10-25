import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startCms, type Cms } from '../fixtures/cms/server.ts';
import { defaultEnv, RECORDER_HEADER, recorderTag, serverRecords } from '../src/check/browser.ts';
import { recorderEnv } from '../src/check/recorder.ts';

// Stands in for `next start`: a page kept in its cache since the build is answered without fetching, unless the request carries the build's draft-mode cookie.
const APP = `
import http from 'node:http';
import { readFileSync } from 'node:fs';
const { preview } = JSON.parse(readFileSync('.next/prerender-manifest.json', 'utf8'));
let cached = '<h1>From the build</h1>';
const server = http.createServer(async (req, res) => {
	const draft = (req.headers.cookie ?? '').split(/;\\s*/).includes('__prerender_bypass=' + preview.previewModeId);
	if (!draft) return res.writeHead(200, { 'content-type': 'text/html', 'x-nextjs-cache': 'HIT' }).end(cached);
	const news = await (await fetch(process.env.CMS_URL + '/walks/news?fields=title')).json();
	res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>' + news.items.map((i) => i.title).join(', ') + '</h1>');
});
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
`;

let cms: Cms;
let child: ChildProcess;
let origin: string;
let dir: string;

before(async () => {
	cms = await startCms();
	dir = await mkdtemp(join(tmpdir(), 'mm-next-cache-'));
	await mkdir(join(dir, '.next'));
	await writeFile(join(dir, '.next/prerender-manifest.json'), JSON.stringify({ version: 4, routes: {}, preview: { previewModeId: 'b1d2', previewModeSigningKey: 'k', previewModeEncryptionKey: 'e' } }));
	child = spawn(process.execPath, ['--input-type=module', '-e', APP], { cwd: dir, env: { ...process.env, CMS_URL: cms.origin, ...recorderEnv('') }, stdio: ['ignore', 'pipe', 'inherit'] });
	origin = await new Promise((resolve) => child.stdout!.once('data', (chunk) => resolve(String(chunk).trim())));
});
after(async () => {
	child?.kill();
	await cms?.stop();
	await rm(dir, { recursive: true, force: true });
});

test('a Next.js page served from its cache is rendered on demand for a load that records or replays data, so what the server fetches is seen', async () => {
	const env = defaultEnv(origin);
	const cachedHtml = await (await fetch(origin, { headers: { [RECORDER_HEADER]: recorderTag(env, 'cached') } })).text();
	assert.match(cachedHtml, /From the build/);
	assert.deepEqual(await serverRecords(env, 'cached'), [], 'a plain check load leaves the cache alone');
	const fresh = { ...env, renderFresh: true };
	const html = await (await fetch(origin, { headers: { [RECORDER_HEADER]: recorderTag(fresh, 'fresh') } })).text();
	assert.match(html, /Winter timetable/);
	assert.deepEqual((await serverRecords(env, 'fresh'))!.map((r) => `${r.method} ${new URL(r.url).pathname}`), ['GET /walks/news']);
	const untagged = await (await fetch(origin)).text();
	assert.match(untagged, /From the build/, 'requests without the tag are left alone');
});
