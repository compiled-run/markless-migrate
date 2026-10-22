// PageSpeed Insights (Lighthouse, mobile) for each URL, five runs, the median of each metric:
// PSI_API_KEY=... node deploy/embeds/psi.ts <label> <url>... >> deploy/embeds/psi.jsonl
const key = process.env.PSI_API_KEY;
if (!key) throw new Error('PSI_API_KEY is not set');
const [label, ...urls] = process.argv.slice(2);
if (!label || !urls.length) throw new Error('usage: psi.ts <label> <url>...');

interface Run {
	readonly bytes: number;
	readonly requests: number;
	readonly fcp: number;
	readonly lcp: number;
	readonly si: number;
	readonly tbt: number;
	readonly score: number;
}

async function once(url: string): Promise<Run> {
	const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
	api.searchParams.set('url', url);
	api.searchParams.set('strategy', 'mobile');
	api.searchParams.set('category', 'performance');
	api.searchParams.set('key', key!);
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(api);
		if (response.ok) {
			const lh = ((await response.json()) as { lighthouseResult: { audits: Record<string, { numericValue?: number; details?: { items?: unknown[] } }>; categories: { performance: { score: number } } } }).lighthouseResult;
			const audit = (id: string) => lh.audits[id]?.numericValue ?? Number.NaN;
			return { bytes: audit('total-byte-weight'), requests: lh.audits['network-requests']?.details?.items?.length ?? Number.NaN, fcp: audit('first-contentful-paint'), lcp: audit('largest-contentful-paint'), si: audit('speed-index'), tbt: audit('total-blocking-time'), score: lh.categories.performance.score };
		}
		if (attempt >= 3) throw new Error(`${url}: ${response.status} ${await response.text()}`);
		await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
	}
}

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)]!;
};

for (const url of urls) {
	const runs: Run[] = [];
	for (let i = 0; i < 5; i++) runs.push(await once(url));
	const pick = (k: keyof Run) => median(runs.map((r) => r[k]));
	console.log(JSON.stringify({ label, url, at: new Date().toISOString(), runs: runs.length, bytes: pick('bytes'), requests: pick('requests'), fcpMs: Math.round(pick('fcp')), lcpMs: Math.round(pick('lcp')), speedIndexMs: Math.round(pick('si')), tbtMs: Math.round(pick('tbt')), score: pick('score'), all: runs }));
}
