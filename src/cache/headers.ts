export interface CacheControl {
	readonly public?: boolean;
	readonly private?: boolean;
	readonly noStore?: boolean;
	readonly noCache?: boolean;
	readonly immutable?: boolean;
	readonly mustRevalidate?: boolean;
	readonly maxAge?: number;
	readonly sMaxAge?: number;
	readonly staleWhileRevalidate?: number;
}

export function parseCacheControl(value: string | null | undefined): CacheControl {
	const out: Record<string, boolean | number> = {};
	for (const part of (value ?? '').split(',')) {
		const [rawKey, rawValue] = part.trim().split('=');
		const key = rawKey?.trim().toLowerCase();
		if (!key) continue;
		const n = Number(rawValue?.replace(/"/g, ''));
		if (key === 'public') out.public = true;
		else if (key === 'private') out.private = true;
		else if (key === 'no-store') out.noStore = true;
		else if (key === 'no-cache') out.noCache = true;
		else if (key === 'immutable') out.immutable = true;
		else if (key === 'must-revalidate') out.mustRevalidate = true;
		else if (key === 'max-age' && Number.isFinite(n)) out.maxAge = n;
		else if (key === 's-maxage' && Number.isFinite(n)) out.sMaxAge = n;
		else if (key === 'stale-while-revalidate' && Number.isFinite(n)) out.staleWhileRevalidate = n;
	}
	return out as CacheControl;
}

export const parseVary = (value: string | null | undefined): string[] =>
	(value ?? '')
		.split(',')
		.map((v) => v.trim().toLowerCase())
		.filter(Boolean);

export type CdnStatus = 'hit' | 'miss' | 'stale' | 'bypass' | 'prerender' | 'revalidated' | 'dynamic' | 'expired' | 'unknown';

export interface CdnFacts {
	/** The CDN that answered, by the header it sends. */
	readonly vendor: 'vercel' | 'cloudflare' | 'netlify' | 'fastly' | 'cloudfront' | 'other';
	readonly status: CdnStatus;
	readonly raw: string;
}

const statusWord = (raw: string): CdnStatus => {
	const word = raw.trim().toLowerCase();
	if (/\bhit\b/.test(word) || word === 'hit') return 'hit';
	if (/\bstale\b/.test(word)) return 'stale';
	if (/\bprerender\b/.test(word)) return 'prerender';
	if (/\brevalidated\b/.test(word)) return 'revalidated';
	if (/\bexpired\b/.test(word)) return 'expired';
	if (/\bbypass\b/.test(word)) return 'bypass';
	if (/\bdynamic\b/.test(word)) return 'dynamic';
	if (/\bmiss\b|\bfwd=miss\b/.test(word)) return 'miss';
	return 'unknown';
};

/** What the CDN in front says about this response: x-vercel-cache, cf-cache-status, Netlify's Cache-Status, x-cache. */
export function cdnFacts(headers: Headers): CdnFacts | undefined {
	const vercel = headers.get('x-vercel-cache');
	if (vercel) return { vendor: 'vercel', status: statusWord(vercel), raw: vercel };
	const cf = headers.get('cf-cache-status');
	if (cf) return { vendor: 'cloudflare', status: statusWord(cf), raw: cf };
	const status = headers.get('cache-status');
	if (status) {
		const netlify = /netlify/i.test(status);
		// RFC 9211: `"Netlify Edge"; hit` or `"Netlify Edge"; fwd=miss`.
		return { vendor: netlify ? 'netlify' : 'other', status: /;\s*hit\b/i.test(status) ? 'hit' : statusWord(status), raw: status };
	}
	const xCache = headers.get('x-cache');
	if (xCache) return { vendor: /cloudfront/i.test(xCache) ? 'cloudfront' : headers.get('x-served-by') ? 'fastly' : 'other', status: statusWord(xCache.split(/\s+from\b/i)[0]!), raw: xCache };
	return undefined;
}

/** Cookie names a response sets. */
export function setCookieNames(headers: Headers): string[] {
	return headers.getSetCookie().map((c) => c.split('=')[0]!.trim()).filter(Boolean);
}

/** A file name carrying a bundler content hash (`app.CdD1aHkZ.js`, `chunk-L4A9asp4.js`, `main.3f2a9c01.css`). */
export function isContentHashed(path: string): boolean {
	const name = path.split(/[?#]/)[0]!.split('/').pop() ?? '';
	const match = name.match(/[.-]([A-Za-z0-9_]{8,})(?:\.[a-z0-9]+)+$/);
	if (!match) return false;
	const hash = match[1]!;
	if (/^[0-9a-f]{8,}$/.test(hash)) return true;
	if (/\d/.test(hash) && /[A-Za-z]/.test(hash)) return true;
	// An all-letter base64url hash mixes cases without forming a word: `BxYzAbCd`, not `Carousel`.
	return /[A-Z][a-z]?[A-Z]/.test(hash) && /[a-z]/.test(hash);
}

const YEAR = 31_536_000;

/** Long enough that a browser keeps the file across visits without asking: what a content-hashed file should get. */
export const longLived = (cc: CacheControl) => !cc.noStore && !cc.noCache && !cc.private && (cc.maxAge ?? 0) >= 30 * 86_400;

/** An HTML page a browser or CDN may keep a long time without asking: stale for as long as it is kept. */
export const staleForever = (cc: CacheControl) => cc.immutable === true || (cc.maxAge ?? 0) >= 86_400 || (cc.sMaxAge ?? 0) >= YEAR;

export const IMMUTABLE = 'public, max-age=31536000, immutable';
/** A page personal to the visitor: no shared cache keeps it; the browser asks again before reusing it. */
export const NEVER_SHARED = 'private, no-cache';
/** A signed-in or session page: not stored anywhere. */
export const NEVER_STORED = 'private, no-store';
