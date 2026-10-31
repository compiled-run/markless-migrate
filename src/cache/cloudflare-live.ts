/** One failed expectation of a Cloudflare deployment. */
export interface CloudflareFinding {
	readonly url: string;
	readonly problem: string;
}

export interface CloudflareLiveOptions {
	/** The path prefix the app's router fetches fragments from, read from its build. */
	readonly fragmentPath?: string;
	/** The comments a fragment response ends with. */
	readonly fragmentMarkers?: readonly string[];
	readonly headers?: Readonly<Record<string, string>>;
}

const BUILD_URL = /<(?:script|link)\b[^>]*?\b(?:src|href)=["'](\/build\/[^"']+\.(?:js|css))["']/i;

/**
 * Reads a Cloudflare deployment route by route: each prerendered page and its fragment URL must come from the uploaded
 * files (Cloudflare marks those with cf-cache-status; a Worker response carries none), answer at its own URL without a
 * redirect, and be the document or the fragment it was asked for; a client chunk must come from the files too, kept for a year.
 */
export async function checkCloudflareLive(origin: string, routes: readonly string[], options: CloudflareLiveOptions = {}): Promise<CloudflareFinding[]> {
	const findings: CloudflareFinding[] = [];
	const get = (path: string, encoding = 'gzip, deflate, br, zstd') => fetch(new URL(path, origin), { redirect: 'manual', headers: { 'accept-encoding': encoding, ...options.headers } });
	const markers = options.fragmentMarkers ?? [];
	const isFragment = (body: string) => markers.some((marker) => body.trimEnd().endsWith(marker));
	let chunk: string | undefined;
	for (const route of routes) {
		const urls = [route, ...(options.fragmentPath ? [`${options.fragmentPath}${route}`] : [])];
		for (const [i, url] of urls.entries()) {
			const response = await get(url);
			const body = await response.text();
			const add = (problem: string) => findings.push({ url, problem });
			if (response.status !== 200) {
				add(`answered ${response.status}${response.headers.get('location') ? ` to ${response.headers.get('location')}` : ''}, not 200`);
				continue;
			}
			if (!/^text\/html/i.test(response.headers.get('content-type') ?? '')) add(`is ${response.headers.get('content-type')}, not HTML`);
			if (!response.headers.has('cf-cache-status')) add('ran the Worker: a prerendered page or fragment should come from the uploaded files');
			if (markers.length && isFragment(body) !== (i === 1)) add(i === 1 ? 'is not a fragment' : 'is a fragment, not the document');
			chunk ??= i === 0 ? BUILD_URL.exec(body)?.[1] : undefined;
		}
	}
	if (chunk) {
		const response = await get(chunk);
		await response.arrayBuffer();
		if (response.status !== 200) findings.push({ url: chunk, problem: `answered ${response.status}` });
		else {
			if (!response.headers.has('cf-cache-status')) findings.push({ url: chunk, problem: 'ran the Worker: a client chunk should come from the uploaded files' });
			if (!/\bimmutable\b/.test(response.headers.get('cache-control') ?? '')) findings.push({ url: chunk, problem: `is kept by browsers only as ${response.headers.get('cache-control')}` });
		}
	} else if (routes.length) findings.push({ url: routes[0]!, problem: 'loads no /build/ chunk to check' });
	return findings;
}

/**
 * Opens each route in Chromium and names every same-origin request the page makes as it loads, scripts it injects
 * included, that ran the Worker (no cf-cache-status): each one is a billed Worker request on every page view.
 */
export async function workerRequestsOnLoad(origin: string, routes: readonly string[], options: { readonly headers?: Readonly<Record<string, string>>; readonly settleMs?: number } = {}): Promise<CloudflareFinding[]> {
	const { chromium } = await import('playwright');
	const browser = await chromium.launch();
	const findings: CloudflareFinding[] = [];
	try {
		for (const route of routes) {
			const context = await browser.newContext(options.headers ? { extraHTTPHeaders: { ...options.headers } } : {});
			const page = await context.newPage();
			const ran = new Set<string>();
			const redirected = new Set<string>();
			page.on('response', (response) => {
				const url = new URL(response.url());
				if (!/^https?:$/.test(url.protocol) || url.origin !== new URL(origin).origin || response.headers()['cf-cache-status']) return;
				// Cloudflare's asset layer answers x.html with a redirect to x: free, but one more round trip.
				const location = response.headers()['location'];
				if (response.status() >= 300 && response.status() < 400 && location) redirected.add(`${url.pathname}${url.search} to ${location}`);
				else ran.add(`${response.status()} ${url.pathname}${url.search}`);
			});
			await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
			await page.waitForTimeout(options.settleMs ?? 3000);
			await context.close();
			for (const request of ran) findings.push({ url: route, problem: `loading it ran the Worker for ${request}` });
			for (const request of redirected) findings.push({ url: route, problem: `loading it was redirected, one more round trip, for ${request}` });
		}
	} finally {
		await browser.close();
	}
	return findings;
}
