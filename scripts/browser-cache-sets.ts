// The setup's Playwright and apt cache keys, and which cached browser sets a set may restore in place of its own (docs/ci-process.md "Caches"):
//   node scripts/browser-cache-sets.ts keys <os> <playwright version> '<browsers>' <run id>-<attempt>   GITHUB_OUTPUT lines for the four keys
//   node scripts/browser-cache-sets.ts restored <os> <playwright version> '<browsers>' '<matched key>'   own, superset, subset, other or none
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

export interface Keys {
	readonly browsers: string;
	readonly browsersRestore: readonly string[];
	readonly apt: string;
	readonly aptRestore: readonly string[];
}

const browsersPrefix = (os: string, version: string) => `playwright-${os}-${version}-`;
const aptPrefix = (os: string, version: string) => `playwright-apt-${os}-${version}-`;

/** The browsers cache is one entry per set; the apt cache is one entry per run, restored by the newest `<set>-` prefix. */
export function keys(os: string, version: string, browsers: string, run: string): Keys {
	const sets = supersets(browsers);
	return {
		browsers: browsersPrefix(os, version) + browsers,
		browsersRestore: sets.map((s) => browsersPrefix(os, version) + s),
		apt: `${aptPrefix(os, version)}${browsers}-${run}`,
		aptRestore: [browsers, ...sets].map((s) => `${aptPrefix(os, version)}${s}-`),
	};
}

/** The browser set a cache key was saved for, or undefined if the key is not one of the setup's. */
export function setOf(os: string, version: string, key: string): string | undefined {
	if (key.startsWith(aptPrefix(os, version))) return /^(.*)-\d+-\d+$/.exec(key.slice(aptPrefix(os, version).length))?.[1];
	if (key.startsWith(browsersPrefix(os, version))) return key.slice(browsersPrefix(os, version).length);
	return undefined;
}

/** How the set a restored cache was saved for compares with the set asked for. */
export function relation(browsers: string, saved: string | undefined): 'own' | 'superset' | 'subset' | 'other' | 'none' {
	if (saved === undefined) return 'none';
	const want = names(browsers);
	const have = names(saved);
	const holds = (a: Set<string>, b: Set<string>) => [...b].every((x) => a.has(x));
	if (holds(have, want) && holds(want, have)) return 'own';
	if (holds(have, want)) return 'superset';
	if (holds(want, have)) return 'subset';
	return 'other';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const [command, os = '', version = '', browsers = '', last = ''] = process.argv.slice(2);
	if (command === 'keys') {
		const k = keys(os, version, browsers, last);
		const multi = (name: string, lines: readonly string[]) => `${name}<<EOF\n${lines.join('\n')}\nEOF`;
		console.log([`browsers=${k.browsers}`, multi('browsers-restore', k.browsersRestore), `apt=${k.apt}`, multi('apt-restore', k.aptRestore)].join('\n'));
	} else if (command === 'restored') {
		console.log(last ? relation(browsers, setOf(os, version, last)) : 'none');
	} else {
		console.error("usage: node scripts/browser-cache-sets.ts keys|restored <os> <version> '<browsers>' <run-attempt|matched key>");
		process.exit(2);
	}
}
