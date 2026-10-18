// Panel.tsx's connection to Devtron's background service worker through chrome.runtime, as the panel page opens it.
import { linkEvents } from '../parity/ag-grid-react/model.ts';
import type { Row } from '../parity/ag-grid-react/model.ts';

export const MAX_EVENTS_TO_DISPLAY = 20000;

type Port = { postMessage(message: unknown): void; onMessage: { addListener(f: (m: any) => void): void }; onDisconnect: { addListener(f: () => void): void } };

let port: Port | null = null;
const uuids = new Map<string, number>();

/** Connects as the panel and asks for every recorded event; `onEvents` gets the linked list after each batch. */
export function connectPanel(current: () => Row[], onEvents: (events: Row[]) => void): void {
	const runtime = (globalThis as { chrome?: { runtime?: { connect?: (o: { name: string }) => Port } } }).chrome?.runtime;
	if (!runtime?.connect) return;
	port = runtime.connect({ name: 'devt-panel' });
	let pending: Row[] = [];
	port.onMessage.addListener((message: { type: string; event: Row }) => {
		if (message.type !== 'render-event') return;
		pending.push(message.event);
		if (pending.length > 1) return;
		queueMicrotask(() => {
			const batch = pending;
			pending = [];
			onEvents(linkEvents(current(), batch, uuids, MAX_EVENTS_TO_DISPLAY));
		});
	});
	port.postMessage({ type: 'get-all-events' });
	port.onDisconnect.addListener(() => {
		console.log('Devtron - Panel disconnected');
	});
}

export function clearEvents(): void {
	if (!port) return;
	try {
		port.postMessage({ type: 'clear-events' });
		uuids.clear();
	} catch (error) {
		console.error('Devtron - Error clearing events:', error);
	}
}

export function readSetting(key: string): string | null {
	return localStorage.getItem(key);
}

const ran = new Set<string>();
/** True the first time for `key`: an onIdle handler can run more than once for one element (see the log). */
export function firstTime(key: string): boolean {
	if (ran.has(key)) return false;
	ran.add(key);
	return true;
}
