// registry/directory.json without its inline logos (scripts/directory-index.mjs): loaded at idle, so the first search
// finds it here; each logo is a file of its own (never inlined: <use> takes no data: URL), fetched only when its row is shown.
import type { DirectoryEntry } from './directory.ts';
import index from './directory/index.json' with { type: 'json' };

export const registries: readonly DirectoryEntry[] = index;

declare global {
	interface ImportMeta {
		glob(pattern: string, options: { query: string; import: 'default'; eager: true }): Record<string, string>;
	}
}

const files = import.meta.glob('./directory/logos/*.svg', { query: '?no-inline', import: 'default', eager: true });
export const logos: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.slice('./directory/logos/'.length, -'.svg'.length), url]));
