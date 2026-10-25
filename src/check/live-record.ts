import type { Browser } from 'playwright';
import { openPage, type SideEnv } from './browser.ts';
import { loadPage } from './infrastructure.ts';
import { FIREBASE_SOCKET, recordDatabases, type FirebaseDatabase, type LiveRecording, type SocketLog } from './live-data.ts';
import type { Recording } from './data.ts';
import type { NetworkRecord } from './network.ts';
import type { Viewport } from './types.ts';

/** What the old page heard from its realtime databases: from the capture, or, with a window, from a page kept open that long. */
export async function recordLive(browser: Browser, env: SideEnv, route: string, captured: readonly SocketLog[], windowMs: number, viewport: Viewport): Promise<LiveRecording | undefined> {
	if (!captured.some((s) => FIREBASE_SOCKET.test(s.url))) return undefined;
	if (windowMs <= 0) return { firebase: recordDatabases(captured) };
	const { context, page, log } = await openPage(browser, env, viewport);
	try {
		await loadPage(page, new URL(route, env.origin).href);
		await page.waitForTimeout(windowMs);
		return { firebase: recordDatabases(log.sockets) };
	} finally {
		await context.close();
	}
}

/** One recording for a check that moves between routes (the navigation check): every route's responses and databases together; a path two routes recorded keeps the first one's value. */
export function mergeRecordings(recordings: readonly Recording[]): Pick<Recording, 'responses' | 'live'> {
	const responses = recordings.flatMap((r) => r.responses);
	const hosts = new Map<string, FirebaseDatabase>();
	for (const db of recordings.flatMap((r) => r.live?.firebase ?? [])) {
		const kept = hosts.get(db.host);
		hosts.set(db.host, kept ? { host: db.host, snapshot: { ...db.snapshot, ...kept.snapshot }, updates: [] } : { host: db.host, snapshot: { ...db.snapshot }, updates: [] });
	}
	return { responses, ...(hosts.size ? { live: { firebase: [...hosts.values()] } } : {}) };
}

/** The recorded databases as REST answers for the request recorder, so a server that reads a path over HTTP renders the replayed value. */
export function restRecords(live: LiveRecording | undefined): NetworkRecord[] {
	return (live?.firebase ?? []).flatMap((db) => Object.entries(db.snapshot).map(([path, value]): NetworkRecord => ({ side: 'server', method: 'GET', url: `https://${db.host}/${path}.json`, requestType: '', status: 200, contentType: 'application/json', body: JSON.stringify(value) })));
}
