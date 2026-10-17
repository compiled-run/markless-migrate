const FRAMEWORK_OUTPUT = ['/_next/', '/_nuxt/', '/_astro/', '/_app/immutable/'];

function isHashToken(token: string): boolean {
	if (token.length < 8 || !/^[A-Za-z0-9_]+$/.test(token) || /^\d+$/.test(token)) return false;
	if (/^[0-9a-f]+$/i.test(token)) return /\d/.test(token) || (/[a-f]/.test(token) && /[A-F]/.test(token));
	if (/\d/.test(token) && /[A-Za-z]/.test(token)) return true;
	return /[a-z]/.test(token) && /[A-Z]/.test(token) && !/^[A-Z]?[a-z]+(?:[A-Z][a-z]+)*$/.test(token);
}

export function fileName(url: string): string {
	const path = url.split(/[?#]/)[0]!;
	return path.slice(path.lastIndexOf('/') + 1);
}

// A content hash is a token of eight or more characters that reads as random: dates, versions and words do not count.
export function hasContentHash(url: string): boolean {
	const base = fileName(url).replace(/\.[a-z0-9]+$/i, '');
	// Vite and Rollup hash in base64url, so an eight-character hash may itself contain '-' or '_'.
	const tail = /[-.]([A-Za-z0-9_-]{8})$/.exec(base)?.[1];
	if (tail && /[-_]/.test(tail) && isHashToken(tail.replace(/-/g, '_'))) return true;
	// Angular's esbuild builder hashes in upper-case base32: chunk-BBLBSSIH.js, styles-V7LOWGDA.css.
	if (/-[A-Z2-7]{8}$/.test(base)) return true;
	return base.split(/[-.~]/).some(isHashToken);
}

// A bundler chunk (Vite, Rollup, esbuild, webpack): a script or stylesheet ending in an eight-character base64url hash, which may read like a word (users-Bkzkyznz.js); it counts only when the built output names it.
function chunkName(name: string): boolean {
	const hash = /[-.]([A-Za-z0-9_-]{8})\.(?:m?js|css)$/.exec(name)?.[1];
	return Boolean(hash && /[A-Z0-9_-]/.test(hash));
}

// Fingerprinted: the framework's own output directory, or a hashed name that the page's built HTML, JS or CSS refers to.
export function isFingerprinted(url: string, builtTexts: readonly string[]): boolean {
	if (!url.startsWith('/')) return false;
	const path = url.split(/[?#]/)[0]!;
	if (FRAMEWORK_OUTPUT.some((prefix) => path.startsWith(prefix))) return true;
	const name = fileName(path);
	if (!hasContentHash(path) && !chunkName(name)) return false;
	if (builtTexts.some((text) => text.includes(name))) return true;
	// Webpack's runtime (Docusaurus, CRA) builds chunk names from an id and a hash map, so only the hash is written.
	const hashes = name.replace(/\.[a-z0-9]+$/i, '').split(/[-.~]/).filter(isHashToken);
	return hashes.length > 0 && hashes.every((hash) => builtTexts.some((text) => text.includes(`"${hash}"`)));
}

const JAVASCRIPT = new Set(['application/javascript', 'text/javascript', 'application/x-javascript', 'text/ecmascript', 'application/ecmascript']);

// Two Content-Type values a browser treats alike: parameters aside, and the JavaScript MIME aliases as one.
export function sameContentType(a: string | undefined, b: string | undefined): boolean {
	const essence = (value: string | undefined) => {
		const type = (value ?? '').split(';')[0]!.trim().toLowerCase();
		return JAVASCRIPT.has(type) ? 'text/javascript' : type;
	};
	return essence(a) === essence(b);
}
