import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { runCheck } from '../src/check/run.ts';

// A streamed answer, a word every 40 ms. The new page does about 30 ms of work a render and shows every word due by then:
// on a fast CPU about two words a render, 70 ms apart; on a 4x slower one several, more than 150 ms apart: it arrives in bursts.
const page = (costly: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Code Block</title></head><body><main><h1>Code Block</h1><div id="msg" aria-live="polite" style="min-height: 120px"></div><button id="replay">Replay</button></main><script>
const TEXT = 'Create a route handler that calls streamText and returns the stream to the client. The useChat hook reads it on the page and renders each part as it arrives, so the answer shows while it is still being written word by word.'.split(' ');
const msg = document.getElementById('msg'), replay = document.getElementById('replay');
msg.textContent = TEXT.join(' ');
const work = () => { let s = ''; for (let i = 0; i < ${costly ? 1400000 : 0}; i++) s = (s + i.toString(36)).slice(-64); return s.length; };
replay.onclick = () => {
	replay.hidden = true; msg.textContent = '';
	const start = performance.now();
	let shown = 0;
	const step = () => { work(); shown = Math.min(TEXT.length, ${costly ? 'Math.max(shown + 1, Math.floor((performance.now() - start) / 40) + 1)' : 'shown + 1'}); msg.textContent = TEXT.slice(0, shown).join(' '); if (shown < TEXT.length) setTimeout(step, 40); else replay.hidden = false; };
	step();
};
</script></body></html>`;

const servers: Server[] = [];
const serve = (body: string) => new Promise<string>((done) => { const s = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body)); servers.push(s); s.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)); });
let old: string;
let next: string;
before(async () => {
	[old, next] = await Promise.all([serve(page(false)), serve(page(true))]);
});
after(() => {
	for (const s of servers) {
		s.closeAllConnections();
		s.close();
	}
});

test('a streamed answer that arrives in bursts only on a slowed CPU is red at 4x CPU; the same page is green', async () => {
	const same = await runCheck({ oldOrigin: old, newOrigin: old, routes: ['/'] });
	assert.deepEqual(same.routes[0]!.failures.filter((f) => /at 4x CPU/.test(f.check)).map((f) => `${f.check}: ${f.actual}`), []);
	const report = await runCheck({ oldOrigin: old, newOrigin: next, routes: ['/'] });
	const throttled = report.routes[0]!.failures.find((f) => /^click button "Replay", at 4x CPU/.test(f.check));
	assert.ok(throttled, JSON.stringify({ failures: report.routes[0]!.failures.map((f) => `${f.dimension}: ${f.check}`), steps: report.routes[0]!.timing?.steps?.map((t) => t.name) }, null, 1));
	assert.match(`${throttled.dimension}: ${throttled.check} | ${throttled.actual}`, /^behaviour: [^|]*Replay[^|]*\|.*arrives/);
});
