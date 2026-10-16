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
	return fileName(url)
		.replace(/\.[a-z0-9]+$/i, '')
		.split(/[-.~]/)
		.some(isHashToken);
}

// Fingerprinted: the framework's own output directory, or a hashed name that the page's built HTML, JS or CSS refers to.
export function isFingerprinted(url: string, builtTexts: readonly string[]): boolean {
	if (!url.startsWith('/')) return false;
	const path = url.split(/[?#]/)[0]!;
	if (FRAMEWORK_OUTPUT.some((prefix) => path.startsWith(prefix))) return true;
	if (!hasContentHash(path)) return false;
	const name = fileName(path);
	return builtTexts.some((text) => text.includes(name));
}
