// Each page-script entry's static import closure, as the URLs the document modulepreloads beside the entry: the browser
// otherwise finds them only once the entry has arrived and run, a round trip later, behind whatever else is downloading.
export interface BundleChunk {
	readonly type: 'chunk' | 'asset';
	readonly fileName: string;
	readonly name?: string;
	readonly isEntry?: boolean;
	readonly imports?: readonly string[];
}

export function staticImports(bundle: Readonly<Record<string, BundleChunk>>): Record<string, string[]> {
	const byFile = new Map(Object.values(bundle).map((chunk) => [chunk.fileName, chunk]));
	const out: Record<string, string[]> = {};
	for (const entry of Object.values(bundle)) {
		if (entry.type !== 'chunk' || !entry.isEntry || !entry.name) continue;
		const seen = new Set<string>();
		const visit = (file: string) => {
			for (const next of byFile.get(file)?.imports ?? []) {
				if (seen.has(next)) continue;
				seen.add(next);
				visit(next);
			}
		};
		visit(entry.fileName);
		out[entry.name] = [...seen].sort().map((file) => `/${file}`);
	}
	return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
