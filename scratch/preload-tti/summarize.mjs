import { readFileSync } from 'node:fs';
const file = process.argv[2];
const lines = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const cells = new Map();
for (const { label, run } of lines) {
	const [browser, profile, url] = label.split(' ');
	const side = new URL(url).hostname.replace('.test', '');
	const k = `${profile}|${browser}|${side}`;
	if (!cells.has(k)) cells.set(k, []);
	cells.get(k).push(run);
}
const med = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const q = (a, p) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const maxConc = (reqs, until) => { const ev = []; for (const r of reqs) if (r.start < until && r.type === 'script') { ev.push([r.start, 1]); ev.push([Math.min(r.end, until), -1]); } ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); let c = 0, m = 0; for (const [, d] of ev) { c += d; m = Math.max(m, c); } return m; };
const rounds = (reqs, until) => { const st = reqs.filter((r) => r.type === 'script' && r.end <= until).map((r) => r.start).sort((a, b) => a - b); let n = 0, last = -1e9; for (const s of st) { if (s - last > 50) n++; last = s; } return n; };
const out = {};
for (const [k, runs] of cells) {
	const ok = runs.filter((r) => !r.error && r.answered != null);
	const f = (fn) => ok.map(fn);
	const row = {
		n: ok.length, errors: runs.length - ok.length,
		paint: f((r) => r.firstFrame), answered: f((r) => r.answered), visToAns: f((r) => r.answered - (r.firstFrame ?? r.fcp)),
		reqsByAnswer: f((r) => r.requests.filter((x) => x.start < r.answered).length),
		jsReqsByAnswer: f((r) => r.requests.filter((x) => x.start < r.answered && x.type === 'script').length),
		reqsAll: f((r) => r.requests.length),
		bytesByAnswer: f((r) => r.bytesByAnswer), jsDlByAnswer: f((r) => r.jsDownloadedByAnswer), jsExec: f((r) => r.jsExecutedByAnswer),
		maxJsConcurrency: f((r) => maxConc(r.requests, r.answered)), jsRounds: f((r) => rounds(r.requests, r.answered)),
		protocols: [...new Set(ok.flatMap((r) => r.protocols ?? []))].join(','),
	};
	const s = {};
	for (const [m, v] of Object.entries(row)) s[m] = Array.isArray(v) ? { med: med(v), p25: q(v, 0.25), p75: q(v, 0.75), min: Math.min(...v.filter((x) => x != null)), max: Math.max(...v.filter((x) => x != null)) } : v;
	out[k] = s;
}
console.log(JSON.stringify(out, null, 1));
