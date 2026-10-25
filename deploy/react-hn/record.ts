// Records what the old app hears from the HN database on each route, as `check --data record --live-window` does, into deploy/react-hn/data/.
// node deploy/react-hn/record.ts --old http://localhost:4201 --window 60 /news /story/8863 ...
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { writeRecording } from '../../src/check/data.ts';
import { FIREBASE_SOCKET, recordDatabases, type SocketLog } from '../../src/check/live-data.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { old: { type: 'string', default: 'http://localhost:4201' }, window: { type: 'string', default: '60' }, out: { type: 'string', default: join(import.meta.dirname, 'data') } } });
const windowMs = Number(values.window) * 1000;
const browser = await chromium.launch();
try {
	await Promise.all(
		positionals.map(async (route) => {
			const page = await browser.newPage();
			const sockets: SocketLog[] = [];
			page.on('websocket', (socket) => {
				if (!FIREBASE_SOCKET.test(socket.url())) return;
				const opened = Date.now();
				const frames: { sent: boolean; text: string; at: number }[] = [];
				sockets.push({ url: socket.url(), frames });
				socket.on('framesent', (f) => frames.push({ sent: true, text: String(f.payload), at: Date.now() - opened }));
				socket.on('framereceived', (f) => frames.push({ sent: false, text: String(f.payload), at: Date.now() - opened }));
			});
			const at = new Date().toISOString();
			await page.goto(`${values.old}/#${route}`);
			await page.waitForTimeout(windowMs);
			await page.close();
			const firebase = recordDatabases(sockets);
			const path = await writeRecording(values.out!, { route, recordedFrom: values.old!, at, responses: [], live: { firebase } });
			console.log(`${route}: ${firebase.map((db) => `${Object.keys(db.snapshot).length} paths, ${db.updates.length} updates`).join('; ')} -> ${path}`);
		}),
	);
} finally {
	await browser.close();
}
