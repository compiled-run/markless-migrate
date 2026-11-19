// Which cached browser sets a setup may restore in place of its own (docs/ci-process.md "Caches"):
//   node scripts/browser-cache-sets.ts '<browsers>'   prints each warmed set holding every browser asked for and more, fewest extra first
import { pathToFileURL } from 'node:url';

/** The browser sets `.github/workflows/browser-cache.yml` keeps cached on main. */
export const WARMED = ['chromium', 'webkit', 'chromium webkit', 'chromium firefox webkit'] as const;

const names = (set: string) => new Set(set.split(/\s+/).filter(Boolean));

/** Warmed sets that are strict supersets of `browsers`, fewest extra browsers first: a set missing one asked-for browser never qualifies. */
export function supersets(browsers: string, warmed: readonly string[] = WARMED): string[] {
	const want = names(browsers);
	return warmed
		.map((set) => ({ set, have: names(set) }))
		.filter(({ have }) => have.size > want.size && [...want].every((b) => have.has(b)))
		.sort((a, b) => a.have.size - b.have.size)
		.map(({ set }) => set);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	for (const set of supersets(process.argv[2] ?? '')) console.log(set);
}
