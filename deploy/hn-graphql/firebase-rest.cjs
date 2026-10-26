// Preloaded into the old app (node -r): firebase/app and firebase/database answered over the RTDB REST API at the app's databaseURL, so DB_URI can point at the snapshot.
const Module = require('module');
const http = require('http');
const https = require('https');

const getJson = (url) =>
	new Promise((resolve, reject) => {
		(url.startsWith('https:') ? https : http)
			.get(url, (res) => {
				let body = '';
				res.setEncoding('utf8');
				res.on('data', (c) => (body += c));
				res.on('end', () => {
					try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
				});
			})
			.on('error', reject);
	});
const app = { initializeApp: (options) => ({ options }) };
const database = {
	getDatabase: (a) => ({ url: a.options.databaseURL.replace(/\/$/, '') }),
	ref: (db, path = '') => ({ url: db.url, path: path.replace(/\/$/, '') }),
	child: (ref, path) => ({ url: ref.url, path: `${ref.path}/${path}` }),
	get: (ref) => getJson(`${ref.url}${ref.path}.json`).then((value) => ({ val: () => value })),
};
const load = Module._load;
Module._load = function (request, ...rest) {
	if (request === 'firebase/app') return app;
	if (request === 'firebase/database') return database;
	return load.call(this, request, ...rest);
};
