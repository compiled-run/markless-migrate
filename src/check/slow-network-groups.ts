// Routes whose slow-network loads one measured route stands for: the same files ahead of the first paint and the first click on
// both sides, and HTML on the new side no larger and on the old side no smaller than the measured route's.

/** What a page makes the browser fetch before it can paint and answer: its HTML's size and the files it names. */
export interface CriticalPath {
	readonly bytes: number;
	readonly files: readonly string[];
}

/** The scripts, stylesheets, preloads and eager images a page's HTML names, in order (inline ones count in its size), and its length in bytes. */
export function criticalPathOf(html: string): CriticalPath {
	const files: string[] = [];
	for (const tag of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
		const text = tag[0];
		const rel = /\brel=["']?([^"'\s>]+)/i.exec(text)?.[1]?.toLowerCase();
		if (tag[1]!.toLowerCase() === 'link' && !(rel && /^(stylesheet|preload|modulepreload)$/.test(rel))) continue;
		const ref = /\b(?:src|href)=["']([^"']+)["']/i.exec(text)?.[1];
		if (ref) files.push(`${rel ?? 'script'} ${ref}`);
	}
	// Images that load at once can be the largest paint.
	for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
		const src = /\bsrc=["']([^"']+)["']/i.exec(img[0])?.[1];
		if (src && !/\bloading=["']?lazy/i.test(img[0])) files.push(`img ${src}`);
	}
	return { bytes: Buffer.byteLength(html), files };
}

export interface NetworkGroup {
	/** The route measured. */
	readonly route: string;
	/** The routes its measurement stands for. */
	readonly members: readonly string[];
}

/**
 * Groups routes by the files on both sides' critical paths. Within a group the route with the largest new HTML is measured
 * first, and stands for every route whose new HTML is no larger and old HTML no smaller than its own; the rest form groups
 * of their own. A route either side could not be fetched for is measured alone.
 */
export function networkGroups(paths: ReadonlyMap<string, { readonly old?: CriticalPath; readonly new?: CriticalPath }>): NetworkGroup[] {
	const out: NetworkGroup[] = [];
	const bySignature = new Map<string, string[]>();
	for (const [route, { old, new: next }] of paths) {
		if (!old || !next) {
			out.push({ route, members: [] });
			continue;
		}
		const signature = JSON.stringify([old.files, next.files]);
		(bySignature.get(signature) ?? bySignature.set(signature, []).get(signature)!).push(route);
	}
	for (const routes of bySignature.values()) {
		let left = [...routes].sort((a, b) => paths.get(b)!.new!.bytes - paths.get(a)!.new!.bytes || a.localeCompare(b));
		while (left.length) {
			const [route, ...rest] = left;
			const measured = paths.get(route!)!;
			const members = rest.filter((r) => paths.get(r)!.new!.bytes <= measured.new!.bytes && paths.get(r)!.old!.bytes >= measured.old!.bytes);
			out.push({ route: route!, members });
			left = rest.filter((r) => !members.includes(r));
		}
	}
	const order = new Map([...paths.keys()].map((r, i) => [r, i]));
	return out.sort((a, b) => order.get(a.route)! - order.get(b.route)!);
}
