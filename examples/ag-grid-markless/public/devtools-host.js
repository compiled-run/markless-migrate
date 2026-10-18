// The devtools host both apps run in: a chrome.runtime stub playing Devtron's background service worker, which
// answers the panel's get-all-events with a fixed, seeded log of 5,000 IPC events in one task.
(() => {
	const COUNT = Number(new URLSearchParams(location.search).get('events') ?? 5000);
	let seed = 20261017;
	const rand = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const pick = (list) => list[Math.floor(rand() * list.length)];
	const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
	const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
	const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
	const words = ['alpha', 'beta', 'gamma', 'delta', 'notes', 'inbox', 'drafts', 'archive', 'photos', 'reports', 'q3', 'budget', 'roadmap', 'meeting', 'invoice'];
	const names = ['Lena', 'Jake', 'Mira', 'Omar', 'Priya', 'Tomás', 'Yuki', 'Ada', 'Chen', 'Nia'];
	const file = () => `/Users/${pick(names).toLowerCase()}/Documents/${pick(words)}-${int(1, 99)}.${pick(['md', 'json', 'png', 'txt', 'csv'])}`;
	const payloads = {
		'app:get-version': () => [],
		'app:ready': () => [{ startup: int(120, 900), windows: int(1, 3) }],
		'settings:get': () => [pick(['theme', 'locale', 'autoUpdate', 'sidebarWidth', 'fontSize'])],
		'settings:set': () => [pick(['theme', 'locale', 'fontSize']), pick(['dark', 'light', 'en-US', 14, 16])],
		'window:minimize': () => [],
		'window:maximize': () => [{ id: int(1, 3) }],
		'window:bounds-changed': () => [{ x: int(0, 400), y: int(0, 300), width: int(800, 1600), height: int(600, 1000) }],
		'file:open': () => [file()],
		'file:save': () => [{ path: file(), bytes: int(200, 90000), encoding: 'utf8' }],
		'fs:read-dir': () => [`/Users/${pick(names).toLowerCase()}/Documents`, { withFileTypes: true }],
		'db:query': () => [`SELECT * FROM ${pick(['notes', 'tags', 'attachments'])} WHERE updated_at > ?`, [Date.UTC(2026, 9, int(1, 16))]],
		'auth:get-token': () => [{ scope: pick(['read', 'read write', 'admin']) }],
		'update:check': () => [{ channel: pick(['stable', 'beta']), current: `3.${int(0, 9)}.${int(0, 20)}` }],
		'update:download-progress': () => [{ percent: int(0, 100), bytesPerSecond: int(100000, 9000000) }],
		'tray:set-badge': () => [int(0, 40)],
		'notification:show': () => [{ title: `${pick(names)} mentioned you`, body: `in ${pick(words)}`, silent: rand() < 0.3 }],
		'clipboard:write': () => [{ text: `${pick(words)} ${pick(words)}`, html: null }],
		'log:write': () => [pick(['info', 'warn', 'error', 'debug']), `${pick(['sync', 'db', 'net', 'ui'])}: ${pick(words)} ${pick(['started', 'finished', 'retrying', 'failed'])}`],
		'menu:click': () => [{ id: pick(['file.new', 'file.open', 'edit.undo', 'view.reload', 'help.about']) }],
		'dialog:open-file': () => [{ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documents', extensions: ['md', 'txt'] }] }],
		'store:get': () => [pick(['recentFiles', 'windowState', 'lastSync'])],
		'store:set': () => [
			'recentFiles',
			Array.from({ length: int(1, 5) }, () => file()),
		],
		'sync:status': () => [
			{
				user: { id: int(1000, 99999), name: pick(names), email: `${pick(names).toLowerCase()}@example.com`, profile: { verified: rand() < 0.7, preferences: { theme: pick(['dark', 'light']), language: 'en-US' } } },
				pending: int(0, 40),
				lastSync: new Date(Date.UTC(2026, 9, 16, int(0, 23), int(0, 59))).toISOString(),
				tags: Array.from({ length: int(0, 4) }, () => pick(words)),
			},
		],
		'telemetry:event': () => [{ name: pick(['open_note', 'search', 'export', 'share']), props: { ms: int(1, 800) } }],
		ping: () => [],
		pong: () => [],
	};
	const channels = Object.keys(payloads);
	const swDetails = () => ({ serviceWorkerScope: 'chrome-extension://floigfkhicjhinimocdoblflbmefpjeg/', serviceWorkerVersionId: int(20, 40) });
	const events = [];
	let time = Date.UTC(2026, 9, 16, 9, 30, 0);
	let serial = 0;
	const push = (event) => {
		time += int(0, 900);
		events.push({ serialNumber: ++serial, timestamp: time, ...event });
	};
	while (events.length < COUNT) {
		const channel = pick(channels);
		const roll = rand();
		if (roll < 0.18) {
			const id = uuid();
			const sync = rand() < 0.3;
			push({ direction: 'renderer-to-main', channel, args: payloads[channel](), uuid: id });
			if (events.length < COUNT) push({ direction: 'main-to-renderer', channel, args: [rand() < 0.5 ? { ok: true, value: pick(words) } : int(0, 500)], method: sync ? 'sendSync (response)' : 'invoke (response)', responseTime: int(1, 250000) / 100, uuid: id });
		} else if (roll < 0.5) push({ direction: 'renderer-to-main', channel, args: payloads[channel]() });
		else if (roll < 0.74) push({ direction: 'main-to-renderer', channel, args: payloads[channel](), method: pick(['on', 'on', 'on', 'addListener']) });
		else if (roll < 0.82) push({ direction: 'service-worker-to-main', channel, args: payloads[channel](), serviceWorkerDetails: swDetails() });
		else if (roll < 0.9) push({ direction: 'main-to-service-worker', channel, args: payloads[channel](), serviceWorkerDetails: swDetails() });
		else if (roll < 0.95) push({ direction: 'renderer', channel: rand() < 0.2 ? '' : channel, args: [], method: pick(['off', 'removeListener', 'removeAllListeners']) });
		else push({ direction: 'main', channel, args: [], method: pick(['off', 'removeListener', 'removeAllListeners', 'removeHandler']) });
	}
	let store = events;
	const connect = ({ name } = {}) => {
		const messageListeners = new Set();
		const disconnectListeners = new Set();
		const deliver = (message) => messageListeners.forEach((listener) => listener(message));
		return {
			name,
			onMessage: { addListener: (f) => messageListeners.add(f), removeListener: (f) => messageListeners.delete(f) },
			onDisconnect: { addListener: (f) => disconnectListeners.add(f), removeListener: (f) => disconnectListeners.delete(f) },
			disconnect: () => messageListeners.clear(),
			postMessage(message) {
				if (message.type === 'get-all-events') {
					const snapshot = store.slice();
					setTimeout(() => snapshot.forEach((event) => deliver({ type: 'render-event', event })), 0);
				} else if (message.type === 'clear-events') store = [];
				else if (message.type === 'ping') setTimeout(() => deliver({ type: 'pong' }), 0);
			},
		};
	};
	const noop = { addListener() {}, removeListener() {} };
	globalThis.chrome = { runtime: { connect, onConnect: noop, onMessage: noop }, devtools: { panels: { create() {} } } };
})();
