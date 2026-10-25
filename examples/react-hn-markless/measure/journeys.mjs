// Measures both apps on the same recorded data: requests and their concurrency per journey, and memory over a live session.
// node measure/journeys.mjs --old <origin> --new <origin> --data <.migrate/data dir> --story <id> [--live-minutes 2] [--out file]
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { FakeDatabase, FIREBASE_SOCKET } from '../../../src/check/live-data.ts';

const { values } = parseArgs({
	options: {
		old: { type: 'string' },
		new: { type: 'string' },
		data: { type: 'string' },
		story: { type: 'string' },
		'live-minutes': { type: 'string' },
		out: { type: 'string' },
		hash: { type: 'boolean' },
	},
});
const sides = { old: values.old, new: values.new };
const story = values.story;
const liveMs = Number(values['live-minutes'] ?? 2) * 60_000;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

const recording = async (route) =>
	JSON.parse(
		await readFile(
			join(
				values.data,
				`${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.json`,
			),
			'utf8',
		),
	);
const url = (side, route) => (side === 'old' ? `${sides.old}/#${route}` : `${sides.new}${route}`);

/** A page served the recording: socket traffic answered by the fake database, every HTTP request and listen counted with how many were in flight. */
async function open(browser, side, live) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const databases = live.firebase.map((db) => new FakeDatabase(db));
	const stats = {
		http: 0,
		httpPeak: 0,
		listens: 0,
		listenPeak: 0,
		unlistens: 0,
		frames: 0,
		bytes: 0,
	};
	let inflight = 0;
	let pendingListens = 0;
	await context.routeWebSocket(FIREBASE_SOCKET, (socket) => {
		const db =
			databases.find((d) => d.recorded.host === new URL(socket.url()).host) ?? databases[0];
		const send = socket.send.bind(socket);
		socket.send = (message) => {
			stats.frames++;
			stats.bytes += String(message).length;
			if (/"s":"ok"/.test(String(message))) pendingListens = Math.max(0, pendingListens - 1);
			return send(message);
		};
		socket.onMessage((message) => {
			const text = String(message);
			if (/"a":"q"/.test(text)) {
				stats.listens++;
				pendingListens++;
				stats.listenPeak = Math.max(stats.listenPeak, pendingListens);
			} else if (/"a":"n"/.test(text)) stats.unlistens++;
		});
		db.serve(socket);
	});
	context.on('request', (request) => {
		if (!/^https?:/.test(request.url())) return;
		stats.http++;
		inflight++;
		stats.httpPeak = Math.max(stats.httpPeak, inflight);
	});
	const done = () => (inflight = Math.max(0, inflight - 1));
	context.on('requestfinished', done);
	context.on('requestfailed', done);
	const page = await context.newPage();
	return { context, page, databases, stats };
}

const quiet = async (page) => {
	await page.waitForLoadState('load').catch(() => {});
	await wait(2500);
};

/** The four journeys: open a story, fold and unfold a subtree, take a live update while reading, come back and see what is new. */
async function journeys(browser, side) {
	const out = {};
	const live = await recording(`/story/${story}`);
	{
		const { context, page, stats } = await open(browser, side, live);
		const started = Date.now();
		await page.goto(url(side, `/story/${story}`));
		await page.waitForSelector('.Comment:not(.Comment--loading) .Comment__user', {
			timeout: 30_000,
		});
		const firstComment = Date.now() - started;
		await page
			.waitForFunction(
				() => document.querySelectorAll('.Comment--loading').length === 0,
				undefined,
				{ timeout: 30_000 },
			)
			.catch(() => {});
		const allComments = Date.now() - started;
		await quiet(page);
		out['open a story'] = {
			...stats,
			firstCommentMs: firstComment,
			allCommentsMs: allComments,
			comments: await page.locator('.Comment:not(.Comment--loading)').count(),
		};
		const before = { ...stats };
		const toggle = page.locator('.Comment__collapse').first();
		await toggle.click();
		await wait(300);
		await toggle.click();
		await quiet(page);
		out['collapse and expand a subtree'] = diff(stats, before);
		await context.close();
	}
	{
		const { context, page, databases, stats } = await open(browser, side, live);
		await page.goto(url(side, `/story/${story}`));
		await page
			.waitForFunction(
				() => document.querySelectorAll('.Comment--loading').length === 0,
				undefined,
				{ timeout: 30_000 },
			)
			.catch(() => {});
		await quiet(page);
		const before = { ...stats };
		let sent = 0;
		while (databases.some((db) => db.next())) sent++;
		await quiet(page);
		out['receive the live updates while reading'] = {
			...diff(stats, before),
			updates: sent,
			newMarked: await page.locator('.Comment--new').count(),
		};
		const reload = { ...stats };
		await page.reload();
		await page
			.waitForFunction(
				() => document.querySelectorAll('.Comment--loading').length === 0,
				undefined,
				{ timeout: 30_000 },
			)
			.catch(() => {});
		await quiet(page);
		out['come back and see new since last visit'] = {
			...diff(stats, reload),
			newMarked: await page.locator('.Comment--new').count(),
			header:
				(await page
					.locator('.Item__meta em')
					.first()
					.textContent({ timeout: 1000 })
					.catch(() => null)) ?? '',
		};
		await context.close();
	}
	return out;
}

function diff(now, before) {
	return {
		http: now.http - before.http,
		listens: now.listens - before.listens,
		unlistens: now.unlistens - before.unlistens,
		frames: now.frames - before.frames,
		httpPeak: now.httpPeak,
		listenPeak: now.listenPeak,
	};
}

/** A live session: the story open for `liveMs`, the recorded updates sent across it, memory read after a collection every 10 s. */
async function memory(browser, side) {
	const live = await recording(`/story/${story}`);
	const { context, page, databases } = await open(browser, side, live);
	const cdp = await context.newCDPSession(page);
	await cdp.send('HeapProfiler.enable');
	await page.goto(url(side, `/story/${story}`));
	await page
		.waitForFunction(
			() => document.querySelectorAll('.Comment--loading').length === 0,
			undefined,
			{ timeout: 30_000 },
		)
		.catch(() => {});
	await quiet(page);
	const updates = databases.reduce((n, db) => n + db.recorded.updates.length, 0);
	const every = updates ? Math.max(1000, Math.floor(liveMs / updates)) : liveMs;
	const samples = [];
	const sample = async (t) => {
		await cdp.send('HeapProfiler.collectGarbage');
		const { usedSize } = await cdp.send('Runtime.getHeapUsage');
		const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
		samples.push({ t, heapKb: Math.round(usedSize / 1024), nodes });
	};
	const started = Date.now();
	await sample(0);
	let nextUpdate = every;
	let nextSample = 10_000;
	while (Date.now() - started < liveMs) {
		const t = Date.now() - started;
		if (t >= nextUpdate) {
			databases.some((db) => db.next());
			nextUpdate += every;
		}
		if (t >= nextSample) {
			await sample(t);
			nextSample += 10_000;
		}
		await wait(250);
	}
	await sample(Date.now() - started);
	await context.close();
	return { updates, samples };
}

const browser = await chromium.launch();
const results = {};
try {
	for (const side of ['old', 'new'])
		results[side] = {
			journeys: await journeys(browser, side),
			memory: await memory(browser, side),
		};
} finally {
	await browser.close();
}
const text = JSON.stringify(results, null, '\t');
if (values.out) await writeFile(values.out, `${text}\n`);
console.log(text);
