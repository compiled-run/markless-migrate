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
		synthetic: { type: 'string' },
	},
});
const sides = { old: values.old, new: values.new };
const story = values.story;
const liveMs = Number(values['live-minutes'] ?? 2) * 60_000;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** A steady stream on top of the recording: a new reply every tick under an existing comment, and the story's counts bumped. */
function synthetic(db, storyId, ticks) {
	const story = `v0/item/${storyId}`;
	const comments = Object.keys(db.snapshot).filter(
		(p) => p !== story && db.snapshot[p]?.type === 'comment',
	);
	const kids = Object.fromEntries(
		comments.map((p) => [p, Object.values(db.snapshot[p]?.kids ?? {})]),
	);
	const root = db.snapshot[story];
	let descendants = root?.descendants ?? 0;
	let score = root?.score ?? 0;
	const updates = [];
	for (let i = 0; i < ticks; i++) {
		const parent = comments[(i * 7) % comments.length];
		const id = 90_000_000 + i;
		updates.push({
			path: `v0/item/${id}`,
			data: {
				by: `reader${i % 13}`,
				id,
				parent: Number(parent.split('/').at(-1)),
				text: `Live reply number ${i}`,
				time: 1792900000 + i * 2,
				type: 'comment',
			},
		});
		kids[parent] = [...kids[parent], id];
		updates.push({
			path: `${parent}/kids`,
			data: Object.fromEntries(kids[parent].map((k, j) => [String(j), k])),
		});
		descendants++;
		if (i % 5 === 0) score++;
		updates.push({ path: story, data: { ...root, descendants, score } });
	}
	return { ...db, updates: [...db.updates, ...updates] };
}

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
		const handle = socket.onMessage.bind(socket);
		let inner;
		socket.onMessage = (handler) => (inner = handler);
		db.serve(socket);
		handle((message) => {
			const text = String(message);
			if (/"a":"q"/.test(text)) {
				stats.listens++;
				pendingListens++;
				stats.listenPeak = Math.max(stats.listenPeak, pendingListens);
			} else if (/"a":"n"/.test(text)) stats.unlistens++;
			inner?.(message);
		});
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
	const live = (await recording(`/story/${story}`)).live;
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

/** Heap after a collection, and element count. */
async function reading(cdp, page) {
	await cdp.send('HeapProfiler.collectGarbage');
	const { usedSize } = await cdp.send('Runtime.getHeapUsage');
	return {
		heapKb: Math.round(usedSize / 1024),
		nodes: await page.evaluate(() => document.getElementsByTagName('*').length),
	};
}

const loadedThread = (page) =>
	page
		.waitForFunction(
			() =>
				document.querySelectorAll('.Comment__user').length > 0 &&
				document.querySelectorAll('.Comment--loading').length === 0,
			undefined,
			{ timeout: 30_000 },
		)
		.catch(() => {});

/** A live session on one story for `liveMs`, the updates sent evenly across it: `grow` adds replies, `edit` only changes what is already there. */
async function session(browser, side, kind) {
	const recorded = (await recording(`/story/${story}`)).live;
	const ticks = Number(values.synthetic ?? 40);
	const live = {
		firebase: recorded.firebase.map((db) =>
			kind === 'grow' ? synthetic(db, story, ticks) : edits(db, story, ticks * 3),
		),
	};
	const { context, page, databases } = await open(browser, side, live);
	const cdp = await context.newCDPSession(page);
	await cdp.send('HeapProfiler.enable');
	await page.goto(url(side, `/story/${story}`));
	await loadedThread(page);
	await quiet(page);
	const updates = databases.reduce((n, db) => n + db.pending, 0);
	const every = updates ? Math.max(250, Math.floor(liveMs / updates)) : liveMs;
	const samples = [{ t: 0, ...(await reading(cdp, page)) }];
	const started = Date.now();
	let nextUpdate = every;
	let nextSample = 10_000;
	while (Date.now() - started < liveMs) {
		const t = Date.now() - started;
		if (t >= nextUpdate) {
			databases.some((db) => db.next());
			nextUpdate += every;
		}
		if (t >= nextSample) {
			samples.push({ t, ...(await reading(cdp, page)) });
			nextSample += 10_000;
		}
		await wait(50);
	}
	await quiet(page);
	samples.push({ t: Date.now() - started, ...(await reading(cdp, page)) });
	await context.close();
	return { updates, samples };
}

/** Edits only: comment texts and the story's score change, nothing is added. */
function edits(db, storyId, count) {
	const story = `v0/item/${storyId}`;
	const comments = Object.keys(db.snapshot).filter(
		(p) => p !== story && db.snapshot[p]?.type === 'comment',
	);
	const updates = [];
	for (let i = 0; i < count; i++) {
		const path = comments[(i * 11) % comments.length];
		updates.push({
			path,
			data: { ...db.snapshot[path], text: `${db.snapshot[path].text ?? ''} (edit ${i})` },
		});
		if (i % 4 === 0)
			updates.push({
				path: story,
				data: { ...db.snapshot[story], score: (db.snapshot[story].score ?? 0) + i },
			});
	}
	return { ...db, updates };
}

/** In-place navigations back and forth between the list and the story, heap read after each round: a region whose listeners outlive it grows it. */
async function churn(browser, side, rounds = 15) {
	const story = (await recording(`/story/${values.story}`)).live;
	const list = (await recording('/news')).live;
	const merged = {
		firebase: [
			{
				...story.firebase[0],
				snapshot: { ...list.firebase[0].snapshot, ...story.firebase[0].snapshot },
				updates: [],
			},
		],
	};
	const { context, page, databases } = await open(browser, side, merged);
	const cdp = await context.newCDPSession(page);
	await cdp.send('HeapProfiler.enable');
	await page.goto(url(side, '/news'));
	await page.waitForSelector('.ListItem:not(.ListItem--loading)');
	await quiet(page);
	const samples = [{ round: 0, ...(await reading(cdp, page)), listening: 0 }];
	for (let round = 1; round <= rounds; round++) {
		await page.click(`.Item__meta a[href$="/${values.story}"]`);
		await loadedThread(page);
		await wait(500);
		await page.goBack();
		await page.waitForSelector('.ListItem:not(.ListItem--loading)');
		await wait(2500);
		samples.push({
			round,
			...(await reading(cdp, page)),
			listens: databases[0].listened.length,
		});
	}
	await context.close();
	return samples;
}

const browser = await chromium.launch();
const results = {};
try {
	for (const side of ['old', 'new'])
		results[side] = {
			journeys: await journeys(browser, side),
			grow: await session(browser, side, 'grow'),
			edit: await session(browser, side, 'edit'),
			churn: await churn(browser, side),
		};
} finally {
	await browser.close();
}
const text = JSON.stringify(results, null, '\t');
if (values.out) await writeFile(values.out, `${text}\n`);
console.log(text);
