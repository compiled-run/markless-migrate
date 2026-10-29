#!/usr/bin/env node
// Compares what two or more converts wrote, up to a consistent renaming of the ids a framework generates (React's useId,
// React Aria's, Radix's), so a change to how the old pages were driven can be told apart from one to what they showed.
//
//   node scripts/convert-diff.ts <candidate app> <reference app>...
//
// A file of the candidate matches when it equals the same file of any reference once each one's generated ids are
// numbered by first occurrence (cache entries one by one, other files whole). Files whose names are content hashes are
// compared as sets. Exit 1 when anything differs beyond that.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Ids React (`_r_1f_`, `_R_3mbr6lb_`, `:r1:`, `«r1»`) and React Aria (`react-aria-12`) generate, which differ by load. */
const GENERATED = /_[rR]_[0-9a-zA-Z]+_|:[rR][0-9a-zA-Z]*:|«[rR][0-9a-zA-Z]*»|react-aria\d*-\d+(?![\w-])|\bmm-[0-9a-f]{8}(?=-)/g;
const HASHED = /_converted\/layers\/[0-9a-f]{16}\.html/g;

/** The text with each distinct generated id replaced by its order of first occurrence. */
export function canonicalIds(text: string): string {
	const seen = new Map<string, number>();
	return text.replace(HASHED, '_converted/layers/HASH.html').replace(GENERATED, (id) => {
		if (!seen.has(id)) seen.set(id, seen.size);
		return `ID${seen.get(id)}`;
	});
}

/** The text with every generated id the same: what remains when two files differ only in which ids they share. */
export const withoutIds = (text: string): string => text.replace(HASHED, '_converted/layers/HASH.html').replace(GENERATED, 'ID');

// A recorded cache file is a list of observations, each from its own page load: each is canonicalized on its own.
function canonicalFile(path: string, text: string, erase: boolean): string {
	const one = erase ? withoutIds : canonicalIds;
	if (!path.includes('.migrate/') || !path.endsWith('.json')) return one(text);
	try {
		const json = JSON.parse(text) as unknown;
		const parts = (value: unknown): string[] => {
			if (Array.isArray(value)) return value.map((v) => one(JSON.stringify(v)));
			if (value && typeof value === 'object') return Object.entries(value).map(([k, v]) => (k === 'reveals' || k === 'charts' ? parts(v).join('\n') : one(JSON.stringify([k, v]))));
			return [one(JSON.stringify(value))];
		};
		return parts(json).join('\n');
	} catch {
		return one(text);
	}
}

const SKIP = new Set(['node_modules', 'captures', 'prerender', 'report.json', 'sources.json']);
function files(root: string, dir = root, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (SKIP.has(name) || name === 'dev') continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) files(root, path, out);
		else out.push(relative(root, path));
	}
	return out;
}

/** Files grouped under a name with generated ids and content hashes taken out: a group is compared as a set of contents. */
function grouped(root: string, erase: boolean): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	for (const path of files(root)) {
		// A route's recordings may sit under the key of its old page (record-key.ts): the same file either way.
		const name = withoutIds(path).replace(/^(\.migrate\/convert\/[^/]+)\/[0-9a-f]{16}\//, '$1/').replace(/[0-9a-f]{16}\.html$/, 'HASH.html').replace(/\/layer-\d+\.tsrx$/, '/layer-N.tsrx');
		const set = out.get(name) ?? new Set<string>();
		set.add(canonicalFile(path, readFileSync(join(root, path), 'utf8'), erase));
		out.set(name, set);
	}
	return out;
}

const same = (a: Set<string> | undefined, b: Set<string> | undefined) => (!a && !b) || (!!a && !!b && a.size === b.size && [...a].every((x) => b.has(x)));

/** The candidate's files that match no reference up to renamed ids, and of those, the ones that match once ids are erased. */
export function compareConverts(candidate: string, references: readonly string[]): { readonly files: number; readonly renamed: string[]; readonly idsOnly: string[] } {
	const [c, ce] = [grouped(candidate, false), grouped(candidate, true)];
	const refs = references.map((r) => [grouped(r, false), grouped(r, true)] as const);
	const names = new Set([...c.keys(), ...refs.flatMap(([r]) => [...r.keys()])]);
	const renamed: string[] = [];
	const idsOnly: string[] = [];
	for (const name of names) {
		if (refs.some(([r]) => same(c.get(name), r.get(name)))) continue;
		(refs.some(([, r]) => same(ce.get(name), r.get(name))) ? idsOnly : renamed).push(name);
	}
	return { files: names.size, renamed: renamed.sort(), idsOnly: idsOnly.sort() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [candidate, ...references] = process.argv.slice(2).map((p) => (existsSync(join(p, 'app')) ? join(p, 'app') : p));
	if (!candidate || !references.length) {
		console.error('usage: node scripts/convert-diff.ts <candidate app> <reference app>...');
		process.exit(2);
	}
	const { files: count, renamed, idsOnly } = compareConverts(candidate, references);
	console.log(`${count} files; ${count - renamed.length - idsOnly.length} match a reference up to renamed ids; ${idsOnly.length} differ only in which ids they share; ${renamed.length} differ otherwise`);
	for (const f of idsOnly) console.log(`  ids only  ${f}`);
	for (const f of renamed) console.log(`  differs   ${f}`);
	process.exit(renamed.length || idsOnly.length ? 1 : 0);
}
