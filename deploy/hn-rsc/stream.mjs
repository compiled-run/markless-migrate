// Times one page's response: first byte, when the story list or story and the comments arrive, and the end; five runs, median.
const [origin, path, runs = '5'] = process.argv.slice(2);
const marks = {
	story: /class="(?:story[_ ]|[^"]*\bstory\b)/,
	comments: /class="(?:comment[_ ]|[^"]*\bcomment\b)/,
	pending: /<div class="[^"]*item-skeleton/,
};
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const results = [];
for (let i = 0; i < Number(runs); i++) {
	const start = performance.now();
	const res = await fetch(origin + path, { headers: { 'accept-encoding': 'identity', ...(process.env.COOKIE ? { cookie: process.env.COOKIE } : {}) } });
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let text = '';
	const at = { ttfb: undefined, story: undefined, comments: undefined, pending: undefined, chunks: 0 };
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		const t = performance.now() - start;
		at.ttfb ??= t;
		at.chunks++;
		text += decoder.decode(value, { stream: true });
		for (const [k, re] of Object.entries(marks)) if (at[k] === undefined && re.test(text)) at[k] = t;
	}
	at.end = performance.now() - start;
	at.bytes = text.length;
	results.push(at);
}
const pick = (k) => {
	const xs = results.map((r) => r[k]).filter((x) => x !== undefined);
	return xs.length ? Math.round(median(xs)) : '-';
};
console.log(JSON.stringify({ origin, path, ttfb: pick('ttfb'), pending: pick('pending'), story: pick('story'), comments: pick('comments'), end: pick('end'), chunks: pick('chunks'), bytes: pick('bytes') }));
