// Records a fixed slice of the Hacker News Firebase API into hn-snapshot.json.gz: node deploy/hn-graphql/snapshot.mjs
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const API = 'https://hacker-news.firebaseio.com/v0';
const FEEDS = { topstories: 120, newstories: 120, beststories: 60, showstories: 30, askstories: 30, jobstories: 30 };
const WITH_COMMENTS = 6;
const COMMENT_DEPTH = 6;
const data = {};
const get = async (path) => {
	if (path in data) return data[path];
	for (let attempt = 0; ; attempt++) {
		try {
			const res = await fetch(`${API}/${path}.json`);
			data[path] = await res.json();
			return data[path];
		} catch (error) {
			if (attempt > 3) throw error;
		}
	}
};
const pool = async (items, fn, size = 24) => {
	const out = [];
	let i = 0;
	await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const at = i++; out[at] = await fn(items[at]); } }));
	return out;
};
const at = Date.now();
const ids = new Set();
for (const [feed, n] of Object.entries(FEEDS)) {
	const list = (await get(feed)).slice(0, n);
	data[feed] = list;
	list.forEach((id) => ids.add(id));
}
const items = (await pool([...ids], (id) => get(`item/${id}`))).filter(Boolean);
const tree = async (kids, depth) => {
	if (!kids?.length || depth > COMMENT_DEPTH) return;
	const children = (await pool(kids, (id) => get(`item/${id}`))).filter(Boolean);
	await Promise.all(children.map((c) => tree(c.kids, depth + 1)));
};
for (const id of data.topstories.slice(0, WITH_COMMENTS)) await tree(data[`item/${id}`]?.kids, 1);
await pool([...new Set(items.map((i) => i.by).filter(Boolean))], (by) => get(`user/${by}`));
await writeFile(new URL('./hn-snapshot.json.gz', import.meta.url), gzipSync(`${JSON.stringify({ at: new Date(at).toISOString(), data })}\n`, { level: 9 }));
console.log(`${Object.keys(data).length} paths at ${new Date(at).toISOString()}`);
